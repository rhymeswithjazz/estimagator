import { Component, input, output } from '@angular/core';

export interface ConfirmModalConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: 'danger' | 'primary';
}

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        (click)="onBackdropClick($event)"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

        <!-- Modal -->
        <div
          class="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-100">
            <h3 class="text-lg font-semibold text-gray-900">{{ config().title }}</h3>
          </div>

          <!-- Body -->
          <div class="px-6 py-4">
            <p class="text-gray-600">{{ config().message }}</p>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 bg-gray-50 flex justify-end gap-3">
            <button
              (click)="onCancel()"
              class="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {{ config().cancelText || 'Cancel' }}
            </button>
            <button
              (click)="onConfirm()"
              class="px-4 py-2 rounded-lg transition-colors"
              [class]="confirmButtonClasses"
            >
              {{ config().confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes zoom-in-95 {
      from { transform: scale(0.95); }
      to { transform: scale(1); }
    }
    .animate-in {
      animation: fade-in 0.2s ease-out, zoom-in-95 0.2s ease-out;
    }
  `],
})
export class ConfirmModalComponent {
  readonly isOpen = input.required<boolean>();
  readonly config = input.required<ConfirmModalConfig>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  get confirmButtonClasses(): string {
    const style = this.config().confirmStyle || 'primary';
    if (style === 'danger') {
      return 'bg-red-600 text-white hover:bg-red-700';
    }
    return 'bg-emerald-600 text-white hover:bg-emerald-700';
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
