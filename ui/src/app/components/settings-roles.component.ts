import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RbacAdminService, RolePayload } from '../services/rbac-admin.service';
import { ToastService } from '../services/toast.service';
import { SessionRole } from '../models/session';

@Component({
  selector: 'settings-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: 'settings-roles.html'
})
export class SettingsRolesComponent implements OnInit {
  private rbac = inject(RbacAdminService);
  private toast = inject(ToastService);

  roles = signal<SessionRole[]>([]);
  pendingDeleteRole = signal<SessionRole | null>(null);
  error = signal('');
  loading = signal(false);

  newRole = signal<RolePayload>({
    name: '',
    default: false,
    administrator: false,
    bibles: false,
    access: false,
    curation: false
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.rbac.listRoles().subscribe({
      next: (r) => {
        this.roles.set(r.roles);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Could not load roles.');
        this.loading.set(false);
      }
    });
  }

  create(): void {
    const n = this.newRole().name.trim();
    if (!n) return;
    this.rbac.createRole({ ...this.newRole(), name: n }).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.newRole.set({
          name: '',
          default: false,
          administrator: false,
          bibles: false,
          access: false,
          curation: false
        });
        this.load();
      },
      error: (e) => {
        const msg = e.error?.errors?.join?.(', ') ?? e.error?.error ?? 'Create failed.';
        this.error.set(msg);
        this.toast.danger(msg);
      }
    });
  }

  toggleFlag(role: SessionRole, key: 'default' | 'administrator' | 'bibles' | 'access' | 'curation', value: boolean): void {
    const payload: Partial<RolePayload> = { [key]: value };
    this.rbac.updateRole(role.id, payload).subscribe({
      next: () => {
        this.toast.success('Saved.');
        this.load();
      },
      error: (e) => {
        const msg = e.error?.errors?.join?.(', ') ?? 'Update failed.';
        this.error.set(msg);
        this.toast.danger(msg);
      }
    });
  }

  requestDeleteRole(role: SessionRole): void {
    this.pendingDeleteRole.set(role);
  }

  cancelDeleteRole(): void {
    this.pendingDeleteRole.set(null);
  }

  confirmDeleteRole(): void {
    const role = this.pendingDeleteRole();
    if (!role) return;
    this.pendingDeleteRole.set(null);
    this.rbac.deleteRole(role.id).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.load();
      },
      error: (e) => {
        const msg = e.error?.error ?? 'Delete failed.';
        this.error.set(msg);
        this.toast.danger(msg);
      }
    });
  }

  patchNewRole(patch: Partial<RolePayload>): void {
    this.newRole.update((v) => ({ ...v, ...patch }));
  }
}
