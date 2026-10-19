// Author: Preston Lee

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { STUDY_DETAIL_API } from './study-detail-api.token';

@Component({
  selector: 'study-plan-item-editor',
  templateUrl: './study-plan-item-editor.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class StudyPlanItemEditorComponent {
  readonly vm = inject(STUDY_DETAIL_API);
}
