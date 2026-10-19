import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Bible } from '../models/bible';
import { PageMeta, SortDirection } from '../models/pagination';
import { SystemSettingsService } from '../services/system-settings.service';
import { ToastService } from '../services/toast.service';
import { ServerTableControlsComponent } from './server-table-controls.component';

@Component({
  selector: 'settings-ai',
  standalone: true,
  imports: [CommonModule, ServerTableControlsComponent],
  templateUrl: 'settings-ai.html'
})
export class SettingsAiComponent implements OnInit {
  bibles = signal<Bible[]>([]);
  meta = signal<PageMeta | null>(null);
  error = signal('');
  loading = signal(false);

  q = signal('');
  sort = signal('name');
  direction = signal<SortDirection>('asc');
  page = signal(1);
  perPage = signal(25);

  readonly sortable = [
    { label: 'Name', value: 'name' },
    { label: 'UUID', value: 'uuid' },
    { label: 'Language', value: 'language' },
    { label: 'Abbreviation', value: 'abbreviation' },
    { label: 'Updated', value: 'updated_at' }
  ];

  private readonly toast = inject(ToastService);

  constructor(private settingsService: SystemSettingsService) {}

  ngOnInit(): void {
    this.load();
  }

  load(resetPage = false): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.settingsService.getAiDefaults({
      q: this.q().trim() || undefined,
      sort: this.sort(),
      direction: this.direction(),
      page: this.page(),
      per_page: this.perPage()
    }).subscribe({
      next: (r) => {
        this.bibles.set(r.bibles);
        this.meta.set(r.meta ?? null);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Could not load AI defaults.');
        this.loading.set(false);
      }
    });
  }

  saveDefaults(): void {
    this.settingsService.saveAiDefaults(this.bibles()).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Could not save default Bible settings.');
        this.toast.danger(e.error?.error ?? 'Could not save default Bible settings.');
      }
    });
  }
}
