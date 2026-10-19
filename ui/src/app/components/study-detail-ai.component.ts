// Author: Preston Lee

import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { STUDY_DETAIL_API } from './study-detail-api.token';

@Component({
  selector: 'app-study-detail-ai',
  templateUrl: 'study-detail-ai.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink]
})
export class StudyDetailAiComponent implements OnDestroy {
  readonly vm = inject(STUDY_DETAIL_API);

  ngOnDestroy(): void {
    this.vm.cancelAssistantRun();
  }
}
