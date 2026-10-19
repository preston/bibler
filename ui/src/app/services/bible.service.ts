// Autho: Preston Lee

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { BiblerService } from './bibler.service';
import { Bible } from '../models/bible';

@Injectable({
	providedIn: 'root'
})
export class BibleService {

	private path = '/bibles.json';

	constructor(private biblerService: BiblerService, private http: HttpClient) {
	}

	index() {
		const url = this.biblerService.getUrl() + this.path;
		return this.http.get<Bible[]>(url);
	}

}
