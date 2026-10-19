import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'danger';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

const SUCCESS_DEDUP_MS = 2000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _items = signal<ToastItem[]>([]);
  readonly items = this._items.asReadonly();

  private lastSuccessMessage = '';
  private lastSuccessAt = 0;

  success(message: string): void {
    const now = Date.now();
    if (message === this.lastSuccessMessage && now - this.lastSuccessAt < SUCCESS_DEDUP_MS) {
      return;
    }
    this.lastSuccessMessage = message;
    this.lastSuccessAt = now;
    this.enqueue({ id: crypto.randomUUID(), message, variant: 'success' });
  }

  danger(message: string): void {
    this.enqueue({ id: crypto.randomUUID(), message, variant: 'danger' });
  }

  remove(id: string): void {
    this._items.update((list) => list.filter((t) => t.id !== id));
  }

  private enqueue(item: ToastItem): void {
    this._items.update((list) => [...list, item]);
  }
}
