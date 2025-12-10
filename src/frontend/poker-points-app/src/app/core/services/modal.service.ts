import { Injectable, signal, computed } from '@angular/core';
import { ConfirmModalConfig } from '../../shared/components/confirm-modal.component';

export interface AlertModalConfig {
  title: string;
  message: string;
  buttonText?: string;
  style?: 'error' | 'success' | 'info';
}

interface ConfirmModalState {
  isOpen: boolean;
  config: ConfirmModalConfig;
  resolve: ((value: boolean) => void) | null;
}

interface AlertModalState {
  isOpen: boolean;
  config: AlertModalConfig;
  resolve: (() => void) | null;
}

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  private readonly confirmState = signal<ConfirmModalState>({
    isOpen: false,
    config: { title: '', message: '' },
    resolve: null,
  });

  private readonly alertState = signal<AlertModalState>({
    isOpen: false,
    config: { title: '', message: '' },
    resolve: null,
  });

  // Public signals for components to consume
  readonly isConfirmOpen = computed(() => this.confirmState().isOpen);
  readonly confirmConfig = computed(() => this.confirmState().config);

  readonly isAlertOpen = computed(() => this.alertState().isOpen);
  readonly alertConfig = computed(() => this.alertState().config);

  /**
   * Show a confirmation modal and return a promise that resolves to true/false
   */
  confirm(config: ConfirmModalConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmState.set({
        isOpen: true,
        config,
        resolve,
      });
    });
  }

  /**
   * Handle confirmation from the modal
   */
  handleConfirm(): void {
    const state = this.confirmState();
    if (state.resolve) {
      state.resolve(true);
    }
    this.confirmState.set({
      isOpen: false,
      config: { title: '', message: '' },
      resolve: null,
    });
  }

  /**
   * Handle cancellation from the modal
   */
  handleCancel(): void {
    const state = this.confirmState();
    if (state.resolve) {
      state.resolve(false);
    }
    this.confirmState.set({
      isOpen: false,
      config: { title: '', message: '' },
      resolve: null,
    });
  }

  /**
   * Show an alert modal and return a promise that resolves when dismissed
   */
  alert(config: AlertModalConfig): Promise<void> {
    return new Promise((resolve) => {
      this.alertState.set({
        isOpen: true,
        config,
        resolve,
      });
    });
  }

  /**
   * Handle dismissal of the alert modal
   */
  handleAlertDismiss(): void {
    const state = this.alertState();
    if (state.resolve) {
      state.resolve();
    }
    this.alertState.set({
      isOpen: false,
      config: { title: '', message: '' },
      resolve: null,
    });
  }
}
