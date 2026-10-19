// Author: Preston Lee

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StudyPlanItemEditorComponent } from './study-plan-item-editor.component';
import { StudyPlanWorkspaceBaseComponent } from './study-plan-workspace-base.component';

@Component({
  selector: 'app-study-plan-question',
  templateUrl: './study-plan-question.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StudyPlanItemEditorComponent]
})
export class StudyPlanQuestionComponent extends StudyPlanWorkspaceBaseComponent {}
