// Author: Preston Lee

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudyPlanItemEditorComponent } from './study-plan-item-editor.component';
import { StudyPlanWorkspaceBaseComponent } from './study-plan-workspace-base.component';

@Component({
  selector: 'app-study-plan-blank',
  templateUrl: './study-plan-blank.html',
  standalone: true,
  imports: [CommonModule, StudyPlanItemEditorComponent]
})
export class StudyPlanBlankComponent extends StudyPlanWorkspaceBaseComponent {}
