// Author: Preston Lee

import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root'
})
export class BiblerService {

	private root: string;

	constructor() {
		const w = globalThis as typeof globalThis & { BIBLER_SERVER_URL?: string };
		this.root = w.BIBLER_SERVER_URL ?? '';
		if (!this.root) {
			const msg = 'BIBLER_SERVER_URL is not set. This UI application will not function without it!';
			console.error(msg);
			throw new Error(msg);
		}
	}

	getUrl(): string {
		return this.root;
	}

	search(text: string): Object[] {
		return [];
	}

}
