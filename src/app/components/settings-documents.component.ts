// Author: Preston Lee

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentsService } from '../services/documents.service';
import { DocumentRecord } from '../models/sermon';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-settings-documents',
  templateUrl: 'settings-documents.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SettingsDocumentsComponent implements OnInit {
  private readonly documents = inject(DocumentsService);
  private readonly toast = inject(ToastService);

  list = signal<DocumentRecord[]>([]);
  query = signal('');
  loading = signal(false);
  pendingConfirmation = signal<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.documents.list(this.query().trim() || undefined).subscribe({
      next: (r) => {
        this.list.set(r.documents ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.danger('Could not load documents.');
      }
    });
  }

  onQueryChange(v: string): void {
    this.query.set(v);
  }

  applySearch(): void {
    this.load();
  }

  requestDeleteDocument(f: DocumentRecord): void {
    this.pendingConfirmation.set({
      title: 'Delete document?',
      message: `Delete “${f.original_filename}”?`,
      confirmLabel: 'Delete',
      onConfirm: () => this.performDeleteDocument(f)
    });
  }

  cancelConfirmation(): void {
    this.pendingConfirmation.set(null);
  }

  confirmPendingAction(): void {
    const pending = this.pendingConfirmation();
    if (!pending) return;
    this.pendingConfirmation.set(null);
    pending.onConfirm();
  }

  private performDeleteDocument(f: DocumentRecord): void {
    this.documents.destroy(f.uuid).subscribe({
      next: () => {
        this.toast.success('Deleted.');
        this.load();
      },
      error: () => this.toast.danger('Delete failed.')
    });
  }
}
