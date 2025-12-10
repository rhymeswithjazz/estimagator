import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ModalService } from '../../core/services/modal.service';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal.component';
import { AlertModalComponent } from '../../shared/components/alert-modal.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmModalComponent, AlertModalComponent],
  template: `
    <div class="min-h-screen bg-gray-100">
      <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex items-center">
              <a routerLink="/" class="flex items-center text-xl font-bold text-emerald-600">
                Estimagator
              </a>
              <span class="ml-4 px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">
                Admin
              </span>
            </div>
            <div class="flex items-center space-x-1">
              <a
                routerLink="/admin"
                routerLinkActive="bg-emerald-50 text-emerald-700"
                [routerLinkActiveOptions]="{ exact: true }"
                class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md"
              >
                Dashboard
              </a>
              <a
                routerLink="/admin/users"
                routerLinkActive="bg-emerald-50 text-emerald-700"
                class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md"
              >
                Users
              </a>
              <a
                routerLink="/admin/sessions"
                routerLinkActive="bg-emerald-50 text-emerald-700"
                class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md"
              >
                Sessions
              </a>
              <div class="w-px h-6 bg-gray-300 mx-2"></div>
              <a
                routerLink="/"
                class="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md"
              >
                Exit Admin
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <router-outlet />
      </main>
    </div>

    <!-- Global Modals -->
    <app-confirm-modal
      [isOpen]="modalService.isConfirmOpen()"
      [config]="modalService.confirmConfig()"
      (confirmed)="modalService.handleConfirm()"
      (cancelled)="modalService.handleCancel()"
    />
    <app-alert-modal
      [isOpen]="modalService.isAlertOpen()"
      [config]="modalService.alertConfig()"
      (dismissed)="modalService.handleAlertDismiss()"
    />
  `,
})
export class AdminLayoutComponent {
  readonly authService = inject(AuthService);
  readonly modalService = inject(ModalService);
}
