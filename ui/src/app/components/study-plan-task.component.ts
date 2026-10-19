// Author: Preston Lee

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StudyTask } from '../models/study';
import { StudyPlanItemEditorComponent } from './study-plan-item-editor.component';
import { StudyPlanWorkspaceBaseComponent } from './study-plan-workspace-base.component';

@Component({
  selector: 'app-study-plan-task',
  templateUrl: './study-plan-task.html',
  standalone: true,
  imports: [CommonModule, FormsModule, StudyPlanItemEditorComponent]
})
export class StudyPlanTaskComponent extends StudyPlanWorkspaceBaseComponent {
  /** Whether this task’s status matches the segment (for `active` / `aria-pressed`). */
  isTaskStatusSegment(task: StudyTask, segment: 'open' | 'in_progress' | 'completed'): boolean {
    return (task.status ?? '') === segment;
  }
}
