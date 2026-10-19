import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'bibler_bearer_token';

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private tokenState = signal(localStorage.getItem(STORAGE_KEY) ?? '');

  token(): string {
    return this.tokenState();
  }

  setToken(token: string): void {
    const trimmed = token.trim();
    this.tokenState.set(trimmed);
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
