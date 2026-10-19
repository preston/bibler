// Author: Preston Lee

import { Component, signal, computed, effect, ChangeDetectionStrategy, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookBasedDeepLinkComponent } from './book-based-deep-link.component';
import {
  adjacentPrimaryBook,
  canNavigateToNextPrimaryChapter,
  canNavigateToPreviousPrimaryChapter
} from './scripture-navigation.util';
import { ComparatorAiCommentaryRequest, ComparatorAiSseMessage, ComparatorAiVerseCommentary, Verse } from '../models/verse';
import { Book } from '../models/book';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'comparator',
  templateUrl: 'comparator.html',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ComparatorComponent extends BookBasedDeepLinkComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private aiRunSub: Subscription | undefined;
  private defaultsApplied = false;

  selectedBibleSecondaryUuid = signal<string | null>(null);
  secondaryBible = computed(() => {
    const uuid = this.selectedBibleSecondaryUuid();
    if (!uuid) return null;
    return this.bibleForUuid(uuid);
  });

  private booksSecondarySignal = signal<Book[]>([]);
  booksSecondary = computed(() => this.booksSecondarySignal());

  selectedBookSecondaryUuid = signal<string | null>(null);
  bookSecondary = computed(() => {
    const uuid = this.selectedBookSecondaryUuid();
    if (!uuid) return null;
    return this.objectForUuid<Book>(this.booksSecondary(), uuid);
  });

  chaptersSecondary = signal<number[]>([]);

  versesPrimary = signal<Verse[]>([]);
  versesSecondary = signal<Verse[]>([]);
  aiCommentaryLoading = signal(false);
  aiCommentaryError = signal('');
  aiCommentaryStatus = signal('');
  aiCommentaryByOrdinal = signal<Record<number, ComparatorAiVerseCommentary>>({});

  highlightedVersesPrimary = computed(() => {
    const verses = this.versesPrimary();
    const searchText = this.searchText();
    return verses.map((verse) => ({
      ...verse,
      highlightedText: this.highlighted(searchText, verse.text)
    }));
  });

  highlightedVersesSecondary = computed(() => {
    const verses = this.versesSecondary();
    const searchText = this.searchText();
    return verses.map((verse) => ({
      ...verse,
      highlightedText: this.highlighted(searchText, verse.text)
    }));
  });

  versesAreAligned = computed(() => {
    const primary = this.versesPrimary();
    const secondary = this.versesSecondary();
    if (primary.length === 0 || secondary.length === 0 || primary.length !== secondary.length) return false;
    for (let i = 0; i < primary.length; i++) {
      if (primary[i].ordinal !== secondary[i].ordinal) return false;
    }
    return true;
  });

  comparisonRows = computed(() => {
    if (!this.versesAreAligned()) return [];
    const primary = this.highlightedVersesPrimary();
    const secondaryByOrdinal = new Map(this.highlightedVersesSecondary().map((v) => [v.ordinal, v]));
    const aiByOrdinal = this.aiCommentaryByOrdinal();
    return primary.map((pv) => ({
      ordinal: pv.ordinal,
      primaryText: pv.highlightedText,
      secondaryText: secondaryByOrdinal.get(pv.ordinal)?.highlightedText ?? '',
      ai: aiByOrdinal[pv.ordinal] ?? null
    }));
  });

  canNavigateToPreviousChapter = computed(() =>
    canNavigateToPreviousPrimaryChapter(this.books(), this.chapters(), this.chapter(), this.book())
  );

  canNavigateToNextChapter = computed(() =>
    canNavigateToNextPrimaryChapter(this.books(), this.chapters(), this.chapter(), this.book())
  );

  constructor() {
    super();

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) =>
      this.applyDeepLinkParams(params.get('bible'), params.get('book'), params.get('chapter'), params.get('verse'))
    );

    effect((onCleanup) => {
      const bibleSecondary = this.secondaryBible();
      if (bibleSecondary) {
        const sub = this.bookService.index(bibleSecondary).subscribe((books: Book[]) => {
          this.booksSecondarySignal.set(books);
          const primaryBook = this.book();
          if (books.length === 0) {
            this.selectedBookSecondaryUuid.set(null);
          } else if (primaryBook) {
            const matchingBook = books.find((b) => b.ordinal === primaryBook.ordinal);
            this.selectedBookSecondaryUuid.set(matchingBook ? matchingBook.uuid : books[0].uuid);
          } else {
            this.selectedBookSecondaryUuid.set(books[0].uuid);
          }
        });
        onCleanup(() => sub.unsubscribe());
      } else {
        this.booksSecondarySignal.set([]);
        this.selectedBookSecondaryUuid.set(null);
      }
    });

    effect((onCleanup) => {
      const bibleSecondary = this.secondaryBible();
      const bookSecondary = this.bookSecondary();
      if (bibleSecondary && bookSecondary) {
        const sub = this.bookService.chaptersFor(bibleSecondary, bookSecondary).subscribe((d: number[]) => {
          this.chaptersSecondary.set(d);
        });
        onCleanup(() => sub.unsubscribe());
      } else {
        this.chaptersSecondary.set([]);
      }
    });

    effect(() => {
      const primaryBook = this.book();
      const booksSecondary = this.booksSecondary();
      if (primaryBook && booksSecondary.length > 0) {
        const matchingBook = booksSecondary.find((b) => b.ordinal === primaryBook.ordinal);
        this.selectedBookSecondaryUuid.set(matchingBook ? matchingBook.uuid : booksSecondary[0].uuid);
      }
    });

    effect((onCleanup) => {
      const bibleSecondary = this.secondaryBible();
      const bookSecondary = this.bookSecondary();
      const n = this.chapter();
      if (bibleSecondary && bookSecondary && n !== null) {
        const sub = this.verseService.index(bibleSecondary, bookSecondary, n).subscribe((secondary: Verse[]) => {
          this.versesSecondary.set(secondary);
          this.cdr.markForCheck();
        });
        onCleanup(() => sub.unsubscribe());
      } else {
        this.versesSecondary.set([]);
      }
    });

    effect(() => {
      this.bible();
      this.secondaryBible();
      this.book();
      this.bookSecondary();
      this.chapter();
      this.resetAiCommentaryState();
    });

    effect(() => {
      this.bibles();
      this.books();
      this.chapters();
      this.applyPendingSelections();
    });

    effect(() => {
      const target = this.targetVerseOrdinal();
      this.versesPrimary();
      if (!target) return;
      queueMicrotask(() => {
        document.getElementById(`comparator-verse-${target}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
  }

  override afterBibleLoad() {
    super.afterBibleLoad();
    const bibles = this.bibles();
    if (bibles.length === 0 || this.defaultsApplied) return;
    this.defaultsApplied = true;

    const defaultPrimary = bibles.find((b) => !!b.ai_default_english) ?? bibles[0];
    this.selectBible(defaultPrimary.uuid);

    const defaultSecondary =
      bibles.find((b) => !!b.ai_default_hebrew_ot) ?? bibles.find((b) => b.uuid !== defaultPrimary.uuid) ?? defaultPrimary;
    if (!this.selectedBibleSecondaryUuid()) {
      this.selectBibleSecondary(defaultSecondary.uuid);
    }

    this.applyPendingSelections();
  }

  selectChapterString(s: string) {
    this.selectChapter(parseInt(s, 10));
  }

  selectChapter(n: number) {
    this.chapter.set(n);
    this.clearDeepLinkTargetForManualNavigation();
    const bible = this.bible();
    const book = this.book();
    if (bible && book && n !== null) {
      const requestChapter = n;
      this.verseService.index(bible, book, n).subscribe((primary: Verse[]) => {
        if (this.chapter() !== requestChapter) return;
        this.versesPrimary.set(primary);
      });
    }
  }

  selectBookSecondary(uuid: string) {
    if (uuid) {
      this.selectedBookSecondaryUuid.set(uuid);
    }
  }

  override selectBible(uuid: string) {
    super.selectBible(uuid);
    this.clearDeepLinkTargetForManualNavigation();
  }

  override selectBook(uuid: string) {
    super.selectBook(uuid);
    this.clearDeepLinkTargetForManualNavigation();
  }

  selectBibleSecondary(uuid: string) {
    this.selectedBibleSecondaryUuid.set(uuid);
  }

  navigateToPreviousChapter() {
    const chapters = this.chapters();
    const chapter = this.chapter();
    if (chapter === null) return;

    const chapterIndex = chapters.indexOf(chapter);
    if (chapterIndex > 0) {
      this.selectChapter(chapters[chapterIndex - 1]);
      return;
    }

    const previousBook = adjacentPrimaryBook(this.books(), this.book(), -1);
    const bible = this.bible();
    if (!previousBook || !bible) return;

    this.bookService.chaptersFor(bible, previousBook).subscribe((previousBookChapters) => {
      if (previousBookChapters.length === 0) return;
      this.selectBook(previousBook.uuid);
      queueMicrotask(() => this.selectChapter(previousBookChapters[previousBookChapters.length - 1]));
    });
  }

  navigateToNextChapter() {
    const chapters = this.chapters();
    const chapter = this.chapter();
    if (chapter === null) return;

    const chapterIndex = chapters.indexOf(chapter);
    if (chapterIndex > -1 && chapterIndex < chapters.length - 1) {
      this.selectChapter(chapters[chapterIndex + 1]);
      return;
    }

    const nextBook = adjacentPrimaryBook(this.books(), this.book(), 1);
    const bible = this.bible();
    if (!nextBook || !bible) return;

    this.bookService.chaptersFor(bible, nextBook).subscribe((nextBookChapters) => {
      if (nextBookChapters.length === 0) return;
      this.selectBook(nextBook.uuid);
      queueMicrotask(() => this.selectChapter(nextBookChapters[0]));
    });
  }

  runAiCommentary() {
    if (!this.versesAreAligned()) return;
    const primaryBible = this.bible();
    const secondaryBbl = this.secondaryBible();
    const primaryBook = this.book();
    const secondaryBk = this.bookSecondary();
    const chapter = this.chapter();
    if (!primaryBible || !secondaryBbl || !primaryBook || !secondaryBk || chapter === null) return;

    const payload: ComparatorAiCommentaryRequest = {
      primary_bible_uuid: primaryBible.uuid,
      secondary_bible_uuid: secondaryBbl.uuid,
      primary_book_uuid: primaryBook.uuid,
      secondary_book_uuid: secondaryBk.uuid,
      chapter
    };

    this.aiRunSub?.unsubscribe();
    this.aiCommentaryLoading.set(true);
    this.aiCommentaryError.set('');
    this.aiCommentaryStatus.set('Requesting AI analysis...');
    this.aiCommentaryByOrdinal.set({});

    this.aiRunSub = this.verseService.requestComparatorAiCommentary(payload).subscribe({
      next: (msg) => this.onAiSse(msg),
      error: (err: Error) => {
        this.aiCommentaryLoading.set(false);
        this.aiCommentaryError.set(err?.message ?? 'AI commentary request failed.');
      },
      complete: () => this.aiCommentaryLoading.set(false)
    });
  }

  private onAiSse(msg: ComparatorAiSseMessage) {
    if (msg.event === 'status') {
      const status = msg.data['message'];
      if (typeof status === 'string' && status.trim().length > 0) {
        this.aiCommentaryStatus.set(status);
      }
      return;
    }

    if (msg.event === 'verse') {
      const parsed = this.parseVerseCommentary(msg.data);
      if (!parsed) return;
      this.aiCommentaryByOrdinal.update((current) => ({ ...current, [parsed.ordinal]: parsed }));
      return;
    }

    if (msg.event === 'error') {
      const errorMessage = msg.data['error'];
      if (typeof errorMessage === 'string' && errorMessage.length > 0) {
        this.aiCommentaryError.set(errorMessage);
      } else {
        this.aiCommentaryError.set('AI commentary failed.');
      }
      return;
    }

    if (msg.event === 'complete') {
      this.aiCommentaryStatus.set('AI commentary ready.');
    }
  }

  private parseVerseCommentary(data: Record<string, unknown>): ComparatorAiVerseCommentary | null {
    const ordinalRaw = data['ordinal'];
    const ordinal = typeof ordinalRaw === 'number' ? ordinalRaw : Number(ordinalRaw);
    if (!Number.isFinite(ordinal)) return null;

    const commentary = data['commentary'];
    return {
      ordinal,
      commentary: typeof commentary === 'string' ? commentary : '',
      linguistic_notes: this.stringOrUndefined(data['linguistic_notes']),
      translation_issues: this.stringOrUndefined(data['translation_issues']),
      cultural_context: this.stringOrUndefined(data['cultural_context']),
      anthropological_context: this.stringOrUndefined(data['anthropological_context']),
      translation_lens: this.stringOrUndefined(data['translation_lens']),
      grammar_notes: this.stringOrUndefined(data['grammar_notes']),
      idiom_notes: this.stringArrayOrUndefined(data['idiom_notes']),
      interlinear_tokens: this.parseInterlinearTokens(data['interlinear_tokens'])
    };
  }

  private parseInterlinearTokens(raw: unknown): ComparatorAiVerseCommentary['interlinear_tokens'] {
    if (!Array.isArray(raw)) return undefined;
    const tokens = raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const token = this.stringOrUndefined((item as Record<string, unknown>)['token']);
        if (!token) return null;
        const confidenceRaw = (item as Record<string, unknown>)['confidence'];
        const confidence = typeof confidenceRaw === 'number' ? confidenceRaw : Number(confidenceRaw);
        return {
          token,
          transliteration: this.stringOrUndefined((item as Record<string, unknown>)['transliteration']),
          lemma: this.stringOrUndefined((item as Record<string, unknown>)['lemma']),
          morphology: this.stringOrUndefined((item as Record<string, unknown>)['morphology']),
          gloss: this.stringOrUndefined((item as Record<string, unknown>)['gloss']),
          confidence: Number.isFinite(confidence) ? confidence : undefined,
          ambiguity_note: this.stringOrUndefined((item as Record<string, unknown>)['ambiguity_note'])
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
    return tokens.length > 0 ? tokens : undefined;
  }

  private stringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private stringArrayOrUndefined(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const list = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return list.length > 0 ? list : undefined;
  }

  private resetAiCommentaryState() {
    this.aiRunSub?.unsubscribe();
    this.aiCommentaryLoading.set(false);
    this.aiCommentaryError.set('');
    this.aiCommentaryStatus.set('');
    this.aiCommentaryByOrdinal.set({});
  }

  ngOnDestroy(): void {
    this.aiRunSub?.unsubscribe();
  }
}
