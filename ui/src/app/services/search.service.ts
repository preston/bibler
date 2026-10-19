// Author: Preston Lee

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Verse } from 'bibler-core';

import { BiblerService } from './bibler.service';

@Injectable({
	providedIn: 'root'
})
export class SearchService {

    constructor(private biblerService: BiblerService, private http: HttpClient) {}

    search(bibleUuid: string, searchText: string) {
        const url = `${this.biblerService.getUrl()}/bibles/${encodeURIComponent(bibleUuid)}/search`;
        return this.http.post<Verse[]>(url, { text: searchText });
    }
}
