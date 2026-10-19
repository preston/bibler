import { Component, Injectable, signal, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { BiblerService } from '../services/bibler.service';
import { BibleService } from '../services/bible.service';
import { Bible } from '../models/bible';
import { Uuidable } from '../models/sluggable';
import { Verse } from '../models/verse';

@Injectable()
export abstract class BibleBasedComponent {

    protected biblerService = inject(BiblerService);
    protected bibleService = inject(BibleService);

    searchText = signal('');

    private biblesSignal = toSignal(this.bibleService.index(), { initialValue: [] as Bible[] });
    bibles = computed(() => this.biblesSignal() ?? []);

    selectedBibleUuid = signal<string | null>(null);
    bible = computed(() => {
        const uuid = this.selectedBibleUuid();
        if (!uuid) return null;
        return this.bibleForUuid(uuid);
    });

    constructor() {
        // Use effect to auto-select first bible when bibles load
        effect(() => {
            const bibles = this.bibles();
            const currentUuid = this.selectedBibleUuid();
            if (bibles.length > 0 && !currentUuid) {
                this.selectBible(bibles[0].uuid);
            }
        });

        // Call afterBibleLoad when bibles are loaded
        effect(() => {
            const bibles = this.bibles();
            if (bibles.length > 0) {
                this.afterBibleLoad();
            }
        });

        // Call afterBibleSelect when bible changes
        effect(() => {
            const bible = this.bible();
            if (bible) {
                this.afterBibleSelect();
            }
        });
    }

    abstract afterBibleLoad(): void;
    abstract afterBibleSelect(): void;

    selectBible(uuid: string) {
        this.selectedBibleUuid.set(uuid);
    }

    highlighted(words: string, inText: string): string {
        const s = words.trim();
        let result = inText;
        if (s.length > 0) {
            const terms = s.split(/\s+/);
            // Sort terms by length
            terms.sort(function (a, b) {
                return b.length - a.length;
            });
            const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            // Regex to simultaneously replace terms
            const regex = new RegExp('(' + escapedTerms.join('|') + ')', 'gi');
            result = inText.replace(regex, '<span class="highlight">$&</span>');
        }
        return result;
    }

    verseMailTo(verse: Verse) {
        const bible = this.bible();
        const bookName = verse.book?.name ?? 'Unknown';
        return "mailto:?subject=" + bookName + '%20' + verse.chapter + ':' + verse.ordinal
            + '%20-%20' + (bible?.name ?? '')
            + '&body=%22' + verse.text
            + '%0D%0A%0D%0A--%0D%0APowered by Bibler.';
    }

    protected bibleForUuid(uuid: string): Bible | null {
        return this.objectForUuid(this.bibles(), uuid);
    }

    protected objectForUuid<T extends Uuidable>(array: Array<T>, uuid: string): T | null {
        for (let i = 0; i < array.length; i++) {
            if (array[i].uuid == uuid) {
                return array[i];
            }
        }
        return null;
    }

}
