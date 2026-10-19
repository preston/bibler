// Author: Preston Lee

import { InjectionToken } from '@angular/core';
import type { StudyDetailComponent } from './study-detail.component';

/** Routed children (e.g. details panel) access shared study UI state via this token. */
export const STUDY_DETAIL_API = new InjectionToken<StudyDetailComponent>('STUDY_DETAIL_API');
