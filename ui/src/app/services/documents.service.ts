// Author: Preston Lee

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BiblerService } from './bibler.service';
import { DocumentRecord } from '../models/sermon';

@Injectable({
  providedIn: 'root'
})
export class DocumentsService {
  constructor(private bibler: BiblerService, private http: HttpClient) {}

  list(q?: string): Observable<{ documents: DocumentRecord[] }> {
    let params = new HttpParams();
    if (q?.trim()) params = params.set('q', q.trim());
    return this.http.get<{ documents: DocumentRecord[] }>(`${this.bibler.getUrl()}/documents.json`, { params });
  }

  show(uuid: string): Observable<{ document: DocumentRecord }> {
    return this.http.get<{ document: DocumentRecord }>(`${this.bibler.getUrl()}/documents/${uuid}.json`);
  }

  create(payload: { original_filename: string; extracted_text: string }): Observable<{ document: DocumentRecord }> {
    return this.http.post<{ document: DocumentRecord }>(`${this.bibler.getUrl()}/documents.json`, {
      document: payload
    });
  }

  update(
    uuid: string,
    payload: Partial<Pick<DocumentRecord, 'original_filename' | 'extracted_text'>>
  ): Observable<{ document: DocumentRecord }> {
    return this.http.patch<{ document: DocumentRecord }>(`${this.bibler.getUrl()}/documents/${uuid}.json`, {
      document: payload
    });
  }

  destroy(uuid: string): Observable<unknown> {
    return this.http.delete(`${this.bibler.getUrl()}/documents/${uuid}.json`);
  }
}
