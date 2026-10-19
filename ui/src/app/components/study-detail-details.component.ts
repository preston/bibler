// Author: Preston Lee

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { STUDY_DETAIL_API } from './study-detail-api.token';

@Component({
  selector: 'app-study-detail-details',
  templateUrl: 'study-detail-details.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink]
})
export class StudyDetailDetailsComponent {
  readonly vm = inject(STUDY_DETAIL_API);
}
