import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'settings-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: 'settings-shell.html'
})
export class SettingsShellComponent {
  readonly session = inject(SessionService);
}
