// Author: Preston Lee

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { BiblerService } from './bibler.service';

@Injectable({
	providedIn: 'root'
})
export class SearchService {

    // private verses;

    constructor(private biblerService: BiblerService, private http: HttpClient) {
    }

    search(bibleUuid: string, searchText: string) {
        var url = this.biblerService.getUrl() + '/' + bibleUuid + '/search.json';
        var headers = new HttpHeaders();
        headers.append('Content-Type', 'application/x-www-form-urlencoded');

        // var args = "text=" + searchText;
        return this.http.post(url, null, { headers: headers, params: { text: searchText } });//.toPromise().then(res => res.json());
    }

}
