import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageMeta, SortDirection } from '../models/pagination';

@Component({
  selector: 'server-table-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: 'server-table-controls.html'
})
export class ServerTableControlsComponent {
  /** Unique suffix so floating-label `for`/`id` pairs stay valid when multiple instances render on one page. */
  private static _instanceSeq = 0;
  readonly instanceId = ++ServerTableControlsComponent._instanceSeq;

  @Input() query = '';
  @Input() sort = '';
  @Input() direction: SortDirection = 'desc';
  @Input() meta: PageMeta | null = null;
  @Input() sortableColumns: Array<{ label: string; value: string }> = [];

  @Output() queryChange = new EventEmitter<string>();
  @Output() sortChange = new EventEmitter<string>();
  @Output() directionChange = new EventEmitter<SortDirection>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() perPageChange = new EventEmitter<number>();
  @Output() search = new EventEmitter<void>();

  emitPerPage(v: unknown): void {
    const n = Number(v);
    this.perPageChange.emit(Number.isFinite(n) && n > 0 ? n : 25);
  }

  emitDirection(v: unknown): void {
    this.directionChange.emit(v === 'asc' ? 'asc' : 'desc');
  }

  onSearchEnter(event: Event): void {
    event.preventDefault();
    this.search.emit();
  }
}
