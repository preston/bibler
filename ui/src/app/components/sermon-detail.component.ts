// Author: Preston Lee

import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Observable } from 'rxjs';
import { BookBasedComponent } from './bookBased.component';
import { SermonsService } from '../services/sermons.service';
import { SessionService } from '../services/session.service';
import { ToastService } from '../services/toast.service';
import { Verse } from '../models/verse';
import { Sermon, SermonSection, SermonSectionVerse } from '../models/sermon';
import { DocumentsService } from '../services/documents.service';
import { DocumentExtractionService, EXTRACTED_TEXT_WARN_BYTES } from '../services/document-extraction.service';
import { DocumentRecord } from '../models/sermon';

@Component({
  selector: 'app-sermon-detail',
  templateUrl: 'sermon-detail.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SermonDetailComponent extends BookBasedComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sermonsService = inject(SermonsService);
  readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly documentsService = inject(DocumentsService);
  private readonly documentExtraction = inject(DocumentExtractionService);

  sermonUuid = signal<string>('');
  sermon = signal<Sermon | null>(null);
  sections = signal<SermonSection[]>([]);
  selectedSectionUuid = signal<string | null>(null);
  loading = signal(false);
  error = signal('');

  verses = signal<Verse[]>([]);

  aiMessage = signal('');
  aiDocumentUuids = signal<string[]>([]);
  documentSearchQuery = signal('');
  documentSearchMatches = signal<DocumentRecord[]>([]);
  versePassLoading = signal(false);
  outlinePassLoading = signal(false);
  removingAllSections = signal(false);
  aiError = signal('');
  outlinePreview = signal<unknown>(null);
  attachWarn = signal('');
  pendingConfirmation = signal<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  readonly canEdit = computed(() => {
    const s = this.sermon();
    const u = this.session.user();
    if (!s || !u) return false;
    if (this.session.hasCurationPermission()) return true;
    const o = s.owner;
    if (!o) return false;
    return u.username === o.username || String(u.id) === String(o.id);
  });

  readonly selectedSection = computed(() => {
    const id = this.selectedSectionUuid();
    if (!id) return null;
    return this.sections().find((x) => x.uuid === id) ?? null;
  });

  /** Sum of section target minutes (missing or non-positive counts as 0). */
  readonly totalSectionEstimatedMinutes = computed(() =>
    this.sections().reduce((sum, sec) => sum + (this.sectionDisplayMinutes(sec) ?? 0), 0)
  );

  constructor() {
    super();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const id = p.get('uuid');
      if (id) {
        this.sermonUuid.set(id);
        this.loadAll();
      }
    });

    effect(() => {
      const q = this.documentSearchQuery().trim();
      if (q.length < 2) {
        this.documentSearchMatches.set([]);
        return;
      }
      this.documentsService.list(q).subscribe({
        next: (r) => this.documentSearchMatches.set(r.documents ?? []),
        error: () => this.documentSearchMatches.set([])
      });
    });
  }

  ngOnInit(): void {}

  /**
   * Coerce API/local values to whole minutes (matches server integer column).
   * Returns null if unset or not a positive finite number after coercion.
   */
  private normalizedEstimatedMinutes(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }

  /** Positive minutes for display and summing; null if unset or not positive. */
  sectionDisplayMinutes(sec: SermonSection): number | null {
    return this.normalizedEstimatedMinutes(sec.estimated_minutes);
  }

  formatMinutesLabel(minutes: number | null | undefined): string {
    if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '';
    return `${minutes}m`;
  }

  /** When sermon has a target, difference (target − total); positive = under, negative = over. */
  durationDeltaVsSermonTarget(): number | null {
    const t = this.sermon()?.target_duration_minutes;
    const target = typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
    if (target === null) return null;
    return target - this.totalSectionEstimatedMinutes();
  }

  override afterBibleLoad(): void {}

  override afterBibleSelect(): void {}

  override selectChapter(n: number): void {
    this.chapter.set(n);
    const bible = this.bible();
    const book = this.book();
    if (bible && book) {
      this.verseService.index(bible, book, n).subscribe({
        next: (d: Verse[]) => this.verses.set(d),
        error: () => this.verses.set([])
      });
    }
  }

  loadAll(): void {
    const id = this.sermonUuid();
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    this.sermonsService.show(id).subscribe({
      next: (r) => {
        this.sermon.set(r.sermon);
        this.reloadSections();
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load sermon.');
        this.loading.set(false);
      }
    });
  }

  reloadSections(): void {
    const id = this.sermonUuid();
    if (!id) return;
    this.sermonsService.sections(id).subscribe({
      next: (r) => {
        const list = r.sermon_sections ?? [];
        this.sections.set(list);
        const sel = this.selectedSectionUuid();
        const stillThere = !!(sel && list.some((x) => x.uuid === sel));
        if (!stillThere) {
          this.selectedSectionUuid.set(list[0]?.uuid ?? null);
        }
      },
      error: () => this.sections.set([])
    });
  }

  selectSection(uuid: string): void {
    this.selectedSectionUuid.set(uuid);
  }

  readerDeepLink(sv: SermonSectionVerse): string {
    const params = new URLSearchParams({
      bible: sv.bible_uuid,
      book: sv.book_uuid,
      chapter: String(sv.chapter),
      verse: String(sv.ordinal)
    });
    return `/reader?${params.toString()}`;
  }

  comparatorDeepLink(sv: SermonSectionVerse): string {
    const params = new URLSearchParams({
      bible: sv.bible_uuid,
      book: sv.book_uuid,
      chapter: String(sv.chapter),
      verse: String(sv.ordinal)
    });
    return `/comparator?${params.toString()}`;
  }

  bookLabel(bookUuid: string): string {
    return this.books().find((b) => b.uuid === bookUuid)?.name ?? '—';
  }

  addVerseFromBrowser(v: Verse): void {
    const sid = this.selectedSectionUuid();
    const sermonId = this.sermonUuid();
    if (!sid || !sermonId || !this.canEdit()) return;
    const sec = this.selectedSection();
    const pos = sec?.sermon_section_verses?.length ?? 0;
    this.sermonsService
      .createSectionVerse(sermonId, sid, { verse_uuid: v.uuid, position: pos })
      .subscribe({
        next: () => {
          this.toast.success('Verse added.');
          this.reloadSections();
        },
        error: () => this.toast.danger('Could not add verse.')
      });
  }

  deleteSectionVerse(sv: SermonSectionVerse): void {
    const sec = this.selectedSection();
    const sermonId = this.sermonUuid();
    if (!sec || !sermonId || !this.canEdit()) return;
    this.openConfirmation(
      'Remove verse?',
      'Remove this verse from the section?',
      () => {
        this.sermonsService.destroySectionVerse(sermonId, sec.uuid, sv.uuid).subscribe({
          next: () => {
            this.toast.success('Verse removed.');
            this.reloadSections();
          },
          error: () => this.toast.danger('Could not remove verse.')
        });
      },
      'Remove'
    );
  }

  deleteSection(sec: SermonSection, ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    const sermonId = this.sermonUuid();
    if (!sermonId || !this.canEdit()) return;
    const label = sec.title?.trim() || 'Untitled section';
    this.openConfirmation(
      'Delete section?',
      `Delete section “${label}”? Verses in this section will be removed.`,
      () => {
        this.sermonsService.destroySection(sermonId, sec.uuid).subscribe({
          next: () => {
            this.toast.success('Section deleted.');
            this.reloadSections();
          },
          error: () => this.toast.danger('Could not delete section.')
        });
      }
    );
  }

  removeAllSections(): void {
    const sermonId = this.sermonUuid();
    const list = this.sections();
    if (!sermonId || !this.canEdit() || list.length === 0) return;
    const n = list.length;
    this.openConfirmation(
      'Remove all sections?',
      `Remove all ${n} sections? Their content and scripture will be deleted. This cannot be undone.`,
      () => {
        this.removingAllSections.set(true);
        forkJoin(list.map((sec) => this.sermonsService.destroySection(sermonId, sec.uuid))).subscribe({
          next: () => {
            this.removingAllSections.set(false);
            this.toast.success('All sections removed.');
            this.reloadSections();
          },
          error: () => {
            this.removingAllSections.set(false);
            this.toast.danger('Could not remove all sections.');
            this.reloadSections();
          }
        });
      },
      'Remove all'
    );
  }

  deleteSermon(): void {
    const id = this.sermonUuid();
    const title = this.sermon()?.title?.trim() || 'this sermon';
    if (!id || !this.canEdit()) return;
    this.openConfirmation(
      'Delete sermon?',
      `Delete “${title}” permanently? This cannot be undone.`,
      () => {
        this.sermonsService.destroy(id).subscribe({
          next: () => {
            this.toast.success('Sermon deleted.');
            void this.router.navigate(['/sermons']);
          },
          error: () => this.toast.danger('Could not delete sermon.')
        });
      }
    );
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();
    if (!pending) return;
    this.pendingConfirmation.set(null);
    pending.onConfirm();
  }

  private openConfirmation(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmLabel = 'Delete'
  ): void {
    this.pendingConfirmation.set({ title, message, confirmLabel, onConfirm });
  }

  saveSectionBody(): void {
    const sec = this.selectedSection();
    const sermonId = this.sermonUuid();
    if (!sec || !sermonId || !this.canEdit()) return;
    this.sermonsService
      .updateSection(sermonId, sec.uuid, {
        body: sec.body ?? '',
        title: sec.title,
        estimated_minutes: sec.estimated_minutes ?? undefined
      })
      .subscribe({
        next: () => this.toast.success('Saved.'),
        error: () => this.toast.danger('Save failed.')
      });
  }

  saveSermonMeta(): void {
    const s = this.sermon();
    const id = this.sermonUuid();
    if (!s || !id || !this.canEdit()) return;
    this.sermonsService
      .update(id, {
        title: s.title,
        visibility: s.visibility,
        target_duration_minutes: s.target_duration_minutes ?? undefined
      })
      .subscribe({
        next: (r) => {
          this.sermon.set(r.sermon);
          this.toast.success('Saved.');
        },
        error: () => this.toast.danger('Save failed.')
      });
  }

  async onAttachDocuments(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    let total = 0;
    const parts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { text, error } = await this.documentExtraction.extractText(f);
      if (error) {
        this.toast.danger(error);
        continue;
      }
      parts.push(text);
    }
    const combined = parts.join('\n\n');
    total = this.documentExtraction.totalUtf8Bytes(combined);
    if (total > EXTRACTED_TEXT_WARN_BYTES) {
      this.attachWarn.set(
        `Extracted text is about ${Math.round(total / 1024)} KB. Maximum recommended is 128 KB — reduce attachments or split content before saving as a document.`
      );
      input.value = '';
      return;
    }
    this.attachWarn.set('');
    if (!combined.trim()) {
      input.value = '';
      return;
    }
    const name = files.length === 1 ? files[0].name : `batch-${files.length}-documents.txt`;
    this.documentsService.create({ original_filename: name, extracted_text: combined }).subscribe({
      next: (r) => {
        this.aiDocumentUuids.update((xs) => [...xs, r.document.uuid]);
        this.toast.success('Document saved.');
        input.value = '';
      },
      error: () => this.toast.danger('Could not save document.')
    });
  }

  addLibraryDocumentToAi(f: DocumentRecord): void {
    this.aiDocumentUuids.update((xs) => (xs.includes(f.uuid) ? xs : [...xs, f.uuid]));
    this.documentSearchQuery.set('');
    this.documentSearchMatches.set([]);
  }

  removeAiDocumentUuid(uuid: string): void {
    this.aiDocumentUuids.update((xs) => xs.filter((u) => u !== uuid));
  }

  runVersePass(): void {
    const id = this.sermonUuid();
    if (!id || !this.canEdit()) return;
    this.versePassLoading.set(true);
    this.aiError.set('');
    const target = this.sermon()?.target_duration_minutes;
    this.sermonsService
      .versePass(id, {
        message: this.aiMessage(),
        document_uuids: this.aiDocumentUuids(),
        replace_sections: true,
        target_duration_minutes:
          typeof target === 'number' && Number.isFinite(target) && target > 0 ? target : undefined
      })
      .subscribe({
        next: (res) => {
          this.versePassLoading.set(false);
          const err = res['error'] as string | undefined;
          if (err) {
            this.aiError.set(err);
            return;
          }
          this.toast.success('Round 1 complete — review sections and verses.');
          this.reloadSections();
        },
        error: (e) => {
          this.versePassLoading.set(false);
          const msg = e?.error?.error ?? 'Verse pass failed.';
          this.aiError.set(typeof msg === 'string' ? msg : 'Verse pass failed.');
        }
      });
  }

  runOutlinePass(): void {
    const id = this.sermonUuid();
    if (!id || !this.canEdit()) return;
    this.outlinePassLoading.set(true);
    this.aiError.set('');
    this.outlinePreview.set(null);
    const target = this.sermon()?.target_duration_minutes;
    this.sermonsService
      .outlinePass(id, {
        message: this.aiMessage(),
        document_uuids: this.aiDocumentUuids(),
        target_duration_minutes:
          typeof target === 'number' && Number.isFinite(target) && target > 0 ? target : undefined
      })
      .subscribe({
        next: (res) => {
          this.outlinePassLoading.set(false);
          const err = res['error'] as string | undefined;
          if (err) {
            this.aiError.set(err);
            return;
          }
          this.outlinePreview.set(res);
          const secs = res['sections'] as Array<Record<string, unknown>> | undefined;
          if (secs?.length) {
            this.applyOutlineSections(secs);
          }
        },
        error: (e) => {
          this.outlinePassLoading.set(false);
          const msg = e?.error?.error ?? 'Outline pass failed.';
          this.aiError.set(typeof msg === 'string' ? msg : 'Outline pass failed.');
        }
      });
  }

  private applyOutlineSections(secs: Array<Record<string, unknown>>): void {
    const sermonId = this.sermonUuid();
    if (!sermonId) return;
    const updates: Observable<{ sermon_section: SermonSection }>[] = [];
    for (const row of secs) {
      const suid = String(row['section_uuid'] ?? row['sectionUuid'] ?? '');
      const title = String(row['title'] ?? '');
      const body = String(row['body'] ?? '');
      const em = row['estimated_minutes'];
      const parsed = typeof em === 'number' ? em : em != null ? Number(em) : NaN;
      let estimatedPatch: number | undefined = undefined;
      if (Number.isFinite(parsed)) {
        const rounded = Math.round(parsed);
        if (rounded > 0) estimatedPatch = rounded;
      }
      if (!suid) continue;
      updates.push(
        this.sermonsService.updateSection(sermonId, suid, {
          title: title || undefined,
          body,
          estimated_minutes: estimatedPatch
        })
      );
    }
    if (updates.length === 0) {
      this.reloadSections();
      return;
    }
    forkJoin(updates).subscribe({
      next: () => {
        this.toast.success('Outline applied to sections.');
        this.reloadSections();
      },
      error: () => {
        this.toast.danger('Some section updates failed.');
        this.reloadSections();
      }
    });
  }

  onSectionTitleChange(text: string): void {
    const id = this.selectedSectionUuid();
    if (!id) return;
    this.sections.update((list) => list.map((s) => (s.uuid === id ? { ...s, title: text } : s)));
  }

  onSectionBodyChange(text: string): void {
    const id = this.selectedSectionUuid();
    if (!id) return;
    this.sections.update((list) => list.map((s) => (s.uuid === id ? { ...s, body: text } : s)));
  }

  onSectionEstimatedMinutesChange(value: unknown): void {
    const id = this.selectedSectionUuid();
    if (!id) return;
    let minutes: number | null = null;
    if (value === '' || value === null || value === undefined) {
      minutes = null;
    } else {
      const n = typeof value === 'number' ? value : Number(value);
      minutes = Number.isFinite(n) && n >= 0 ? n : null;
    }
    this.sections.update((list) =>
      list.map((s) => (s.uuid === id ? { ...s, estimated_minutes: minutes } : s))
    );
  }

  patchSermon(partial: Partial<Sermon>): void {
    const cur = this.sermon();
    if (!cur) return;
    this.sermon.set({ ...cur, ...partial });
  }

  addSection(): void {
    const sermonId = this.sermonUuid();
    if (!sermonId || !this.canEdit()) return;
    const pos = this.sections().length;
    this.sermonsService
      .createSection(sermonId, { title: `Section ${pos + 1}`, body: '', position: pos })
      .subscribe({
        next: (r) => {
          this.selectedSectionUuid.set(r.sermon_section.uuid);
          this.reloadSections();
        },
        error: () => this.toast.danger('Could not add section.')
      });
  }
}
