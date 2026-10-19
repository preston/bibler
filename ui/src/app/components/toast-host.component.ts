import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'toast-host.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastHostComponent {
  private readonly toastService = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly toasts = this.toastService.items;
  private readonly shownIds = new Set<string>();

  constructor() {
    afterRenderEffect(() => {
      const list = this.toasts();
      for (const t of list) {
        if (this.shownIds.has(t.id)) continue;
        const el = this.host.nativeElement.querySelector(`#toast-${t.id}`);
        if (!(el instanceof HTMLElement)) continue;
        const bootstrapApi = (window as unknown as { bootstrap?: { Toast?: { getOrCreateInstance: (element: HTMLElement, config?: Record<string, unknown>) => { show: () => void } } } }).bootstrap;
        const toastFactory = bootstrapApi?.Toast;
        if (!toastFactory) continue;
        this.shownIds.add(t.id);
        const instance = toastFactory.getOrCreateInstance(el, { autohide: true, delay: 5000 });
        const onHidden = (): void => {
          el.removeEventListener('hidden.bs.toast', onHidden);
          this.shownIds.delete(t.id);
          this.toastService.remove(t.id);
        };
        el.addEventListener('hidden.bs.toast', onHidden);
        instance.show();
      }
    });
  }
}
