// Author: Preston Lee

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BiblerService } from './bibler.service';
import { Sermon, SermonSection, SermonSectionVerse } from '../models/sermon';
import { PageMeta, PagedQuery } from '../models/pagination';
import { pagedQueryToParams } from './paged-query-params';

@Injectable({
  providedIn: 'root'
})
export class SermonsService {
  constructor(private bibler: BiblerService, private http: HttpClient) {}

  listPaged(query?: PagedQuery): Observable<{ sermons: Sermon[]; meta?: PageMeta }> {
    const url = `${this.bibler.getUrl()}/sermons`;
    return this.http.get<{ sermons: Sermon[]; meta?: PageMeta }>(url, {
      params: pagedQueryToParams(query)
    });
  }

  show(uuid: string): Observable<{ sermon: Sermon }> {
    return this.http.get<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons/${uuid}`);
  }

  create(payload: Partial<Sermon>): Observable<{ sermon: Sermon }> {
    return this.http.post<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons`, { sermon: payload });
  }

  update(uuid: string, payload: Partial<Sermon>): Observable<{ sermon: Sermon }> {
    return this.http.patch<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons/${uuid}`, { sermon: payload });
  }

  destroy(uuid: string): Observable<unknown> {
    return this.http.delete(`${this.bibler.getUrl()}/sermons/${uuid}`);
  }

  sections(sermonUuid: string): Observable<{ sermonSections: SermonSection[] }> {
    return this.http.get<{ sermonSections: SermonSection[] }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections`
    );
  }

  createSection(sermonUuid: string, payload: Partial<SermonSection>): Observable<{ sermonSection: SermonSection }> {
    return this.http.post<{ sermonSection: SermonSection }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections`,
      { sermonSection: payload }
    );
  }

  updateSection(
    sermonUuid: string,
    sectionUuid: string,
    payload: Partial<SermonSection>
  ): Observable<{ sermonSection: SermonSection }> {
    return this.http.patch<{ sermonSection: SermonSection }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}`,
      { sermonSection: payload }
    );
  }

  destroySection(sermonUuid: string, sectionUuid: string): Observable<unknown> {
    return this.http.delete(`${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}`);
  }

  sectionVerses(sermonUuid: string, sectionUuid: string): Observable<{ sermonSectionVerses: SermonSectionVerse[] }> {
    return this.http.get<{ sermonSectionVerses: SermonSectionVerse[] }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses`
    );
  }

  createSectionVerse(
    sermonUuid: string,
    sectionUuid: string,
    payload: Partial<SermonSectionVerse>
  ): Observable<{ sermonSectionVerse: SermonSectionVerse }> {
    return this.http.post<{ sermonSectionVerse: SermonSectionVerse }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses`,
      { sermonSectionVerse: payload }
    );
  }

  updateSectionVerse(
    sermonUuid: string,
    sectionUuid: string,
    verseUuid: string,
    payload: Partial<SermonSectionVerse>
  ): Observable<{ sermonSectionVerse: SermonSectionVerse }> {
    return this.http.patch<{ sermonSectionVerse: SermonSectionVerse }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses/${verseUuid}`,
      { sermonSectionVerse: payload }
    );
  }

  destroySectionVerse(sermonUuid: string, sectionUuid: string, verseUuid: string): Observable<unknown> {
    return this.http.delete(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses/${verseUuid}`
    );
  }

  versePass(
    sermonUuid: string,
    body: {
      message: string;
      documentUuids?: string[];
      replaceSections?: boolean;
      targetDurationMinutes?: number | null;
    }
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/ai/verse-pass`,
      body
    );
  }

  outlinePass(
    sermonUuid: string,
    body: { message: string; documentUuids?: string[]; targetDurationMinutes?: number | null }
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/ai/outline-pass`,
      body
    );
  }
}
