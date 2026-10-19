// Author: Preston Lee

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SermonsService } from '../services/sermons.service';
import { AuthTokenService } from '../services/auth-token.service';
import { PageMeta, SortDirection } from '../models/pagination';
import { ServerTableControlsComponent } from './server-table-controls.component';
import { Sermon } from '../models/sermon';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-sermons-list',
  templateUrl: 'sermons-list.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ServerTableControlsComponent]
})
export class SermonsListComponent implements OnInit {
  ownedSermons = signal<Sermon[]>([]);
  publicSermons = signal<Sermon[]>([]);
  publicSermonsMeta = signal<PageMeta | null>(null);
  publicPage = signal(1);
  publicSearchDraft = signal('');
  publicListQuery = signal('');
  publicSort = signal('updatedAt');
  publicDirection = signal<SortDirection>('desc');
  publicPerPage = signal(25);
  readonly publicSermonsSortColumns = [
    { label: 'Updated', value: 'updatedAt' },
    { label: 'Created', value: 'createdAt' },
    { label: 'Title', value: 'title' },
    { label: 'Visibility', value: 'visibility' }
  ];
  createTitle = signal('');
  error = signal('');
  loading = signal(false);
  readonly canCreateSermon = computed(() => this.createTitle().trim().length > 0);
  readonly isSignedIn = computed(() => !!this.authToken.token()?.trim());

  private readonly toast = inject(ToastService);

  constructor(
    private sermonsService: SermonsService,
    private router: Router,
    private authToken: AuthTokenService
  ) {}

  ngOnInit(): void {
    this.loadSermons();
  }

  loadSermons(): void {
    this.error.set('');
    this.publicPage.set(1);
    const hasToken = !!this.authToken.token()?.trim();

    if (hasToken) {
      this.sermonsService.listPaged({ scope: 'owned' }).subscribe({
        next: (response) => {
          this.ownedSermons.set(response.sermons);
          this.loadPublicSermonsOnly();
        },
        error: () => {
          this.ownedSermons.set([]);
          this.loadPublicSermonsOnly();
        }
      });
    } else {
      this.ownedSermons.set([]);
      this.loadPublicSermonsOnly();
    }
  }

  private loadPublicSermonsOnly(): void {
    const q = this.publicListQuery().trim();
    this.sermonsService
      .listPaged({
        scope: 'public',
        sort: this.publicSort(),
        direction: this.publicDirection(),
        page: this.publicPage(),
        perPage: this.publicPerPage(),
        ...(q ? { q } : {})
      })
      .subscribe({
        next: (r) => {
          this.publicSermons.set(r.sermons);
          this.publicSermonsMeta.set(r.meta ?? null);
          const m = r.meta;
          if (m) {
            if (m.sort) this.publicSort.set(m.sort);
            if (m.direction) this.publicDirection.set(m.direction);
            if (m.perPage) this.publicPerPage.set(m.perPage);
            if (m.page) this.publicPage.set(m.page);
            if (m.q !== undefined) this.publicListQuery.set(m.q);
          }
        },
        error: () => this.error.set('Unable to load public sermons.')
      });
  }

  onPublicSearchDraftChange(value: string): void {
    this.publicSearchDraft.set(value);
  }

  applyPublicSearch(): void {
    this.publicListQuery.set(this.publicSearchDraft().trim());
    this.publicPage.set(1);
    this.loadPublicSermonsOnly();
  }

  onPublicPageChange(page: number): void {
    if (page < 1) return;
    this.publicPage.set(page);
    this.loadPublicSermonsOnly();
  }

  onPublicPerPageChange(per: number): void {
    this.publicPerPage.set(per);
    this.publicPage.set(1);
    this.loadPublicSermonsOnly();
  }

  onPublicSortChange(sort: string): void {
    this.publicSort.set(sort);
    this.publicPage.set(1);
    this.loadPublicSermonsOnly();
  }

  onPublicDirectionChange(dir: SortDirection): void {
    this.publicDirection.set(dir);
    this.publicPage.set(1);
    this.loadPublicSermonsOnly();
  }

  createSermon(): void {
    if (!this.authToken.token()?.trim()) {
      this.error.set('Sign in to create a sermon.');
      return;
    }
    if (!this.canCreateSermon()) {
      this.error.set('A title is required.');
      return;
    }
    this.loading.set(true);
    this.sermonsService
      .create({
        title: this.createTitle().trim(),
        visibility: 'private'
      })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          this.toast.success('Saved.');
          void this.router.navigate(['/sermons', response.sermon.uuid]);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Unable to create sermon.');
          this.toast.danger('Unable to create sermon.');
        }
      });
  }

  openSermon(uuid: string): void {
    const id = uuid.trim();
    if (!id) return;
    void this.router.navigate(['/sermons', id]);
  }
}
