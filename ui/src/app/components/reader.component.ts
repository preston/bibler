// Author: Preston Lee

import { Component, signal, computed, ChangeDetectionStrategy, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookBasedDeepLinkComponent } from './book-based-deep-link.component';
import {
  adjacentPrimaryBook,
  canNavigateToNextPrimaryChapter,
  canNavigateToPreviousPrimaryChapter
} from './scripture-navigation.util';
import { Verse } from '../models/verse';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'reader',
  templateUrl: 'reader.html',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReaderComponent extends BookBasedDeepLinkComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  verses = signal<Verse[]>([]);

  canNavigatePrevious = computed(() =>
    canNavigateToPreviousPrimaryChapter(this.books(), this.chapters(), this.chapter(), this.book())
  );
  canNavigateNext = computed(() =>
    canNavigateToNextPrimaryChapter(this.books(), this.chapters(), this.chapter(), this.book())
  );

  highlightedVerses = computed(() => {
    const verses = this.verses();
    const searchText = this.searchText();
    return verses.map((verse) => {
      const highlightedVerse = { ...verse };
      highlightedVerse.highlightedText = this.highlighted(searchText, verse.text);
      return highlightedVerse;
    });
  });

  constructor() {
    super();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) =>
      this.applyDeepLinkParams(params.get('bible'), params.get('book'), params.get('chapter'), params.get('verse'))
    );

    effect(() => {
      this.bibles();
      this.books();
      this.chapters();
      this.applyPendingSelections();
    });

    effect(() => {
      const target = this.targetVerseOrdinal();
      this.verses();
      if (!target) return;
      queueMicrotask(() => {
        document.getElementById(`reader-verse-${target}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
  }

  override selectBible(uuid: string) {
    super.selectBible(uuid);
    this.clearDeepLinkTargetForManualNavigation();
  }

  override selectBook(uuid: string) {
    super.selectBook(uuid);
    this.clearDeepLinkTargetForManualNavigation();
  }

  selectChapter(n: number) {
    this.chapter.set(n);
    this.clearDeepLinkTargetForManualNavigation();
    this.syncReaderQueryParams();
    const bible = this.bible();
    const book = this.book();
    if (bible && book) {
      this.verseService.index(bible, book, n).subscribe((d: Verse[]) => {
        this.verses.set(d);
        this.applyPendingSelections();
      });
    }
  }

  navigatePrevious() {
    if (!this.canNavigatePrevious()) return;
    this.targetVerseOrdinal.set(null);

    const chapters = this.chapters();
    const currentChapter = this.chapter();
    const chapterIndex = currentChapter === null ? -1 : chapters.indexOf(currentChapter);
    if (chapterIndex > 0) {
      this.selectChapter(chapters[chapterIndex - 1]);
      return;
    }

    const bible = this.bible();
    const currentBook = this.book();
    if (!bible || !currentBook) return;

    const books = this.books();
    const previousBook = adjacentPrimaryBook(books, currentBook, -1);
    if (!previousBook) return;

    this.bookService.chaptersFor(bible, previousBook).subscribe((bookChapters: number[]) => {
      if (bookChapters.length > 0) {
        this.pendingChapter.set(bookChapters[bookChapters.length - 1]);
      }
      this.selectBook(previousBook.uuid);
    });
  }

  navigateNext() {
    if (!this.canNavigateNext()) return;
    this.targetVerseOrdinal.set(null);

    const chapters = this.chapters();
    const currentChapter = this.chapter();
    const chapterIndex = currentChapter === null ? -1 : chapters.indexOf(currentChapter);
    if (chapterIndex !== -1 && chapterIndex < chapters.length - 1) {
      this.selectChapter(chapters[chapterIndex + 1]);
      return;
    }

    const bible = this.bible();
    const currentBook = this.book();
    if (!bible || !currentBook) return;

    const books = this.books();
    const nextBook = adjacentPrimaryBook(books, currentBook, 1);
    if (!nextBook) return;

    this.bookService.chaptersFor(bible, nextBook).subscribe((bookChapters: number[]) => {
      if (bookChapters.length > 0) {
        this.pendingChapter.set(bookChapters[0]);
      }
      this.selectBook(nextBook.uuid);
    });
  }

  private syncReaderQueryParams(): void {
    if (this.applyingDeepLink || this.hasPendingDeepLinkSelection()) return;
    const bible = this.bible();
    const book = this.book();
    const chapter = this.chapter();
    if (!bible || !book || chapter === null) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        bible: bible.uuid,
        book: book.uuid,
        chapter,
        verse: null
      },
      replaceUrl: true
    });
  }
}
