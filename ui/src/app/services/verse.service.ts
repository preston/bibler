// Author: Preston Lee

import {Injectable} from '@angular/core'
import {HttpClient} from '@angular/common/http';
import { Observable } from 'rxjs';

import {BiblerService} from './bibler.service';
import { Book } from '../models/book';
import { Bible } from '../models/bible';
import { ComparatorAiCommentaryRequest, ComparatorAiSseMessage, Verse } from '../models/verse';

@Injectable({
	providedIn: 'root'
})
export class VerseService {
	constructor(private biblerService: BiblerService, private http: HttpClient) {
	}

	index(bible: Bible, book: Book, chapter: number) {
		const url = this.biblerService.getUrl() + '/' + bible.uuid + '/' + book.uuid + '/' + chapter;
		return this.http.get<Verse[]>(url);
	}

	/**
	 * POSTs bible/book UUIDs and chapter to `/ai/comparator_commentary` (verse text is loaded server-side).
	 * Replays the JSON response as a sequence of `ComparatorAiSseMessage` events (status → verse × n → complete).
	 */
	requestComparatorAiCommentary(payload: ComparatorAiCommentaryRequest): Observable<ComparatorAiSseMessage> {
		return new Observable<ComparatorAiSseMessage>((subscriber) => {
			const ac = new AbortController();
			(async () => {
				try {
					await this.runComparatorCommentaryRequest(payload, subscriber, ac.signal);
				} catch (e) {
					if ((e as Error).name === 'AbortError') {
						subscriber.complete();
					} else {
						subscriber.error(e);
					}
				}
			})();

			return () => ac.abort();
		});
	}

	private async runComparatorCommentaryRequest(
		payload: ComparatorAiCommentaryRequest,
		subscriber: {
			next: (v: ComparatorAiSseMessage) => void;
			error: (e: unknown) => void;
			complete: () => void;
		},
		signal: AbortSignal
	): Promise<void> {
		subscriber.next({ event: 'status', data: { message: 'Generating AI commentary...' } });
		const url = `${this.biblerService.getUrl()}/ai/comparator_commentary`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal
		});
		const bodyText = await response.text();
		if (!response.ok) {
			subscriber.error(new Error(bodyText || 'Comparator AI commentary request failed.'));
			return;
		}

		let outputPayload: unknown = null;
		try {
			const parsed = JSON.parse(bodyText) as { output?: unknown; error?: string };
			if (parsed.error) {
				subscriber.error(new Error(parsed.error));
				return;
			}
			outputPayload = parsed.output ?? null;
		} catch {
			subscriber.error(new Error('Comparator AI commentary returned malformed JSON.'));
			return;
		}

		const parsedOutput = this.normalizeComparatorOutput(outputPayload);
		if (!parsedOutput) {
			subscriber.error(new Error('Comparator AI commentary output did not match expected schema.'));
			return;
		}

		const verses = parsedOutput.verses ?? [];
		for (const verse of verses) {
			subscriber.next({ event: 'verse', data: verse });
		}
		subscriber.next({ event: 'complete', data: {} });
		subscriber.complete();
	}

	private normalizeComparatorOutput(output: unknown): { verses?: Array<Record<string, unknown>> } | null {
		if (output && typeof output === 'object') {
			return output as { verses?: Array<Record<string, unknown>> };
		}

		if (typeof output !== 'string' || output.trim() === '') return null;
		try {
			return JSON.parse(output) as { verses?: Array<Record<string, unknown>> };
		} catch {
			return null;
		}
	}

}
