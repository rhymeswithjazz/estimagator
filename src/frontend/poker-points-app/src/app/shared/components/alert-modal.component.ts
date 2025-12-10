import { Component, input, output } from '@angular/core';
import { AlertModalConfig } from '../../core/services/modal.service';

@Component({
  selector: 'app-alert-modal',
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
          <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            @switch (config().style) {
              @case ('error') {
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
              }
              @case ('success') {
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              }
              @default {
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
              }
            }
            <h3 class="text-lg font-semibold text-gray-900">{{ config().title }}</h3>
          </div>

          <!-- Body -->
          <div class="px-6 py-4">
            <p class="text-gray-600">{{ config().message }}</p>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 bg-gray-50 flex justify-end">
            <button
              (click)="onDismiss()"
              class="px-4 py-2 rounded-lg transition-colors"
              [class]="buttonClasses"
            >
              {{ config().buttonText || 'OK' }}
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
export class AlertModalComponent {
  readonly isOpen = input.required<boolean>();
  readonly config = input.required<AlertModalConfig>();

  readonly dismissed = output<void>();

  get buttonClasses(): string {
    const style = this.config().style || 'info';
    switch (style) {
      case 'error':
        return 'bg-red-600 text-white hover:bg-red-700';
      case 'success':
        return 'bg-green-600 text-white hover:bg-green-700';
      default:
        return 'bg-emerald-600 text-white hover:bg-emerald-700';
    }
  }

  onDismiss(): void {
    this.dismissed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onDismiss();
    }
  }
}
