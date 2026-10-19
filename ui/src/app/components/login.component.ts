import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../services/session.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: 'login.html'
})
export class LoginComponent implements OnInit {
  private session = inject(SessionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  username = signal('');
  password = signal('');
  error = signal('');
  loading = signal(false);

  readonly user = this.session.user;

  ngOnInit(): void {
    if (this.session.isLoggedIn()) {
      void this.router.navigateByUrl(this.returnUrl());
    }
  }

  private returnUrl(): string {
    const r = this.route.snapshot.queryParamMap.get('returnUrl');
    return r?.startsWith('/') && !r.startsWith('//') ? r : '/studies';
  }

  submit(): void {
    this.error.set('');
    this.loading.set(true);
    this.session.login(this.username().trim(), this.password()).subscribe({
      next: () => {
        this.loading.set(false);
        this.password.set('');
        this.toast.success('Signed in.');
        void this.router.navigateByUrl(this.returnUrl());
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e.error?.error ?? 'Login failed.');
      }
    });
  }

  logout(): void {
    this.session.logout().subscribe({
      next: () => this.toast.success('Signed out.')
    });
  }
}
