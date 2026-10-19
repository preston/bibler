import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BiblerService } from './bibler.service';
import { Bible } from '../models/bible';
import { PageMeta, PagedQuery } from '../models/pagination';
import { pagedQueryToParams } from './paged-query-params';

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  constructor(private http: HttpClient, private biblerService: BiblerService) {}

  getAiDefaults(query?: PagedQuery): Observable<{ bibles: Bible[]; meta?: PageMeta }> {
    return this.http.get<{ bibles: Bible[]; meta?: PageMeta }>(`${this.biblerService.getUrl()}/system/settings/ai_defaults`, {
      params: pagedQueryToParams(query)
    });
  }

  saveAiDefaults(defaults: Partial<Bible>[]): Observable<{ bibles: Bible[] }> {
    return this.http.patch<{ bibles: Bible[] }>(
      `${this.biblerService.getUrl()}/system/settings/ai_defaults`,
      { defaults }
    );
  }

}
