// Author: Preston Lee

import {Component, signal, computed, inject, ChangeDetectionStrategy} from '@angular/core';
import {BibleBasedComponent} from './bibleBased.component';
import {SearchService} from '../services/search.service';
import { Verse } from '../models/verse';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'search',
    templateUrl: 'search.html',
    standalone: true,
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchComponent extends BibleBasedComponent {

    protected searchService = inject(SearchService);

    verses = signal<Verse[]>([]);
    ascending = signal(true);

    sortedVerses = computed(() => {
        const verses = this.verses();
        const isAscending = this.ascending();
        const sorted = [...verses];
        if (isAscending) {
            return sorted.sort((a, b) => a.book.name.localeCompare(b.book.name));
        } else {
            return sorted.sort((a, b) => b.book.name.localeCompare(a.book.name));
        }
    });

    resort() {
        this.ascending.update(asc => !asc);
    }

    afterBibleLoad(): void {
        // Meh
    }

    afterBibleSelect() { 
        this.search(); 
    }

    search() {
        const bible = this.bible();
        const searchText = this.searchText();
        if (this.validSearch() && bible) {
            this.searchService.search(bible.uuid, searchText).subscribe((d: any) => {
                const verses = <Verse[]>d;
                // Update highlighted text
                for (let i = 0; i < verses.length; i++) {
                    verses[i]['highlightedText'] = this.highlighted(searchText, verses[i]['text']);
                }
                this.verses.set(verses);
            });
        }
    }

    validSearch() {
        const bible = this.bible();
        const searchText = this.searchText();
        return bible != null && searchText != null && searchText.length >= 3;
    }

}
