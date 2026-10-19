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
    const url = `${this.bibler.getUrl()}/sermons.json`;
    return this.http.get<{ sermons: Sermon[]; meta?: PageMeta }>(url, {
      params: pagedQueryToParams(query)
    });
  }

  show(uuid: string): Observable<{ sermon: Sermon }> {
    return this.http.get<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons/${uuid}.json`);
  }

  create(payload: Partial<Sermon>): Observable<{ sermon: Sermon }> {
    return this.http.post<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons.json`, { sermon: payload });
  }

  update(uuid: string, payload: Partial<Sermon>): Observable<{ sermon: Sermon }> {
    return this.http.patch<{ sermon: Sermon }>(`${this.bibler.getUrl()}/sermons/${uuid}.json`, { sermon: payload });
  }

  destroy(uuid: string): Observable<unknown> {
    return this.http.delete(`${this.bibler.getUrl()}/sermons/${uuid}.json`);
  }

  sections(sermonUuid: string): Observable<{ sermon_sections: SermonSection[] }> {
    return this.http.get<{ sermon_sections: SermonSection[] }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections.json`
    );
  }

  createSection(sermonUuid: string, payload: Partial<SermonSection>): Observable<{ sermon_section: SermonSection }> {
    return this.http.post<{ sermon_section: SermonSection }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections.json`,
      { sermon_section: payload }
    );
  }

  updateSection(
    sermonUuid: string,
    sectionUuid: string,
    payload: Partial<SermonSection>
  ): Observable<{ sermon_section: SermonSection }> {
    return this.http.patch<{ sermon_section: SermonSection }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}.json`,
      { sermon_section: payload }
    );
  }

  destroySection(sermonUuid: string, sectionUuid: string): Observable<unknown> {
    return this.http.delete(`${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}.json`);
  }

  sectionVerses(sermonUuid: string, sectionUuid: string): Observable<{ sermon_section_verses: SermonSectionVerse[] }> {
    return this.http.get<{ sermon_section_verses: SermonSectionVerse[] }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses.json`
    );
  }

  createSectionVerse(
    sermonUuid: string,
    sectionUuid: string,
    payload: Partial<SermonSectionVerse>
  ): Observable<{ sermon_section_verse: SermonSectionVerse }> {
    return this.http.post<{ sermon_section_verse: SermonSectionVerse }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses.json`,
      { sermon_section_verse: payload }
    );
  }

  updateSectionVerse(
    sermonUuid: string,
    sectionUuid: string,
    verseUuid: string,
    payload: Partial<SermonSectionVerse>
  ): Observable<{ sermon_section_verse: SermonSectionVerse }> {
    return this.http.patch<{ sermon_section_verse: SermonSectionVerse }>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses/${verseUuid}.json`,
      { sermon_section_verse: payload }
    );
  }

  destroySectionVerse(sermonUuid: string, sectionUuid: string, verseUuid: string): Observable<unknown> {
    return this.http.delete(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/sections/${sectionUuid}/verses/${verseUuid}.json`
    );
  }

  versePass(
    sermonUuid: string,
    body: {
      message: string;
      document_uuids?: string[];
      replace_sections?: boolean;
      target_duration_minutes?: number | null;
    }
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/ai/verse_pass.json`,
      body
    );
  }

  outlinePass(
    sermonUuid: string,
    body: { message: string; document_uuids?: string[]; target_duration_minutes?: number | null }
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.bibler.getUrl()}/sermons/${sermonUuid}/ai/outline_pass.json`,
      body
    );
  }
}
