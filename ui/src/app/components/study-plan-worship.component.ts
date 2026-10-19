// Author: Preston Lee

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StudyPlanItemEditorComponent } from './study-plan-item-editor.component';
import { StudyPlanWorkspaceBaseComponent } from './study-plan-workspace-base.component';

@Component({
  selector: 'app-study-plan-worship',
  templateUrl: './study-plan-worship.html',
  standalone: true,
  imports: [CommonModule, FormsModule, StudyPlanItemEditorComponent]
})
export class StudyPlanWorshipComponent extends StudyPlanWorkspaceBaseComponent {}
