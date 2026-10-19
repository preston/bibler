// Author: Preston Lee

import { signal, computed, effect, inject, DestroyRef, ChangeDetectorRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BookService } from '../services/book.service';
import { VerseService } from '../services/verse.service';
import { BibleBasedComponent } from './bibleBased.component';
import { Book } from '../models/book';
import { Verse } from '../models/verse';

export abstract class BookBasedComponent extends BibleBasedComponent {

    protected bookService = inject(BookService);
    protected verseService = inject(VerseService);
    protected destroyRef = inject(DestroyRef);
    protected cdr = inject(ChangeDetectorRef);

    private booksSignal = signal<Book[]>([]);
    books = computed(() => this.booksSignal());

    selectedBookUuid = signal<string | null>(null);
    book = computed(() => {
        const uuid = this.selectedBookUuid();
        if (!uuid) return null;
        return this.bookForUuid(uuid);
    });

    chapters = signal<number[]>([]);
    chapter = signal<number | null>(null);

    constructor() {
        super();

        // Reload books when bible changes
        effect((onCleanup) => {
            const bible = this.bible();
            if (bible) {
                const sub = this.bookService.index(bible).subscribe({
                    next: (books: Book[]) => {
                        if (books && Array.isArray(books)) {
                            this.booksSignal.set(books);
                            const currentUuid = this.selectedBookUuid();
                            if (currentUuid && !this.bookForUuid(currentUuid)) {
                                this.selectedBookUuid.set(null);
                            }
                            this.cdr.markForCheck();
                        } else {
                            this.booksSignal.set([]);
                            this.cdr.markForCheck();
                        }
                    },
                    error: () => {
                        this.booksSignal.set([]);
                        this.cdr.markForCheck();
                    }
                });
                onCleanup(() => sub.unsubscribe());
            } else {
                // Clear books when no bible is selected
                this.booksSignal.set([]);
                this.selectedBookUuid.set(null);
            }
        });

        // Auto-select first book when books load
        effect(() => {
            const books = this.books();
            const currentUuid = this.selectedBookUuid();
            if (books.length > 0 && !currentUuid) {
                this.selectBook(books[0].uuid);
            }
        });

        // Update chapters when bible or book changes
        effect((onCleanup) => {
            const bible = this.bible();
            const book = this.book();
            if (bible && book) {
                const sub = this.bookService.chaptersFor(bible, book).subscribe((d: number[]) => {
                    this.chapters.set(d);
                    if (d.length > 0) {
                        this.selectChapter(d[0]);
                    }
                });
                onCleanup(() => sub.unsubscribe());
            } else {
                this.chapters.set([]);
            }
        });
    }

    afterBibleLoad() {
    }

    selectBook(uuid: string) {
        if (uuid) {
            this.selectedBookUuid.set(uuid);
        }
    }

    afterBibleSelect() {
        // Handled by effect in constructor
    }

    abstract selectChapter(n: number): any;

    verseDataPermalink(verse: Verse, format: string) {
        const bible = this.bible();
        const book = this.book();
        const chapter = this.chapter();
        if (!bible || !book || chapter === null) return '';
        return this.biblerService.getUrl() + '/' + bible.uuid + '/' + book.uuid + '/' + chapter + '/' + verse.ordinal + '.' + format;
    }

    override verseMailTo(verse: Verse) {
        const bible = this.bible();
        const bookName = verse.book?.name ?? this.book()?.name ?? 'Unknown';
        return "mailto:?subject=" + bookName + '%20' + verse.chapter + ':' + verse.ordinal
            + '%20-%20' + (bible?.name ?? '')
            + '&body=%22' + verse.text
            + '%22%0D%0A%0D%0A--%0D%0APowered by Bibler.';
    }

    protected bookForUuid(uuid: string): Book | null {
        return this.objectForUuid<Book>(this.books(), uuid);
    }

}
