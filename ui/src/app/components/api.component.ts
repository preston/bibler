import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { BookBasedComponent } from './bookBased.component';
import { Verse } from '../models/verse';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
    selector: 'api',
    templateUrl: 'api.html',
    standalone: true,
    imports: [],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApiComponent extends BookBasedComponent {

    verses = signal<Verse[]>([]);
    selectedVerse = signal<Verse | null>(null);

    override selectChapter(n: number) {
        this.chapter.set(n);
        const bible = this.bible();
        const book = this.book();
        if (bible && book) {
            this.verseService.index(bible, book, n)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((d: Verse[]) => {
                    this.verses.set(d);
                    if (d.length > 0) {
                        this.selectedVerse.set(d[0]);
                    }
                });
        }
    }

    selectVerse(verse: Verse) {
        this.selectedVerse.set(verse);
    }

    stringify(obj: any): string {
        return JSON.stringify(obj, null, "\t").trim();
    }

}
