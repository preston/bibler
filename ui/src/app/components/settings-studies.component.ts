import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Study } from '../models/study';
import { PageMeta, SortDirection } from '../models/pagination';
import { StudiesService } from '../services/studies.service';
import { ServerTableControlsComponent } from './server-table-controls.component';
import { ToastService } from '../services/toast.service';
@Component({
  selector: 'settings-studies',
  standalone: true,
  imports: [CommonModule, ServerTableControlsComponent],
  templateUrl: 'settings-studies.html'
})
export class SettingsStudiesComponent implements OnInit {
  studies = signal<Study[]>([]);
  meta = signal<PageMeta | null>(null);
  error = signal('');
  loading = signal(false);
  q = signal('');
  sort = signal('updated_at');
  direction = signal<SortDirection>('desc');
  page = signal(1);
  perPage = signal(25);

  readonly sortable = [
    { label: 'Updated', value: 'updated_at' },
    { label: 'Created', value: 'created_at' },
    { label: 'Title', value: 'title' },
    { label: 'Visibility', value: 'visibility' }
  ];

  private readonly toast = inject(ToastService);

  constructor(private studiesService: StudiesService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  load(resetPage = false): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.studiesService.listPaged({
      scope: 'public',
      q: this.q().trim() || undefined,
      sort: this.sort(),
      direction: this.direction(),
      page: this.page(),
      per_page: this.perPage()
    }).subscribe({
      next: (r) => {
        this.studies.set(r.studies);
        this.meta.set(r.meta ?? null);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Could not load studies.');
        this.loading.set(false);
      }
    });
  }

  openStudy(study: Study): void {
    void this.router.navigate(['/studies', study.uuid]);
  }

  deleteStudy(study: Study): void {
    this.studiesService.destroy(study.uuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.load();
      },
      error: () => {
        this.error.set('Could not delete study.');
        this.toast.danger('Could not delete study.');
      }
    });
  }
}
