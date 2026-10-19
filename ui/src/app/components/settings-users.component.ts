import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RbacAdminService, AdminUserSummary } from '../services/rbac-admin.service';
import { ToastService } from '../services/toast.service';
import { SessionRole } from '../models/session';
import { PageMeta, SortDirection } from '../models/pagination';
import { ServerTableControlsComponent } from './server-table-controls.component';

@Component({
  selector: 'settings-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ServerTableControlsComponent],
  templateUrl: 'settings-users.html'
})
export class SettingsUsersComponent implements OnInit {
  private rbac = inject(RbacAdminService);
  private toast = inject(ToastService);

  users = signal<AdminUserSummary[]>([]);
  meta = signal<PageMeta | null>(null);
  allRoles = signal<SessionRole[]>([]);
  error = signal('');
  loading = signal(false);

  q = signal('');
  sort = signal('username');
  direction = signal<SortDirection>('asc');
  page = signal(1);
  perPage = signal(25);

  createUsername = signal('');
  createEmail = signal('');
  createName = signal('');
  createPassword = signal('');
  createRoleIds = signal<number[]>([]);

  readonly sortable = [
    { label: 'Username', value: 'username' },
    { label: 'Email', value: 'email' },
    { label: 'Name', value: 'name' },
    { label: 'Created', value: 'created_at' },
    { label: 'Updated', value: 'updated_at' }
  ];

  ngOnInit(): void {
    this.rbac.listRoles().subscribe({
      next: (r) => this.allRoles.set(r.roles),
      error: () => {}
    });
    this.load();
  }

  load(resetPage = false): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.rbac
      .listUsers({
        q: this.q().trim() || undefined,
        sort: this.sort(),
        direction: this.direction(),
        page: this.page(),
        per_page: this.perPage()
      })
      .subscribe({
        next: (r) => {
          this.users.set(r.users);
          this.meta.set(r.meta ?? null);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(e.error?.error ?? 'Could not load users.');
          this.loading.set(false);
        }
      });
  }

  toggleCreateRole(id: number, checked: boolean): void {
    this.createRoleIds.update((ids) => {
      const set = new Set(ids);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  }

  createUser(): void {
    const username = this.createUsername().trim();
    const email = this.createEmail().trim();
    const name = this.createName().trim();
    const password = this.createPassword();
    if (!username || !email || !name || !password) {
      this.error.set('Username, email, name, and password are required.');
      return;
    }
    this.error.set('');
    this.rbac
      .createUser({
        username,
        email,
        name,
        password,
        password_confirmation: password,
        role_ids: this.createRoleIds().length ? this.createRoleIds() : undefined
      })
      .subscribe({
        next: () => {
          this.toast.success('Saved.');
          this.createUsername.set('');
          this.createEmail.set('');
          this.createName.set('');
          this.createPassword.set('');
          this.createRoleIds.set([]);
          this.load(true);
        },
        error: (e) => {
          const msg = e.error?.errors?.join?.(', ') ?? e.error?.error ?? 'Create failed.';
          this.error.set(msg);
          this.toast.danger(msg);
        }
      });
  }
}
