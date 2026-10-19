// Author: Preston Lee

import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { STUDY_DETAIL_API } from './study-detail-api.token';
import { Observable, Subscription, concatMap, EMPTY, filter, finalize, from, map, merge, of, switchMap, tap } from 'rxjs';
import { BibleService } from '../services/bible.service';
import { BookService } from '../services/book.service';
import { VerseService } from '../services/verse.service';
import { StudiesService } from '../services/studies.service';
import { ToastService } from '../services/toast.service';
import { SessionService } from '../services/session.service';
import { StudiesUiStateService } from '../services/studies-ui-state.service';
import { Bible } from '../models/bible';
import { Book } from '../models/book';
import { Verse } from '../models/verse';
import {
  Study,
  StudyAnswer,
  StudyAssignment,
  StudyPlanItem,
  StudyAssistantSuggestion,
  StudyVerse,
  StudyCommentary,
  StudyQuestion,
  StudyMode,
  StudyTask,
  StudyVisibility,
  defaultStudyViewMode
} from '../models/study';

@Component({
  selector: 'app-study-detail',
  templateUrl: 'study-detail.html',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, RouterOutlet, RouterLink, RouterLinkActive],
  providers: [{ provide: STUDY_DETAIL_API, useExisting: StudyDetailComponent }]
})
export class StudyDetailComponent implements OnInit, OnDestroy {
  private readonly allowedSuggestionTypes: StudyAssistantSuggestion['type'][] = [
    'add_verse',
    'add_commentary',
    'add_question',
    'add_task',
    'add_worship'
  ];

