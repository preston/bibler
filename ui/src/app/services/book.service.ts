// Author: Preston Lee

import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';

import {BiblerService} from './bibler.service';
import { Book } from '../models/book';
import { Bible } from '../models/bible';
import { scriptureBookPath } from './api-url';

@Injectable({
	providedIn: 'root'
})
export class BookService {
	constructor(private biblerService: BiblerService, private http: HttpClient) {
	}

	index(bible: Bible) {
		const url = this.biblerService.getUrl() + '/bibles/' + bible.uuid + '/books';
		return this.http.get<Book[]>(url);
	}

	chaptersFor(bible: Bible, book: Book) {
		const url = this.biblerService.getUrl() + scriptureBookPath(bible.uuid, book.uuid) + '/chapters';
		return this.http.get<number[]>(url);
	}

}
