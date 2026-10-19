// Author: Preston Lee

import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';

import {BiblerService} from './bibler.service';
import { Book } from '../models/book';
import { Bible } from '../models/bible';

@Injectable({
	providedIn: 'root'
})
export class BookService {
	constructor(private biblerService: BiblerService, private http: HttpClient) {
	}

	index(bible: Bible) {
		const url = this.biblerService.getUrl() + '/bibles/' + bible.uuid + '/books.json';
		return this.http.get<Book[]>(url);
	}

	chaptersFor(bible: Bible, book: Book) {
		// Server chapter-list endpoint is currently verse-scoped (/:bible_uuid/:book_uuid.json).
		const url = this.biblerService.getUrl() + '/' + bible.uuid + '/' + book.uuid + '.json';
		return this.http.get<number[]>(url);
	}

}
