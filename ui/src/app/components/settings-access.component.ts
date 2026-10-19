import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SessionService } from '../services/session.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'settings-access',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: 'settings-access.html'
})
export class SettingsAccessComponent {
  readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly user = this.session.user;
  readonly permissions = this.session.permissions;

  logout(): void {
    this.session.logout().subscribe({
      next: () => this.toast.success('Signed out.')
    });
  }
}
