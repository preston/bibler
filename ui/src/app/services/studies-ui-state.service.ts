import { Injectable, signal } from '@angular/core';
import { StudyMode } from '../models/study';

/**
 * Holds Studies UI state that must survive navigation between `studies` and `studies/:uuid`.
 * Those routes use separate config entries and recreate list/detail components, which would
 * otherwise reset per-instance signals (e.g. study mode after creating a study as leader).
 */
@Injectable({ providedIn: 'root' })
export class StudiesUiStateService {
  readonly studyMode = signal<StudyMode>('participant');
}
