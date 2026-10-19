// Author: Preston Lee

import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SessionService } from '../services/session.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-header',
  templateUrl: 'header.html',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent {
  readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  /** System menu (API, Settings): global administrator only. */
  readonly showSystemMenu = computed(() => this.session.hasAdministratorPermission());

  logout(): void {
    this.session.logout().subscribe({
      next: () => this.toast.success('Signed out.')
    });
  }
}