  private readonly studiesUiState = inject(StudiesUiStateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  /** Same signal as {@link StudiesUiStateService.studyMode} — survives route-driven remounts. */
  readonly studyMode = this.studiesUiState.studyMode;

  study = signal<Study | null>(null);
  studyUuidInput = signal('');
  editTitle = signal('');
  editGoal = signal('');
  editVisibility = signal<StudyVisibility>('private');
  /** Brief hint after copy-to-clipboard */
  copyFeedback = signal('');
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;

  bibles = signal<Bible[]>([]);
  books = signal<Book[]>([]);
  chapters = signal<number[]>([]);
  verses = signal<Verse[]>([]);

  selectedBibleUuid = signal<string>('');
  selectedBookUuid = signal<string>('');
  selectedChapter = signal<number>(1);

  studyVerses = signal<StudyVerse[]>([]);
  /** Book names by book UUID for saved verses (verses may use any bible; `books()` only lists the reader picker bible). */
  studyVerseBookNamesByUuid = signal<Record<string, string>>({});
  private bibleUuidsBookListFetched = new Set<string>();
  private bibleUuidsBookListInFlight = new Set<string>();
  commentaries = signal<StudyCommentary[]>([]);
  questions = signal<StudyQuestion[]>([]);
  tasks = signal<StudyTask[]>([]);
  planItems = signal<StudyPlanItem[]>([]);
  /** True while batch-updating plan item statuses (Mark All). */
  markingAllPlanProgress = signal(false);
  selectedPlanItemUuid = signal<string>('');
  answersByQuestion = signal<Record<string, StudyAnswer[]>>({});
  studyVerseNoteDrafts = signal<Record<string, string>>({});
  commentaryDrafts = signal<Record<string, { title: string; body: string; prompt: string }>>({});
  questionDrafts = signal<Record<string, { prompt: string; question_type: string; guidance_notes: string }>>({});
  taskDrafts = signal<Record<string, { instruction: string; task_type: string; assignee_label: string }>>({});
  planItemDrafts = signal<Record<string, { title: string; notes: string; lyrics: string; duration: string }>>({});

  commentaryTitle = signal('');
  commentaryBody = signal('');
  commentaryPrompt = signal('');
  aiCommand = signal('');
  aiOutput = signal('');

  questionPrompt = signal('');
  questionType = signal('discussion');
  questionGuidance = signal('');

  taskInstruction = signal('');
  taskType = signal('discussion');
  taskAssignee = signal('');

  answerDrafts = signal<Record<string, string>>({});
  error = signal('');
  loading = signal(false);
  pendingConfirmation = signal<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  studyAssignments = signal<StudyAssignment[]>([]);
  accessSectionLoading = signal(false);
  newCoLeaderInput = signal('');
  transferOwnerUserId = signal<string>('');

  assistantMessage = signal('');
  /** When set to a positive integer, server scales suggestion durations to sum to this many minutes. */
  assistantTargetDurationMinutes = signal<number | null>(null);
  assistantSuggestions = signal<StudyAssistantSuggestion[]>([]);
  dismissedSuggestionIds = signal<Set<string>>(new Set());
  assistantLoading = signal(false);
  assistantError = signal('');
  /** Short status line while the streaming assistant runs */
  assistantActivityPhase = signal('');
  /** Human-readable search summary after plan / DB search */
  assistantSearchSummary = signal('');

  private assistantRunSub: Subscription | undefined;
  private openStudyRequestSeq = 0;
  private workspaceLoadSeq = 0;
  private booksLoadSeq = 0;
  private chaptersLoadSeq = 0;
  private versesLoadSeq = 0;

  visibleAssistantSuggestions = computed(() => {
    const dismissed = this.dismissedSuggestionIds();
    return this.assistantSuggestions().filter((s) => !dismissed.has(s.id));
  });

  selectedPlanItem = computed(() => this.planItems().find((x) => x.uuid === this.selectedPlanItemUuid()) ?? null);
  readonly visibleStudyVerses = computed(() => this.scopeContentToSelectedStep(this.studyVerses(), 'verse'));
  readonly visibleCommentaries = computed(() => this.scopeContentToSelectedStep(this.commentaries(), 'commentary'));
  readonly visibleQuestions = computed(() => this.scopeContentToSelectedStep(this.questions(), 'question'));
  readonly visibleTasks = computed(() => this.scopeContentToSelectedStep(this.tasks(), 'task'));

  /** Previous step in plan order when viewing a plan item; null if none. */
  readonly planItemNavPrevious = computed((): StudyPlanItem | null => {
    const items = this.planItems();
    const sel = this.selectedPlanItemUuid();
    if (!sel) return null;
    const idx = items.findIndex((x) => x.uuid === sel);
    if (idx <= 0) return null;
    return items[idx - 1] ?? null;
  });

  /** Next step in plan order when viewing a plan item; null if none. */
  readonly planItemNavNext = computed((): StudyPlanItem | null => {
    const items = this.planItems();
    const sel = this.selectedPlanItemUuid();
    if (!sel) return null;
    const idx = items.findIndex((x) => x.uuid === sel);
    if (idx < 0 || idx >= items.length - 1) return null;
    return items[idx + 1] ?? null;
  });

  /** True when viewing a plan item and at least one of Previous/Next applies. */
  readonly showPlanItemStepNav = computed(
    () => this.selectedPlanItem() != null && (this.planItemNavPrevious() != null || this.planItemNavNext() != null)
  );

  /** `ngTemplateOutlet` context: margin above step content. */
  readonly planItemStepNavContextTop = { marginClass: 'mb-3' };
  /** `ngTemplateOutlet` context: margin below step content. */
  readonly planItemStepNavContextBottom = { marginClass: 'mt-3' };

  readonly totalEstimatedMinutes = computed(() =>
    this.planItems().reduce((sum, item) => sum + (this.itemDisplayDuration(item) ?? 0), 0)
  );
  readonly remainingEstimatedMinutes = computed(() =>
    this.planItems().reduce((sum, item) => {
      if ((item.my_status ?? 'todo') === 'complete') return sum;
      return sum + (this.itemDisplayDuration(item) ?? 0);
    }, 0)
  );

  /** URL snapshot for workspace context (AI helper blurbs). */
  private readonly studyWorkspaceUrl = toSignal(
    merge(of(null), this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))).pipe(
      map(() => this.router.url.split('?')[0])
    ),
    { initialValue: this.router.url.split('?')[0] }
  );

  /**
   * What the main panel is focused on for Study AI copy: study-level, a workspace browse route, or a step route.
   * Replaces the old selectedPlanItem + detailPaneMode heuristic.
   */
  readonly planWorkspaceContextKind = computed((): 'study' | StudyPlanItem['item_type'] => {
    const st = this.study();
    if (!st) return 'study';
    const tree = this.router.parseUrl(this.studyWorkspaceUrl());
    const primary = tree.root.children['primary'];
    if (!primary) return 'study';
    const segments = primary.segments.map((s) => s.path);
    if (segments[0] !== 'studies' || segments[1] !== st.uuid) return 'study';
    const rest = segments.slice(2);
    if (rest.length === 0) return 'study';
    if (rest[0] === 'ai' || rest[0] === 'details') return 'study';
    if (rest[0] === 'workspace' && rest[1]) return rest[1] as StudyPlanItem['item_type'];
    if (rest[0] === 'step' && rest[2]) return rest[2] as StudyPlanItem['item_type'];
    return 'study';
  });
  /** Bibles available in the reader: server AI defaults only (see study.ai_default_reference_bibles). */
  scopedBibles = computed(() => {
    const st = this.study();
    const all = this.bibles();
    if (!st || all.length === 0) return all;
    const uuids = new Set(this.aiDefaultBibleUuids(st));
    if (uuids.size === 0) return all;
    return all.filter((b) => uuids.has(b.uuid));
  });

  /** Details route / edit UI: leader/co-leader view and server allows editing. */
  readonly showStudyDetailsEdit = computed(() => {
    const m = this.studyMode();
    if (m === 'participant') return false;
    return this.study()?.capabilities.can_edit_structure ?? false;
  });

  /** Sidebar view dropdown options from server RBAC. */
  readonly availableStudyModesList = computed((): StudyMode[] => {
    const s = this.study();
    const modes = s?.available_study_modes;
    return modes?.length ? modes : (['participant'] as StudyMode[]);
  });

  readonly canManageStudyAccess = computed(() => {
    if (this.studyMode() === 'participant') return false;
    const r = this.study()?.my_study_role;
    return r === 'owner' || r === 'co_leader' || r === 'curator';
  });

  readonly canTransferOwnership = computed(() => {
    if (this.studyMode() === 'participant') return false;
    return this.study()?.my_study_role === 'owner';
  });

  constructor(
    private studiesService: StudiesService,
    private bibleService: BibleService,
    private bookService: BookService,
    private verseService: VerseService
  ) {
    effect(() => {
      const verses = this.studyVerses();
      this.bibles();
      if (verses.length === 0) return;
      this.syncStudyVerseBookNameCache(verses);
    });
  }

  private syncStudyVerseBookNameCache(verses: StudyVerse[]): void {
    const uniqueBibleUuids = [...new Set(verses.map((v) => v.bible_uuid))];
    for (const bibleUuid of uniqueBibleUuids) {
      if (this.bibleUuidsBookListFetched.has(bibleUuid) || this.bibleUuidsBookListInFlight.has(bibleUuid)) continue;
      const bible = this.bibles().find((b) => b.uuid === bibleUuid);
      if (!bible) continue;
      this.bibleUuidsBookListInFlight.add(bibleUuid);
      this.bookService.index(bible).subscribe({
        next: (books) => {
          this.bibleUuidsBookListInFlight.delete(bibleUuid);
          this.bibleUuidsBookListFetched.add(bibleUuid);
          this.studyVerseBookNamesByUuid.update((prev) => {
            const next = { ...prev };
            for (const book of books) {
              next[book.uuid] = book.name;
            }
            return next;
          });
        },
        error: () => {
          this.bibleUuidsBookListInFlight.delete(bibleUuid);
        }
      });
    }
  }

  /**
   * In a `step/:planItemUuid/:kind` route, show only the content item matching that step's
   * type-relative index (e.g., 2nd commentary step -> 2nd commentary record).
   * Outside a selected step context, return the full collection.
   */
  private scopeContentToSelectedStep<T extends { position: number }>(
    items: T[],
    itemType: StudyPlanItem['item_type']
  ): T[] {
    const selected = this.selectedPlanItem();
    if (!selected || selected.item_type !== itemType) return items;

    const orderedPlanItems = [...this.planItems()]
      .filter((p) => p.item_type === itemType)
      .sort((a, b) => a.position - b.position);
    const selectedIndex = orderedPlanItems.findIndex((p) => p.uuid === selected.uuid);
    if (selectedIndex < 0) return [];

    const orderedItems = [...items].sort((a, b) => a.position - b.position);
    const matched = orderedItems[selectedIndex];
    return matched ? [matched] : [];
  }

  private syncRouteSub?: Subscription;

  private isViewingStepRoute(studyUuid: string): boolean {
    const tree = this.router.parseUrl(this.router.url.split('?')[0]);
    const primary = tree.root.children['primary'];
    if (!primary) return false;
    const segments = primary.segments.map((s) => s.path);
    return segments[0] === 'studies' && segments[1] === studyUuid && segments[2] === 'step' && !!segments[3] && !!segments[4];
  }

  ngOnDestroy(): void {
    this.cancelAssistantRun();
    this.syncRouteSub?.unsubscribe();
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
  }

  ngOnInit(): void {
    this.bibleService.index().subscribe((bibles) => {
      this.bibles.set(bibles);
      if (bibles.length > 0) {
        this.selectedBibleUuid.set(bibles[0].uuid);
        this.loadBooks();
      }
    });

    this.route.paramMap.subscribe((params) => {
      const uuid = params.get('uuid');
      if (uuid) {
        this.studyUuidInput.set(uuid);
        this.openStudy(uuid);
      }
    });

    this.syncRouteSub = merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
    ).subscribe(() => this.syncSelectionFromUrl());
  }

  /**
   * Keeps sidebar highlight in sync with `step/:planItemUuid/:kind` and clears it for `workspace/*` and the default child.
   */
  private syncSelectionFromUrl(): void {
    const st = this.study();
    if (!st) return;
    const tree = this.router.parseUrl(this.router.url.split('?')[0]);
    const primary = tree.root.children['primary'];
    if (!primary) return;
    const segments = primary.segments.map((s) => s.path);
    if (segments[0] !== 'studies' || segments[1] !== st.uuid) return;
    const rest = segments.slice(2);
    if (rest[0] === 'step' && rest[1] && rest[2]) {
      const uuid = rest[1];
      const kind = rest[2];
      const items = this.planItems();
      if (items.length === 0) return;
      const item = items.find((p) => p.uuid === uuid);
      if (!item) {
        this.toast.danger('Plan step not found.');
        void this.router.navigate(['/studies', st.uuid], { replaceUrl: true });
        return;
      }
      if (item.item_type !== kind) {
        void this.router.navigate(['/studies', st.uuid, 'step', uuid, item.item_type], { replaceUrl: true });
        return;
      }
      this.selectedPlanItemUuid.set(uuid);
      return;
    }
    if (rest[0] === 'workspace' || rest.length === 0) {
      this.selectedPlanItemUuid.set('');
    }
  }

  changeStudyMode(mode: StudyMode): void {
    const st = this.study();
    const allowed = st?.available_study_modes ?? (['participant'] as StudyMode[]);
    const next = allowed.includes(mode) ? mode : (allowed[0] ?? 'participant');
    this.studyMode.set(next);
    if (next === 'participant') {
      const tree = this.router.parseUrl(this.router.url);
      const primary = tree.root.children['primary'];
      const segments = primary?.segments.map((s) => s.path) ?? [];
      if (
        segments.length >= 3 &&
        segments[0] === 'studies' &&
        (segments[2] === 'ai' || segments[2] === 'details')
      ) {
        void this.router.navigate(['/studies', segments[1]], { replaceUrl: true });
      }
    }
  }

  openStudy(studyUuid?: string): void {
    const requestSeq = ++this.openStudyRequestSeq;
    const uuid = (studyUuid ?? this.studyUuidInput()).trim();
    if (!uuid) return;
    this.loading.set(true);
    this.studiesService.show(uuid).subscribe({
      next: (response) => {
        if (requestSeq !== this.openStudyRequestSeq) return;
        this.loading.set(false);
        this.study.set(response.study);
        this.studyUuidInput.set(response.study.uuid);
        this.editTitle.set(response.study.title ?? '');
        this.editGoal.set(response.study.goal ?? '');
        this.editVisibility.set(response.study.visibility ?? 'private');
        const allowed = response.study.available_study_modes ?? (['participant'] as StudyMode[]);
        let mode = this.studyMode();
        if (!allowed.includes(mode)) {
          mode = defaultStudyViewMode(response.study);
          this.studyMode.set(mode);
        }
        const tree = this.router.parseUrl(this.router.url);
        const primary = tree.root.children['primary'];
        const segments = primary?.segments.map((s) => s.path) ?? [];
        const studyPathOnly =
          segments.length === 2 && segments[0] === 'studies' && segments[1] === response.study.uuid;
        if (studyPathOnly) {
          if (mode === 'leader' || mode === 'co-leader') {
            void this.router.navigate(['/studies', response.study.uuid, 'ai'], { replaceUrl: true });
          } else {
            void this.router.navigate(['/studies', response.study.uuid], { replaceUrl: true });
          }
        }
        {
          const segs = this.router.parseUrl(this.router.url.split('?')[0]).root.children['primary']?.segments.map((s) => s.path) ?? [];
          if (
            segs[0] === 'studies' &&
            segs[1] === response.study.uuid &&
            (segs[2] === 'details' || segs[2] === 'ai') &&
            mode === 'participant'
          ) {
            void this.router.navigate(['/studies', response.study.uuid], { replaceUrl: true });
          }
        }
        this.loadBooks();
        this.loadStudyWorkspace(response.study.uuid, {
          selectFirstPlanOnOpenForParticipant:
            mode === 'participant' &&
            !this.selectedPlanItemUuid() &&
            !this.isViewingStepRoute(response.study.uuid)
        });
        this.refreshStudyAssignments(response.study);
      },
      error: () => {
        if (requestSeq !== this.openStudyRequestSeq) return;
        this.loading.set(false);
        this.error.set('Study could not be opened.');
      }
    });
  }

  saveStudyDetails(): void {
    const st = this.study();
    if (!st) return;
    this.loading.set(true);
    this.studiesService.update(
      st.uuid,
      {
        title: this.editTitle().trim(),
        goal: this.editGoal().trim(),
        visibility: this.editVisibility()
      }
    ).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.study.set(response.study);
        this.editTitle.set(response.study.title ?? '');
        this.editGoal.set(response.study.goal ?? '');
        this.editVisibility.set(response.study.visibility ?? 'private');
        this.toast.success('Saved.');
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not save study details.');
        this.toast.danger('Could not save study details.');
      }
    });
  }

  loadStudyWorkspace(
    studyUuid: string,
    options?: {
      selectFirstPlanOnOpenForParticipant?: boolean;
      thenNavigate?: { uuid: string; kind: StudyPlanItem['item_type'] };
    }
  ): void {
    const loadSeq = ++this.workspaceLoadSeq;
    this.loadStudyVersesWorkspace(studyUuid, loadSeq);
    this.loadCommentariesWorkspace(studyUuid, loadSeq);
    this.loadQuestionsWorkspace(studyUuid, loadSeq);
    this.loadTasksWorkspace(studyUuid, loadSeq);
    this.studiesService.planItems(studyUuid).subscribe((response) => {
      if (loadSeq !== this.workspaceLoadSeq) return;
      this.planItems.set(response.plan_items);
      const currentSelection = this.selectedPlanItemUuid();
      const selectionStillExists = response.plan_items.some((x) => x.uuid === currentSelection);
      if (
        options?.selectFirstPlanOnOpenForParticipant &&
        this.studyMode() === 'participant' &&
        response.plan_items.length > 0
      ) {
        const first = response.plan_items[0];
        this.selectedPlanItemUuid.set(first.uuid);
        void this.router.navigate(['/studies', studyUuid, 'step', first.uuid, first.item_type], { replaceUrl: true });
      } else if (selectionStillExists) {
        this.selectedPlanItemUuid.set(currentSelection);
      } else {
        this.selectedPlanItemUuid.set(response.plan_items[0]?.uuid ?? '');
      }
      const drafts: Record<string, { title: string; notes: string; lyrics: string; duration: string }> = {};
      for (const p of response.plan_items) {
        drafts[p.uuid] = {
          title: p.title ?? '',
          notes: p.notes ?? '',
          lyrics: p.lyrics ?? '',
          duration: this.durationInputValue(p.duration)
        };
      }
      this.planItemDrafts.set(drafts);
      if (options?.thenNavigate) {
        const { uuid, kind } = options.thenNavigate;
        void this.router.navigate(['/studies', studyUuid, 'step', uuid, kind]).then(() => this.syncSelectionFromUrl());
      } else {
        this.syncSelectionFromUrl();
      }
    });
  }

  private loadStudyVersesWorkspace(studyUuid: string, loadSeq: number): void {
    this.studiesService.studyVerses(studyUuid).subscribe((response) => {
      if (loadSeq !== this.workspaceLoadSeq) return;
      this.studyVerses.set(response.verses);
      const drafts: Record<string, string> = {};
      for (const sv of response.verses) drafts[sv.uuid] = sv.note ?? '';
      this.studyVerseNoteDrafts.set(drafts);
    });
  }

  private loadCommentariesWorkspace(studyUuid: string, loadSeq: number): void {
    this.studiesService.commentaries(studyUuid).subscribe((response) => {
      if (loadSeq !== this.workspaceLoadSeq) return;
      this.commentaries.set(response.commentaries);
      const drafts: Record<string, { title: string; body: string; prompt: string }> = {};
      for (const c of response.commentaries) {
        drafts[c.uuid] = { title: c.title ?? '', body: c.body ?? '', prompt: c.prompt ?? '' };
      }
      this.commentaryDrafts.set(drafts);
    });
  }

  private loadQuestionsWorkspace(studyUuid: string, loadSeq: number): void {
    this.studiesService.questions(studyUuid).subscribe((response) => {
      if (loadSeq !== this.workspaceLoadSeq) return;
      this.questions.set(response.questions);
      const drafts: Record<string, { prompt: string; question_type: string; guidance_notes: string }> = {};
      for (const q of response.questions) {
        drafts[q.uuid] = { prompt: q.prompt ?? '', question_type: q.question_type ?? 'discussion', guidance_notes: q.guidance_notes ?? '' };
      }
      this.questionDrafts.set(drafts);
      response.questions.forEach((question) => this.loadAnswers(question.uuid, loadSeq));
    });
  }

  private loadTasksWorkspace(studyUuid: string, loadSeq: number): void {
    this.studiesService.tasks(studyUuid).subscribe((response) => {
      if (loadSeq !== this.workspaceLoadSeq) return;
      this.tasks.set(response.tasks);
      const drafts: Record<string, { instruction: string; task_type: string; assignee_label: string }> = {};
      for (const t of response.tasks) {
        drafts[t.uuid] = { instruction: t.instruction ?? '', task_type: t.task_type ?? 'discussion', assignee_label: t.assignee_label ?? '' };
      }
      this.taskDrafts.set(drafts);
    });
  }

  loadBooks(): void {
    const requestSeq = ++this.booksLoadSeq;
    const available = this.scopedBibles();
    if (available.length === 0) {
      this.books.set([]);
      this.selectedBookUuid.set('');
      this.chapters.set([]);
      this.verses.set([]);
      return;
    }
    if (!available.some((b) => b.uuid === this.selectedBibleUuid())) {
      this.selectedBibleUuid.set(available[0].uuid);
    }
    const bible = available.find((b) => b.uuid === this.selectedBibleUuid());
    if (!bible) {
      this.books.set([]);
      this.selectedBookUuid.set('');
      this.chapters.set([]);
      this.verses.set([]);
      return;
    }
    const previousBookUuid = this.selectedBookUuid();
    this.bookService.index(bible).subscribe((books) => {
      if (requestSeq !== this.booksLoadSeq) return;
      this.books.set(books);
      if (books.length === 0) {
        this.selectedBookUuid.set('');
        this.chapters.set([]);
        this.verses.set([]);
        return;
      }
      const nextBookUuid = books.some((book) => book.uuid === previousBookUuid) ? previousBookUuid : books[0].uuid;
      this.selectedBookUuid.set(nextBookUuid);
      this.loadChapters();
    });
  }

  onVerseBrowserBibleChange(bibleUuid: string): void {
    this.selectedBibleUuid.set(bibleUuid);
    // Clear dependent dropdown state immediately so UI does not show stale options.
    this.selectedBookUuid.set('');
    this.books.set([]);
    this.chapters.set([]);
    this.verses.set([]);
    this.loadBooks();
  }

  onVerseBrowserBookChange(bookUuid: string): void {
    this.selectedBookUuid.set(bookUuid);
    // Book change invalidates chapter + verse state until refreshed.
    this.chapters.set([]);
    this.verses.set([]);
    this.loadChapters();
  }

  onVerseBrowserChapterChange(chapter: number | string): void {
    this.selectedChapter.set(Number(chapter));
    this.loadVerses();
  }

  loadChapters(): void {
    const bible = this.bibles().find((b) => b.uuid === this.selectedBibleUuid());
    const book = this.books().find((b) => b.uuid === this.selectedBookUuid());
    if (!bible || !book) {
      this.chapters.set([]);
      this.verses.set([]);
      return;
    }
    const requestSeq = ++this.chaptersLoadSeq;
    const previousChapter = this.selectedChapter();
    this.bookService.chaptersFor(bible, book).subscribe((chapters) => {
      if (requestSeq !== this.chaptersLoadSeq) return;
      this.chapters.set(chapters);
      if (chapters.length === 0) {
        this.verses.set([]);
        return;
      }
      const nextChapter = chapters.includes(previousChapter) ? previousChapter : chapters[0];
      this.selectedChapter.set(nextChapter);
      this.loadVerses();
    });
  }

  loadVerses(): void {
    const bible = this.bibles().find((b) => b.uuid === this.selectedBibleUuid());
    const book = this.books().find((b) => b.uuid === this.selectedBookUuid());
    if (!bible || !book) {
      this.verses.set([]);
      return;
    }
    const requestSeq = ++this.versesLoadSeq;
    this.verseService.index(bible, book, this.selectedChapter()).subscribe((verses) => {
      if (requestSeq !== this.versesLoadSeq) return;
      this.verses.set(verses);
    });
  }

  addStudyVerseFromReader(verse: Verse): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService
      .createStudyVerse(
        currentStudy.uuid,
        {
          verse_uuid: verse.uuid,
          note: ''
        }
      )
      .subscribe({
        next: () => {
          this.toast.success('Saved.');
          this.loadStudyWorkspace(currentStudy.uuid);
        },
        error: (err: unknown) => this.toastHttpError(err, 'Could not save verse.')
      });
  }

  createManualCommentary(): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.createCommentary(currentStudy.uuid, {
      source_type: 'manual',
      title: this.commentaryTitle().trim(),
      body: this.commentaryBody().trim(),
      prompt: this.commentaryPrompt().trim(),
      context: {}
    }).subscribe({
      next: () => {
        this.commentaryTitle.set('');
        this.commentaryBody.set('');
        this.commentaryPrompt.set('');
        this.toast.success('Saved.');
        this.loadStudyWorkspace(currentStudy.uuid);
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not create commentary.')
    });
  }

  generateAiCommentary(): void {
    if (!this.showStudyDetailsEdit()) return;
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.aiGenerateCommentary(
      currentStudy.uuid,
      this.aiCommand().trim(),
      this.commentaryPrompt().trim()
    ).subscribe((response) => {
      this.aiOutput.set(response.output ?? response.error ?? '');
      if (response.output) {
        this.studiesService.createCommentary(currentStudy.uuid, {
          source_type: 'ai',
          title: 'AI Generated Commentary',
          body: response.output,
          prompt: this.aiCommand().trim(),
          context: {}
        }).subscribe({
          next: () => {
            this.toast.success('Saved.');
            this.loadStudyWorkspace(currentStudy.uuid);
          },
          error: (err: unknown) => this.toastHttpError(err, 'Could not create commentary.')
        });
      }
    });
  }

  createQuestion(): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.createQuestion(currentStudy.uuid, {
      prompt: this.questionPrompt().trim(),
      question_type: this.questionType(),
      guidance_notes: this.questionGuidance().trim()
    }).subscribe({
      next: () => {
        this.questionPrompt.set('');
        this.questionGuidance.set('');
        this.toast.success('Saved.');
        this.loadStudyWorkspace(currentStudy.uuid);
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not create question.')
    });
  }

  createTask(): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.createTask(currentStudy.uuid, {
      instruction: this.taskInstruction().trim(),
      task_type: this.taskType(),
      status: 'open',
      assignee_label: this.taskAssignee().trim()
    }).subscribe({
      next: () => {
        this.taskInstruction.set('');
        this.taskAssignee.set('');
        this.toast.success('Saved.');
        this.loadStudyWorkspace(currentStudy.uuid);
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not create task.')
    });
  }

  updateTaskStatus(task: StudyTask, status: string): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.updateTask(currentStudy.uuid, task.uuid, { status }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(currentStudy.uuid);
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not update task.')
    });
  }

  moveQuestion(question: StudyQuestion, direction: number): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    const current = [...this.questions()];
    const index = current.findIndex((item) => item.uuid === question.uuid);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;
    this.studiesService.reorderQuestions(currentStudy.uuid, current.map((q) => q.uuid)).subscribe({
      next: (response) => {
        this.questions.set(response.questions);
        this.toast.success('Saved.');
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not reorder questions.')
    });
  }

  moveTask(task: StudyTask, direction: number): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    const current = [...this.tasks()];
    const index = current.findIndex((item) => item.uuid === task.uuid);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;
    this.studiesService.reorderTasks(currentStudy.uuid, current.map((t) => t.uuid)).subscribe({
      next: (response) => {
        this.tasks.set(response.tasks);
        this.toast.success('Saved.');
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not reorder tasks.')
    });
  }

  loadAnswers(questionUuid: string, loadSeq?: number): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    this.studiesService.answers(currentStudy.uuid, questionUuid).subscribe((response) => {
      if (loadSeq !== undefined && loadSeq !== this.workspaceLoadSeq) return;
      this.answersByQuestion.update((current) => ({
        ...current,
        [questionUuid]: response.answers
      }));
    });
  }

  setAnswerDraft(questionUuid: string, value: string): void {
    this.answerDrafts.update((drafts) => ({ ...drafts, [questionUuid]: value }));
  }

  submitAnswer(questionUuid: string): void {
    const currentStudy = this.study();
    if (!currentStudy) return;
    const draft = (this.answerDrafts()[questionUuid] ?? '').trim();
    if (!draft) return;
    this.studiesService.createAnswer(currentStudy.uuid, questionUuid, {
      response: draft,
      visibility: 'study'
    }).subscribe({
      next: () => {
        this.setAnswerDraft(questionUuid, '');
        this.toast.success('Saved.');
        this.loadAnswers(questionUuid);
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not save answer.')
    });
  }

  createPlanItem(): void {
    const st = this.study();
    if (!st) return;
    this.studiesService.createPlanItem(st.uuid, {
      title: 'New plan step',
      item_type: 'custom',
      notes: '',
      duration: this.defaultDurationForItemType('custom')
    }).subscribe({
      next: (r) => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid, {
          thenNavigate: { uuid: r.plan_item.uuid, kind: r.plan_item.item_type }
        });
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not create plan step.')
    });
  }

  createPlanItemOfType(itemType: StudyPlanItem['item_type']): void {
    const st = this.study();
    if (!st) return;
    const titles: Record<StudyPlanItem['item_type'], string> = {
      custom: 'Blank step',
      commentary: 'Commentary step',
      verse: 'Verse step',
      question: 'Discussion step',
      task: 'Task step',
      worship: 'Worship step'
    };
    this.studiesService.createPlanItem(st.uuid, {
      title: titles[itemType],
      item_type: itemType,
      notes: '',
      duration: this.defaultDurationForItemType(itemType)
    }).subscribe({
      next: (r) => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid, {
          thenNavigate: { uuid: r.plan_item.uuid, kind: r.plan_item.item_type }
        });
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not create plan step.')
    });
  }

  movePlanItem(item: StudyPlanItem, direction: number): void {
    const st = this.study();
    if (!st) return;
    const current = [...this.planItems()];
    const i = current.findIndex((x) => x.uuid === item.uuid);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= current.length) return;
    const temp = current[i];
    current[i] = current[j];
    current[j] = temp;
    this.studiesService.reorderPlanItems(st.uuid, current.map((x) => x.uuid)).subscribe({
      next: (r) => {
        this.planItems.set(r.plan_items);
        this.toast.success('Saved.');
      },
      error: (err: unknown) => this.toastHttpError(err, 'Could not reorder plan steps.')
    });
  }

  onPlanDrop(event: CdkDragDrop<StudyPlanItem[]>): void {
    if (!this.canReorderContent() || event.previousIndex === event.currentIndex) return;
    const st = this.study();
    if (!st) return;
    const items = [...this.planItems()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.studiesService.reorderPlanItems(st.uuid, items.map((x) => x.uuid)).subscribe({
      next: (r) => {
        this.planItems.set(r.plan_items);
        this.toast.success('Saved.');
      },
      error: () => {
        this.error.set('Could not reorder plan steps.');
        this.toast.danger('Could not reorder plan steps.');
      }
    });
  }

  setStudyVerseNoteDraft(verseUuid: string, value: string): void {
    this.studyVerseNoteDrafts.update((d) => ({ ...d, [verseUuid]: value }));
  }

  saveStudyVerseNote(sv: StudyVerse): void {
    const st = this.study();
    if (!st) return;
    this.studiesService.updateStudyVerse(st.uuid, sv.uuid, { note: this.studyVerseNoteDrafts()[sv.uuid] ?? '' }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: () => {
        this.error.set('Could not save verse note.');
        this.toast.danger('Could not save verse note.');
      }
    });
  }

  setCommentaryDraft(commentaryUuid: string, field: 'title' | 'body' | 'prompt', value: string): void {
    this.commentaryDrafts.update((d) => ({ ...d, [commentaryUuid]: { ...(d[commentaryUuid] ?? { title: '', body: '', prompt: '' }), [field]: value } }));
  }

  saveCommentary(commentary: StudyCommentary): void {
    const st = this.study();
    if (!st) return;
    const d = this.commentaryDrafts()[commentary.uuid];
    if (!d) return;
    this.studiesService.updateCommentary(st.uuid, commentary.uuid, { title: d.title.trim(), body: d.body.trim(), prompt: d.prompt.trim() }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: () => {
        this.error.set('Could not save commentary.');
        this.toast.danger('Could not save commentary.');
      }
    });
  }

  setQuestionDraft(questionUuid: string, field: 'prompt' | 'question_type' | 'guidance_notes', value: string): void {
    this.questionDrafts.update((d) => ({ ...d, [questionUuid]: { ...(d[questionUuid] ?? { prompt: '', question_type: 'discussion', guidance_notes: '' }), [field]: value } }));
  }

  saveQuestion(question: StudyQuestion): void {
    const st = this.study();
    if (!st) return;
    const d = this.questionDrafts()[question.uuid];
    if (!d) return;
    this.studiesService.updateQuestion(st.uuid, question.uuid, {
      prompt: d.prompt.trim(),
      question_type: d.question_type,
      guidance_notes: d.guidance_notes.trim()
    }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: () => {
        this.error.set('Could not save question.');
        this.toast.danger('Could not save question.');
      }
    });
  }

  setTaskDraft(taskUuid: string, field: 'instruction' | 'task_type' | 'assignee_label', value: string): void {
    this.taskDrafts.update((d) => ({ ...d, [taskUuid]: { ...(d[taskUuid] ?? { instruction: '', task_type: 'discussion', assignee_label: '' }), [field]: value } }));
  }

  saveTask(task: StudyTask): void {
    const st = this.study();
    if (!st) return;
    const d = this.taskDrafts()[task.uuid];
    if (!d) return;
    this.studiesService.updateTask(st.uuid, task.uuid, {
      instruction: d.instruction.trim(),
      task_type: d.task_type,
      assignee_label: d.assignee_label.trim()
    }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: () => {
        this.error.set('Could not save task.');
        this.toast.danger('Could not save task.');
      }
    });
  }

  setPlanItemDraft(planItemUuid: string, field: 'title' | 'notes' | 'lyrics', value: string): void {
    this.planItemDrafts.update((d) => ({
      ...d,
      [planItemUuid]: {
        ...(d[planItemUuid] ?? { title: '', notes: '', lyrics: '', duration: '' }),
        [field]: value
      }
    }));
  }

  setPlanItemDurationDraft(planItemUuid: string, value: string): void {
    this.planItemDrafts.update((d) => ({
      ...d,
      [planItemUuid]: {
        ...(d[planItemUuid] ?? { title: '', notes: '', lyrics: '', duration: '' }),
        duration: value
      }
    }));
  }

  savePlanItem(item: StudyPlanItem): void {
    const st = this.study();
    if (!st) return;
    const d = this.planItemDrafts()[item.uuid];
    if (!d) return;
    this.studiesService.updatePlanItem(st.uuid, item.uuid, {
      title: d.title.trim(),
      notes: d.notes.trim(),
      lyrics: item.item_type === 'worship' ? d.lyrics.trim() : null,
      duration: this.durationPayloadFromInput(d.duration)
    }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: () => {
        this.error.set('Could not save plan item.');
        this.toast.danger('Could not save plan item.');
      }
    });
  }

  openPlanItem(item: StudyPlanItem): void {
    const st = this.study();
    if (!st) return;
    void this.router.navigate(['/studies', st.uuid, 'step', item.uuid, item.item_type]);
  }

  /** Mark the open plan step complete, then go to the next step (requires sign-in). */
  completeCurrentPlanItemAndGoToNext(): void {
    const st = this.study();
    const current = this.selectedPlanItem();
    const next = this.planItemNavNext();
    if (!st || !current || !next || !this.session.isLoggedIn()) return;
    this.studiesService.updatePlanItemState(st.uuid, current.uuid, 'complete').subscribe({
      next: (r) => {
        const ms = r.plan_item.my_status;
        this.planItems.update((items) =>
          items.map((i) => (i.uuid === current.uuid ? { ...i, my_status: ms ?? 'complete' } : i))
        );
        this.openPlanItem(next);
      },
      error: () => this.toast.danger('Could not update progress.')
    });
  }

  closeStudy(): void {
    this.study.set(null);
    this.planItems.set([]);
    this.selectedPlanItemUuid.set('');
    void this.router.navigate(['/studies'], { replaceUrl: true });
  }

  canDeleteStudy(): boolean {
    return this.study()?.capabilities.can_delete_study ?? false;
  }

  deleteEntireStudy(): void {
    const st = this.study();
    if (!st || !this.canDeleteStudy()) return;
    this.openConfirmation(
      'Delete study?',
      'Delete this study and all of its content? This cannot be undone.',
      () => this.performDeleteEntireStudy(st.uuid)
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

  private performDeleteEntireStudy(studyUuid: string): void {
    this.loading.set(true);
    this.studiesService.destroy(studyUuid).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success('Study deleted.');
        this.closeStudy();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not delete study.');
        this.toast.danger('Could not delete study.');
      }
    });
  }

  /** UUIDs from server `ai_default_reference_bibles` (system AI Bibles for this deployment). */
  private aiDefaultBibleUuids(study: Study): string[] {
    const refs = (study.ai_default_reference_bibles ?? {}) as Record<string, unknown>;
    const values = Object.values(refs).filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
    return [...new Set(values.map((v) => String(v['uuid'] ?? '')).filter((s) => !!s))];
  }

  canEditStructure(): boolean {
    if (this.studyMode() === 'participant') return false;
    return this.study()?.capabilities.can_edit_structure ?? false;
  }

  canManageTasks(): boolean {
    if (this.studyMode() === 'participant') return false;
    return this.study()?.capabilities.can_manage_tasks ?? false;
  }

  canReorderContent(): boolean {
    if (this.studyMode() === 'participant') return false;
    return this.study()?.capabilities.can_reorder_content ?? false;
  }

  /**
   * Stop streaming assistant work (e.g. when leaving the AI tab). Avoids leaving `assistantLoading` stuck true.
   */
  cancelAssistantRun(): void {
    this.assistantRunSub?.unsubscribe();
    this.assistantRunSub = undefined;
    this.assistantLoading.set(false);
  }

  setAssistantTargetDurationMinutes(value: number | string | null): void {
    if (value === '' || value === null || value === undefined) {
      this.assistantTargetDurationMinutes.set(null);
      return;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      this.assistantTargetDurationMinutes.set(null);
      return;
    }
    this.assistantTargetDurationMinutes.set(Math.floor(n));
  }

  runStudyAssistant(): void {
    if (!this.showStudyDetailsEdit()) return;
    const st = this.study();
    if (!st) {
      this.toast.danger('Study is not loaded. Open the study again from the list.');
      return;
    }
    const msg = this.assistantMessage().trim();
    if (!msg) {
      this.assistantError.set('Enter a message for the assistant above, then click Get suggestions.');
      return;
    }
    this.assistantLoading.set(true);
    this.assistantError.set('');
    this.dismissedSuggestionIds.set(new Set());
    this.assistantActivityPhase.set('Starting…');
    this.assistantSearchSummary.set('');

    const td = this.assistantTargetDurationMinutes();
    this.assistantRunSub?.unsubscribe();
    this.assistantRunSub = this.studiesService
      .runStudyAssistantStream(st.uuid, msg, {
        targetDurationMinutes: td != null && td > 0 ? td : null
      })
      .subscribe({
        next: (ev) => this.onAssistantSse(ev),
        error: (err: Error) => {
          this.assistantLoading.set(false);
          this.assistantError.set(err?.message ?? 'Assistant request failed.');
          this.assistantSuggestions.set([]);
        },
        complete: () => {
          this.assistantLoading.set(false);
        }
      });
  }

  private onAssistantSse(ev: { event: string; data: Record<string, unknown> }): void {
    switch (ev.event) {
      case 'started':
        this.assistantActivityPhase.set('Working with the assistant…');
        break;
      case 'status': {
        const phase = ev.data['phase'] as string | undefined;
        const message = (ev.data['message'] as string) || '';
        if (message) {
          this.assistantActivityPhase.set(message);
        } else if (phase === 'planning') {
          this.assistantActivityPhase.set('Planning searches…');
        } else if (phase === 'searching') {
          this.assistantActivityPhase.set('Searching your Bibles…');
        } else if (phase === 'drafting') {
          this.assistantActivityPhase.set('Drafting suggestions…');
        }
        break;
      }
      case 'plan': {
        const searches = ev.data['searches'] as Array<{ query_preview?: string; bible_name?: string }> | undefined;
        const n = searches?.length ?? 0;
        this.assistantSearchSummary.set(
          n === 0 ? 'No search phrases in the plan yet.' : `Ready to run ${n} search${n === 1 ? '' : 'es'}.`
        );
        break;
      }
      case 'search_results': {
        const vc = Number(ev.data['verse_count'] ?? 0);
        const byBible = ev.data['by_bible'] as Array<{ bible_uuid?: string; bible_name?: string | null; count?: number }> | undefined;
        const parts =
          byBible?.map((b) => `${b.bible_name || b.bible_uuid || 'Bible'}: ${b.count ?? 0}`) ?? [];
        const errList = ev.data['errors'] as string[] | undefined;
        const errSuffix = errList?.length ? ` (${errList.join('; ')})` : '';
        this.assistantSearchSummary.set(
          `Found ${vc} verse${vc === 1 ? '' : 's'} in the library` +
            (parts.length ? ` — ${parts.join(', ')}` : '') +
            errSuffix
        );
        break;
      }
      case 'complete': {
        const raw = ev.data['suggestions'] ?? ev.data;
        this.assistantSuggestions.set(this.normalizeAssistantSuggestions(raw));
        this.assistantActivityPhase.set('Suggestions ready.');
        break;
      }
      case 'error': {
        const errMsg = (ev.data['error'] as string) || 'Assistant failed.';
        const hint = ev.data['hint'] as string | undefined;
        this.assistantError.set(hint ? `${errMsg} (${hint})` : errMsg);
        this.assistantSuggestions.set([]);
        this.assistantLoading.set(false);
        break;
      }
      default:
        break;
    }
  }

  private normalizeAssistantSuggestions(raw: unknown): StudyAssistantSuggestion[] {
    const list = this.extractSuggestionArray(raw);
    if (list.length === 0) return [];
    let droppedTypeCount = 0;
    const mapped: StudyAssistantSuggestion[] = [];
    list.forEach((item, index) => {
      const o = item as Record<string, unknown>;
      const normalizedType = this.normalizeSuggestionType(o['type']);
      if (!normalizedType) {
        droppedTypeCount += 1;
        return;
      }
      const ordRaw = o['order'];
      const order =
        typeof ordRaw === 'number' && !Number.isNaN(ordRaw)
          ? ordRaw
          : typeof ordRaw === 'string' && ordRaw.trim() !== ''
            ? Number(ordRaw)
            : index;
      mapped.push({
        id: String(o['id'] ?? ''),
        type: normalizedType,
        title: String(o['title'] ?? ''),
        summary: String(o['summary'] ?? ''),
        payload: (o['payload'] as Record<string, unknown>) ?? {},
        duration: this.normalizeDuration(o['duration'] ?? (o['payload'] as Record<string, unknown> | undefined)?.['duration']),
        order: Number.isFinite(order) ? order : index
      });
    });
    if (droppedTypeCount > 0) {
      this.toast.danger(
        `${droppedTypeCount} suggestion${droppedTypeCount === 1 ? '' : 's'} used unsupported type(s) and were ignored.`
      );
    }
    return mapped.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private normalizeSuggestionType(raw: unknown): StudyAssistantSuggestion['type'] | null {
    const token = String(raw ?? '').trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
    const mapped = token as StudyAssistantSuggestion['type'];
    return this.allowedSuggestionTypes.includes(mapped) ? mapped : null;
  }

  private extractSuggestionArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const wrapped = (raw as Record<string, unknown>)['suggestions'];
      if (Array.isArray(wrapped)) return wrapped;
      return [];
    }
    return [];
  }

  dismissSuggestion(id: string): void {
    this.dismissedSuggestionIds.update((set) => new Set(set).add(id));
  }

  /** Dismiss every currently visible suggestion without applying. */
  rejectAllAssistantSuggestions(): void {
    const ids = this.visibleAssistantSuggestions().map((s) => s.id);
    if (ids.length === 0) return;
    this.dismissedSuggestionIds.update((set) => new Set([...set, ...ids]));
  }

  /**
   * Apply visible suggestions in server order (sequential HTTP). Stops on first error.
   * One workspace reload at the end; one success toast.
   */
  acceptAllAssistantSuggestions(): void {
    const st = this.study();
    if (!st) return;
    const ordered = [...this.visibleAssistantSuggestions()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (ordered.length === 0) return;
    from(ordered)
      .pipe(concatMap((s) => this.applySuggestionPipeline(s)))
      .subscribe({
        next: () => {},
        complete: () => {
          this.loadStudyWorkspace(st.uuid);
          this.toast.success('Applied all suggestions.');
        },
        error: () => {
          this.error.set('Could not apply all suggestions.');
          this.toast.danger('Stopped: could not apply a suggestion.');
        }
      });
  }

  /** Create suggested content then plan step; dismiss id on success. */
  private applySuggestionPipeline(s: StudyAssistantSuggestion): Observable<void> {
    const st = this.study();
    if (!st) return EMPTY;
    const p = s.payload;

    if (s.type === 'add_worship') {
      return this.createPlanItemFromSuggestion$(st.uuid, s, { anchor: s.id }).pipe(
        tap(() => this.dismissSuggestion(s.id)),
        map(() => void 0)
      );
    }

    let pipe$: Observable<{ plan_item: StudyPlanItem }>;
    switch (s.type) {
      case 'add_verse': {
        const vu = p['verse_uuid'] != null ? String(p['verse_uuid']).trim() : '';
        const versePayload: Partial<StudyVerse> = vu
          ? { verse_uuid: vu, note: p['note'] != null ? String(p['note']) : '' }
          : {
              bible_uuid: String(p['bible_uuid'] ?? ''),
              book_uuid: String(p['book_uuid'] ?? ''),
              chapter: Number(p['chapter'] ?? 0),
              ordinal: Number(p['ordinal'] ?? 0),
              verse_text: p['verse_text'] != null ? String(p['verse_text']) : null,
              note: p['note'] != null ? String(p['note']) : ''
            };
        pipe$ = this.studiesService.createStudyVerse(st.uuid, versePayload).pipe(
          switchMap((r) => this.createPlanItemFromSuggestion$(st.uuid, s, {
            anchor: s.id,
            resource_type: 'study_verse',
            resource_uuid: r.verse.uuid
          }))
        );
        break;
      }
      case 'add_commentary':
        pipe$ = this.studiesService
          .createCommentary(
            st.uuid,
            {
              source_type: p['source_type'] === 'ai' ? 'ai' : 'manual',
              title: String(p['title'] ?? 'Suggestion'),
              body: p['body'] != null ? String(p['body']) : null,
              prompt: p['prompt'] != null ? String(p['prompt']) : null,
              context: {}
            }
          )
          .pipe(
            switchMap((r) => this.createPlanItemFromSuggestion$(st.uuid, s, {
              anchor: s.id,
              resource_type: 'study_commentary',
              resource_uuid: r.commentary.uuid
            }))
          );
        break;
      case 'add_question':
        pipe$ = this.studiesService
          .createQuestion(
            st.uuid,
            {
              prompt: String(p['prompt'] ?? ''),
              question_type: String(p['question_type'] ?? 'discussion'),
              guidance_notes: p['guidance_notes'] != null ? String(p['guidance_notes']) : ''
            }
          )
          .pipe(
            switchMap((r) => this.createPlanItemFromSuggestion$(st.uuid, s, {
              anchor: s.id,
              resource_type: 'study_question',
              resource_uuid: r.question.uuid
            }))
          );
        break;
      case 'add_task':
        pipe$ = this.studiesService
          .createTask(
            st.uuid,
            {
              instruction: String(p['instruction'] ?? ''),
              task_type: String(p['task_type'] ?? 'discussion'),
              status: String(p['status'] ?? 'open'),
              assignee_label: p['assignee_label'] != null ? String(p['assignee_label']) : null
            }
          )
          .pipe(
            switchMap((r) => this.createPlanItemFromSuggestion$(st.uuid, s, {
              anchor: s.id,
              resource_type: 'study_task',
              resource_uuid: r.task.uuid
            }))
          );
        break;
      default:
        this.toast.danger(`Unsupported suggestion type "${s.type}" was ignored.`);
        return EMPTY;
    }

    return pipe$.pipe(
      tap(() => this.dismissSuggestion(s.id)),
      map(() => void 0)
    );
  }

  applySuggestion(s: StudyAssistantSuggestion): void {
    const st = this.study();
    if (!st) return;
    const onErr = (): void => {
      this.error.set('Could not apply suggestion.');
      this.toast.danger('Could not apply suggestion.');
    };
    this.applySuggestionPipeline(s).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.loadStudyWorkspace(st.uuid);
      },
      error: onErr
    });
  }

  private createPlanItemFromSuggestion$(
    studyUuid: string,
    s: StudyAssistantSuggestion,
    extraFields: Partial<StudyPlanItem> = {}
  ): Observable<{ plan_item: StudyPlanItem }> {
    const typeMap: Record<StudyAssistantSuggestion['type'], StudyPlanItem['item_type']> = {
      add_verse: 'verse',
      add_commentary: 'commentary',
      add_question: 'question',
      add_task: 'task',
      add_worship: 'worship'
    };
    const kind = typeMap[s.type] || 'custom';
    return this.studiesService.createPlanItem(
      studyUuid,
      {
        title: s.title || 'Study step',
        item_type: kind,
        notes: s.summary,
        duration: this.normalizeDuration(s.duration) ?? this.defaultDurationForItemType(kind),
        ...extraFields
      }
    );
  }

  itemDisplayDuration(item: StudyPlanItem): number | null {
    const minutes = this.normalizeDuration(item.duration);
    if (minutes === null || minutes <= 0) return null;
    return minutes;
  }

  formatMinutes(minutes: number | null | undefined): string {
    if (!minutes || minutes <= 0) return '';
    return `${minutes}m`;
  }

  /** Bootstrap Icons class list (includes `bi`) for plan step kind in the sidebar. */
  planItemTypeIconClasses(kind: StudyPlanItem['item_type']): string {
    const map: Record<StudyPlanItem['item_type'], string> = {
      verse: 'bi bi-book',
      commentary: 'bi bi-chat-left-text',
      question: 'bi bi-question-circle',
      task: 'bi bi-check2-square',
      custom: 'bi bi-puzzle',
      worship: 'bi bi-music-note-beamed'
    };
    return map[kind] ?? 'bi bi-circle';
  }

  planItemTypeLabel(kind: StudyPlanItem['item_type']): string {
    const map: Record<StudyPlanItem['item_type'], string> = {
      verse: 'Verse',
      commentary: 'Commentary',
      question: 'Question',
      task: 'Task',
      custom: 'Blank',
      worship: 'Worship'
    };
    return map[kind] ?? kind;
  }

  /** Return URL for login redirect back to this study view */
  returnUrlForLogin(): string {
    return this.router.url;
  }

  private static readonly PLAN_PROGRESS_ORDER: Array<'todo' | 'revisit' | 'complete'> = ['todo', 'complete', 'revisit'];

  planProgressIcon(item: StudyPlanItem): string {
    const s = item.my_status ?? 'todo';
    if (s === 'revisit') return 'bi bi-arrow-repeat';
    if (s === 'complete') return 'bi bi-check-circle-fill';
    return 'bi bi-circle';
  }

  planProgressTitle(item: StudyPlanItem): string {
    const s = item.my_status ?? 'todo';
    if (s === 'todo') return 'To do — click to mark complete';
    if (s === 'complete') return 'Complete — click to mark revisit';
    return 'Revisit — click to mark to do';
  }

  cyclePlanItemProgress(item: StudyPlanItem, ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    const st = this.study();
    if (!st || !this.session.isLoggedIn()) return;
    const cur = item.my_status ?? 'todo';
    const idx = StudyDetailComponent.PLAN_PROGRESS_ORDER.indexOf(cur);
    const next = StudyDetailComponent.PLAN_PROGRESS_ORDER[(idx + 1) % StudyDetailComponent.PLAN_PROGRESS_ORDER.length];
    this.studiesService.updatePlanItemState(st.uuid, item.uuid, next).subscribe({
      next: (r) => {
        const ms = r.plan_item.my_status;
        this.planItems.update((items) =>
          items.map((i) => (i.uuid === item.uuid ? { ...i, my_status: ms ?? next } : i))
        );
      },
      error: () => this.toast.danger('Could not update progress.')
    });
  }

  /** Batch-set every plan item's status for the current user (sequential HTTP). */
  markAllPlanItemsStatus(status: 'todo' | 'complete' | 'revisit', ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    const st = this.study();
    if (!st || !this.session.isLoggedIn() || this.markingAllPlanProgress()) return;
    const items = this.planItems().filter((i) => (i.my_status ?? 'todo') !== status);
    if (items.length === 0) {
      this.toast.success('Every step already has that status.');
      return;
    }
    const label =
      status === 'todo' ? 'To do' : status === 'complete' ? 'Complete' : 'Revisit';
    this.markingAllPlanProgress.set(true);
    from(items)
      .pipe(
        concatMap((item) =>
          this.studiesService.updatePlanItemState(st.uuid, item.uuid, status).pipe(
            tap((r) => {
              const ms = r.plan_item.my_status;
              this.planItems.update((list) =>
                list.map((x) => (x.uuid === item.uuid ? { ...x, my_status: ms ?? status } : x))
              );
            })
          )
        ),
        finalize(() => this.markingAllPlanProgress.set(false))
      )
      .subscribe({
        complete: () => this.toast.success(`Marked all steps as ${label}.`),
        error: () => this.toast.danger('Could not update all steps.')
      });
  }

  copyId(text: string, label: string): void {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      this.copyFeedback.set(`${label} copied`);
      if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = setTimeout(() => this.copyFeedback.set(''), 2000);
    });
  }

  readerDeepLinkForStudyVerse(sv: StudyVerse): string {
    const params = new URLSearchParams({
      bible: sv.bible_uuid,
      book: sv.book_uuid,
      chapter: String(sv.chapter),
      verse: String(sv.ordinal)
    });
    return `/reader?${params.toString()}`;
  }

  comparatorDeepLinkForStudyVerse(sv: StudyVerse): string {
    const params = new URLSearchParams({
      bible: sv.bible_uuid,
      book: sv.book_uuid,
      chapter: String(sv.chapter),
      verse: String(sv.ordinal)
    });
    return `/comparator?${params.toString()}`;
  }

  studyVerseBookLabel(sv: StudyVerse): string {
    return (
      this.studyVerseBookNamesByUuid()[sv.book_uuid] ?? this.books().find((b) => b.uuid === sv.book_uuid)?.name ?? ''
    );
  }

  canDeleteContent(): boolean {
    if (this.studyMode() === 'participant') return false;
    return this.study()?.capabilities.can_delete_content ?? false;
  }

  deletePlanItem(item: StudyPlanItem): void {
    const st = this.study();
    if (!st || !this.canDeleteContent()) return;
    this.openConfirmation(
      'Remove plan step?',
      `Remove plan step "${item.title}"?`,
      () => this.performDeletePlanItem(st.uuid, item.uuid)
    );
  }

  private performDeletePlanItem(studyUuid: string, planItemUuid: string): void {
    this.studiesService.destroyPlanItem(studyUuid, planItemUuid).subscribe({
      next: () => {
        if (this.selectedPlanItemUuid() === planItemUuid) {
          this.selectedPlanItemUuid.set('');
          void this.router.navigate(['/studies', studyUuid]);
        }
        this.toast.success('Deleted.');
        this.loadStudyWorkspace(studyUuid);
      },
      error: () => {
        this.error.set('Could not delete plan step.');
        this.toast.danger('Could not delete plan step.');
      }
    });
  }

  deleteCommentary(c: StudyCommentary): void {
    const st = this.study();
    if (!st || !this.canDeleteContent()) return;
    this.openConfirmation(
      'Delete commentary?',
      `Delete commentary "${c.title}"?`,
      () => this.performDeleteCommentary(st.uuid, c.uuid)
    );
  }

  private performDeleteCommentary(studyUuid: string, commentaryUuid: string): void {
    this.studiesService.destroyCommentary(studyUuid, commentaryUuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.loadStudyWorkspace(studyUuid);
      },
      error: () => {
        this.error.set('Could not delete commentary.');
        this.toast.danger('Could not delete commentary.');
      }
    });
  }

  deleteStudyVerse(sv: StudyVerse): void {
    const st = this.study();
    if (!st || !this.canDeleteContent()) return;
    this.openConfirmation(
      'Remove saved verse?',
      'Remove this saved verse?',
      () => this.performDeleteStudyVerse(st.uuid, sv.uuid),
      'Remove'
    );
  }

  private performDeleteStudyVerse(studyUuid: string, studyVerseUuid: string): void {
    this.studiesService.destroyStudyVerse(studyUuid, studyVerseUuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.loadStudyWorkspace(studyUuid);
      },
      error: () => {
        this.error.set('Could not delete verse.');
        this.toast.danger('Could not delete verse.');
      }
    });
  }

  deleteQuestion(q: StudyQuestion): void {
    const st = this.study();
    if (!st || !this.canDeleteContent()) return;
    this.openConfirmation(
      'Delete question?',
      'Delete this question and its answers?',
      () => this.performDeleteQuestion(st.uuid, q.uuid)
    );
  }

  private performDeleteQuestion(studyUuid: string, questionUuid: string): void {
    this.studiesService.destroyQuestion(studyUuid, questionUuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.loadStudyWorkspace(studyUuid);
      },
      error: () => {
        this.error.set('Could not delete question.');
        this.toast.danger('Could not delete question.');
      }
    });
  }

  deleteTask(t: StudyTask): void {
    const st = this.study();
    if (!st || !this.canDeleteContent()) return;
    this.openConfirmation(
      'Delete task?',
      'Delete this task?',
      () => this.performDeleteTask(st.uuid, t.uuid)
    );
  }

  private performDeleteTask(studyUuid: string, taskUuid: string): void {
    this.studiesService.destroyTask(studyUuid, taskUuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.loadStudyWorkspace(studyUuid);
      },
      error: () => {
        this.error.set('Could not delete task.');
        this.toast.danger('Could not delete task.');
      }
    });
  }

  deleteAnswer(questionUuid: string, answer: StudyAnswer): void {
    const st = this.study();
    if (!st || !st.capabilities.can_delete_content || this.studyMode() === 'participant') return;
    this.openConfirmation(
      'Delete answer?',
      'Delete this answer?',
      () => this.performDeleteAnswer(st.uuid, questionUuid, answer.uuid)
    );
  }

  private performDeleteAnswer(studyUuid: string, questionUuid: string, answerUuid: string): void {
    this.studiesService.destroyAnswer(studyUuid, questionUuid, answerUuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.loadAnswers(questionUuid);
      },
      error: () => {
        this.error.set('Could not delete answer.');
        this.toast.danger('Could not delete answer.');
      }
    });
  }

  studyViewModeLabel(mode: StudyMode): string {
    switch (mode) {
      case 'leader':
        return 'Leader';
      case 'co-leader':
        return 'Co-Leader';
      case 'participant':
        return 'Participant';
    }
  }

  refreshStudyAssignments(st: Study): void {
    const r = st.my_study_role;
    if (r !== 'owner' && r !== 'co_leader' && r !== 'curator') {
      this.studyAssignments.set([]);
      return;
    }
    this.accessSectionLoading.set(true);
    this.studiesService.listAssignments(st.uuid).subscribe({
      next: (res) => {
        this.accessSectionLoading.set(false);
        this.studyAssignments.set(res.assignments);
      },
      error: () => {
        this.accessSectionLoading.set(false);
        this.studyAssignments.set([]);
      }
    });
  }

  addCoLeader(): void {
    const st = this.study();
    const raw = this.newCoLeaderInput().trim();
    if (!st || !raw) return;
    const looksLikeEmail = raw.includes('@');
    this.accessSectionLoading.set(true);
    this.studiesService
      .createAssignment(st.uuid, looksLikeEmail ? { email: raw } : { username: raw })
      .subscribe({
        next: () => {
          this.accessSectionLoading.set(false);
          this.newCoLeaderInput.set('');
          this.toast.success('Co-leader added.');
          this.refreshStudyAssignments(st);
        },
        error: (err: unknown) => {
          this.accessSectionLoading.set(false);
          this.toastHttpError(err, 'Could not add co-leader.');
        }
      });
  }

  removeCoLeader(userId: string): void {
    const st = this.study();
    if (!st) return;
    this.accessSectionLoading.set(true);
    this.studiesService.destroyAssignment(st.uuid, userId).subscribe({
      next: () => {
        this.accessSectionLoading.set(false);
        this.toast.success('Removed.');
        this.refreshStudyAssignments(st);
      },
      error: (err: unknown) => {
        this.accessSectionLoading.set(false);
        this.toastHttpError(err, 'Could not remove co-leader.');
      }
    });
  }

  transferStudyOwnership(): void {
    const st = this.study();
    const uid = this.transferOwnerUserId().trim();
    if (!st || !uid) return;
    this.accessSectionLoading.set(true);
    this.studiesService.transferOwner(st.uuid, uid).subscribe({
      next: (res) => {
        this.accessSectionLoading.set(false);
        this.study.set(res.study);
        this.transferOwnerUserId.set('');
        this.studyMode.set(defaultStudyViewMode(res.study));
        this.toast.success('Leadership transferred.');
        this.openStudy(res.study.uuid);
      },
      error: (err: unknown) => {
        this.accessSectionLoading.set(false);
        this.toastHttpError(err, 'Could not transfer ownership.');
      }
    });
  }

  private toastHttpError(err: unknown, fallback: string): void {
    const e = err as { error?: { error?: string; errors?: string[] } };
    const msg =
      e.error?.errors && Array.isArray(e.error.errors) && e.error.errors.length > 0
        ? e.error.errors.join(', ')
        : e.error?.error ?? fallback;
    this.toast.danger(msg);
  }

  private normalizeDuration(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.trunc(n);
    if (rounded < 0) return null;
    return rounded;
  }

  private durationInputValue(duration: number | null | undefined): string {
    const n = this.normalizeDuration(duration);
    return !n || n <= 0 ? '' : String(n);
  }

  private durationPayloadFromInput(input: string): number | null {
    const n = this.normalizeDuration(input.trim());
    return !n || n <= 0 ? null : n;
  }

  private defaultDurationForItemType(itemType: StudyPlanItem['item_type']): number {
    if (itemType === 'verse') return 2;
    if (itemType === 'question') return 7;
    if (itemType === 'commentary') return 5;
    if (itemType === 'task') return 5;
    if (itemType === 'worship') return 5;
    return 5;
  }
}
