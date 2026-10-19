// Author: Preston Lee

import { signal } from '@angular/core';
import { BookBasedComponent } from './bookBased.component';
import { parsePositiveIntQueryParam } from './scripture-navigation.util';

/**
 * Shared query-param deep link state (bible, book, chapter, verse) for scripture UIs
 * that extend {@link BookBasedComponent}.
 */
export abstract class BookBasedDeepLinkComponent extends BookBasedComponent {
  readonly targetVerseOrdinal = signal<number | null>(null);
  protected readonly pendingBibleUuid = signal<string | null>(null);
  protected readonly pendingBookUuid = signal<string | null>(null);
  protected readonly pendingChapter = signal<number | null>(null);
  protected applyingDeepLink = false;

  protected applyDeepLinkParams(
    bibleUuid: string | null,
    bookUuid: string | null,
    chapterRaw: string | null,
    verseRaw: string | null
  ): void {
    this.applyingDeepLink = true;
    this.pendingBibleUuid.set(bibleUuid && bibleUuid.trim() ? bibleUuid : null);
    this.pendingBookUuid.set(bookUuid && bookUuid.trim() ? bookUuid : null);
    this.pendingChapter.set(parsePositiveIntQueryParam(chapterRaw));
    this.targetVerseOrdinal.set(parsePositiveIntQueryParam(verseRaw));
    this.applyPendingSelections();
    this.applyingDeepLink = false;
  }

  protected applyPendingSelections(): void {
    const pendingBibleUuid = this.pendingBibleUuid();
    if (pendingBibleUuid && this.bibles().some((b) => b.uuid === pendingBibleUuid)) {
      if (this.selectedBibleUuid() !== pendingBibleUuid) {
        this.selectBible(pendingBibleUuid);
      }
      this.pendingBibleUuid.set(null);
    }

    const pendingBookUuid = this.pendingBookUuid();
    if (pendingBookUuid && this.books().some((b) => b.uuid === pendingBookUuid)) {
      if (this.selectedBookUuid() !== pendingBookUuid) {
        this.selectBook(pendingBookUuid);
      }
      this.pendingBookUuid.set(null);
    }

    const pendingChapter = this.pendingChapter();
    if (pendingChapter !== null && this.chapters().includes(pendingChapter)) {
      if (this.chapter() !== pendingChapter) {
        this.selectChapter(pendingChapter);
      }
      this.pendingChapter.set(null);
    }
  }

  protected hasPendingDeepLinkSelection(): boolean {
    return (
      this.pendingBibleUuid() !== null ||
      this.pendingBookUuid() !== null ||
      this.pendingChapter() !== null
    );
  }

  protected clearDeepLinkTargetForManualNavigation(): void {
    if (!this.applyingDeepLink && !this.hasPendingDeepLinkSelection()) {
      this.targetVerseOrdinal.set(null);
    }
  }
}
