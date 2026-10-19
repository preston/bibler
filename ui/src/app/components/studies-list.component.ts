// Author: Preston Lee

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StudiesService } from '../services/studies.service';
import { StudiesUiStateService } from '../services/studies-ui-state.service';
import { AuthTokenService } from '../services/auth-token.service';
import { PageMeta, SortDirection } from '../models/pagination';
import { ServerTableControlsComponent } from './server-table-controls.component';
import { Study, defaultStudyViewMode } from '../models/study';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-studies-list',
  templateUrl: 'studies-list.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ServerTableControlsComponent]
})
export class StudiesListComponent implements OnInit {
  private readonly studiesUiState = inject(StudiesUiStateService);

  /** Same signal as {@link StudiesUiStateService.studyMode} — survives route-driven remounts. */
  readonly studyMode = this.studiesUiState.studyMode;

  ownedStudies = signal<Study[]>([]);
  publicStudies = signal<Study[]>([]);
  publicStudiesMeta = signal<PageMeta | null>(null);
  publicPage = signal(1);
  publicSearchDraft = signal('');
  publicListQuery = signal('');
  publicSort = signal('updated_at');
  publicDirection = signal<SortDirection>('desc');
  publicPerPage = signal(25);
  readonly publicStudiesSortColumns = [
    { label: 'Updated', value: 'updated_at' },
    { label: 'Created', value: 'created_at' },
    { label: 'Title', value: 'title' },
    { label: 'Visibility', value: 'visibility' }
  ];
  createTitle = signal('');
  createGoal = signal('');
  error = signal('');
  loading = signal(false);
  readonly canCreateStudy = computed(
    () => this.createTitle().trim().length > 0 && this.createGoal().trim().length > 0
  );

  readonly isSignedIn = computed(() => !!this.authToken.token()?.trim());

  private readonly toast = inject(ToastService);

  constructor(
    private studiesService: StudiesService,
    private router: Router,
    private authToken: AuthTokenService
  ) {}

  ngOnInit(): void {
    this.loadStudies();
  }

  loadStudies(): void {
    this.error.set('');
    this.publicPage.set(1);
    const hasToken = !!this.authToken.token()?.trim();

    if (hasToken) {
      this.studiesService.index({ scope: 'owned' }).subscribe({
        next: (response) => {
          this.ownedStudies.set(response.studies);
          this.loadPublicStudiesOnly();
        },
        error: () => {
          this.ownedStudies.set([]);
          this.loadPublicStudiesOnly();
        }
      });
    } else {
      this.ownedStudies.set([]);
      this.loadPublicStudiesOnly();
    }
  }

  private loadPublicStudiesOnly(): void {
    const q = this.publicListQuery().trim();
    this.studiesService
      .listPaged({
        scope: 'public',
        sort: this.publicSort(),
        direction: this.publicDirection(),
        page: this.publicPage(),
        per_page: this.publicPerPage(),
        ...(q ? { q } : {})
      })
      .subscribe({
        next: (r) => {
          this.publicStudies.set(r.studies);
          this.publicStudiesMeta.set(r.meta ?? null);
          const m = r.meta;
          if (m) {
            if (m.sort) this.publicSort.set(m.sort);
            if (m.direction) this.publicDirection.set(m.direction);
            if (m.per_page) this.publicPerPage.set(m.per_page);
            if (m.page) this.publicPage.set(m.page);
            if (m.q !== undefined) this.publicListQuery.set(m.q);
          }
        },
        error: () => this.error.set('Unable to load public studies.')
      });
  }

  onPublicSearchDraftChange(value: string): void {
    this.publicSearchDraft.set(value);
  }

  applyPublicSearch(): void {
    this.publicListQuery.set(this.publicSearchDraft().trim());
    this.publicPage.set(1);
    this.loadPublicStudiesOnly();
  }

  onPublicPageChange(page: number): void {
    if (page < 1) return;
    this.publicPage.set(page);
    this.loadPublicStudiesOnly();
  }

  onPublicPerPageChange(per: number): void {
    this.publicPerPage.set(per);
    this.publicPage.set(1);
    this.loadPublicStudiesOnly();
  }

  onPublicSortChange(sort: string): void {
    this.publicSort.set(sort);
    this.publicPage.set(1);
    this.loadPublicStudiesOnly();
  }

  onPublicDirectionChange(dir: SortDirection): void {
    this.publicDirection.set(dir);
    this.publicPage.set(1);
    this.loadPublicStudiesOnly();
  }

  createStudy(): void {
    if (!this.authToken.token()?.trim()) {
      this.error.set('Sign in to create a study.');
      return;
    }
    if (!this.canCreateStudy()) {
      this.error.set('A study title and goal are required.');
      return;
    }
    this.loading.set(true);
    this.studiesService
      .create({
        title: this.createTitle().trim(),
        goal: this.createGoal().trim(),
        visibility: 'private'
      })
      .subscribe({
      next: (response) => {
        this.loading.set(false);
        this.studyMode.set(defaultStudyViewMode(response.study));
        this.toast.success('Saved.');
        void this.router.navigate(['/studies', response.study.uuid]);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Unable to create study.');
        this.toast.danger('Unable to create study.');
      }
    });
  }

  openStudy(studyUuid: string): void {
    const uuid = studyUuid.trim();
    if (!uuid) return;
    this.studyMode.set('participant');
    void this.router.navigate(['/studies', uuid]);
  }

  /** My studies: default sidebar view from server RBAC (owner vs co-leader). */
  openOwnedStudy(studyUuid: string): void {
    const row = this.ownedStudies().find((s) => s.uuid === studyUuid);
    this.studyMode.set(row ? defaultStudyViewMode(row) : 'leader');
    const uuid = studyUuid.trim();
    if (!uuid) return;
    void this.router.navigate(['/studies', uuid]);
  }

  formatStudyTotalDuration(study: Study): string {
    const minutes = study.total_duration_minutes ?? 0;
    if (!Number.isFinite(minutes) || minutes <= 0) return '—';
    return `${Math.trunc(minutes)}m`;
  }
}
