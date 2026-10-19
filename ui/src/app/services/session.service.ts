import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { BiblerService } from './bibler.service';
import { AuthTokenService } from './auth-token.service';
import { SessionResponse, SessionUser, SessionPermissions, SessionRole } from '../models/session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private http = inject(HttpClient);
  private bibler = inject(BiblerService);
  private authToken = inject(AuthTokenService);

  readonly user = signal<SessionUser | null>(null);
  readonly permissions = signal<SessionPermissions | null>(null);
  readonly roles = signal<SessionRole[]>([]);

  constructor() {
    this.tryRefreshFromStoredToken();
  }

  tryRefreshFromStoredToken(): void {
    const t = this.authToken.token();
    if (!t) {
      this.clearSessionState();
      return;
    }
    this.http.get<SessionResponse>(`${this.bibler.getUrl()}/session.json`).subscribe({
      next: (r) => this.applySessionPayload(r),
      error: () => this.clearSessionState()
    });
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<SessionResponse>(`${this.bibler.getUrl()}/session.json`, { username, password })
      .pipe(
        tap((r) => {
          this.authToken.setToken(r.token);
          this.applySessionPayload(r);
        }),
        map(() => void 0)
      );
  }

  logout(): Observable<void> {
    return this.http.delete(`${this.bibler.getUrl()}/session.json`).pipe(
      tap(() => {
        this.authToken.setToken('');
        this.clearSessionState();
      }),
      map(() => void 0),
      catchError(() => {
        this.authToken.setToken('');
        this.clearSessionState();
        return of(void 0);
      })
    );
  }

  isLoggedIn(): boolean {
    return !!this.user();
  }

  /** Global administrator (from role grants merged on the server). */
  hasAdministratorPermission(): boolean {
    if (!this.user()) {
      return false;
    }
    return !!this.permissions()?.administrator;
  }

  hasAccessPermission(): boolean {
    const p = this.permissions();
    return !!(p?.administrator || p?.access);
  }

  hasBiblesPermission(): boolean {
    const p = this.permissions();
    return !!(p?.administrator || p?.bibles);
  }

  /** Moderate or manage any study (server: curation role or administrator). */
  hasCurationPermission(): boolean {
    const p = this.permissions();
    return !!(p?.administrator || p?.curation);
  }

  /**
   * Loads `/session` when a token exists but permissions are not yet available
   * (e.g. fresh page load). No-op when already loaded or no token.
   */
  ensureSessionLoaded(): Observable<void> {
    if (!this.authToken.token()?.trim()) {
      return of(void 0);
    }
    if (this.permissions() !== null && this.user()) {
      return of(void 0);
    }
    return this.http.get<SessionResponse>(`${this.bibler.getUrl()}/session.json`).pipe(
      tap((r) => this.applySessionPayload(r)),
      map(() => void 0),
      catchError(() => {
        this.clearSessionState();
        return of(void 0);
      })
    );
  }

  private applySessionPayload(r: SessionResponse): void {
    this.user.set(r.user);
    this.permissions.set(r.permissions);
    this.roles.set(r.roles ?? []);
  }

  private clearSessionState(): void {
    this.user.set(null);
    this.permissions.set(null);
    this.roles.set([]);
  }
}
