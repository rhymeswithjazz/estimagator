import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { ModalService } from '../../core/services/modal.service';
import { AdminUserDetail } from '../../core/models/admin.models';

@Component({
  selector: 'app-user-edit',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <a routerLink="/admin/users" class="text-emerald-600 hover:text-emerald-900">
          &larr; Back to Users
        </a>
      </div>

      @if (isLoading()) {
        <div class="text-center py-8">
          <div class="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      } @else if (user()) {
        <div class="bg-white shadow rounded-lg p-6">
          <h1 class="text-2xl font-bold text-gray-900 mb-6">{{ user()!.email }}</h1>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                [ngModel]="displayName()"
                (ngModelChange)="displayName.set($event)"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Role</label>
              <select
                [ngModel]="role()"
                (ngModelChange)="role.set($event)"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="User">User</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Email Verified</label>
              <select
                [ngModel]="emailVerified().toString()"
                (ngModelChange)="emailVerified.set($event === 'true')"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Created</label>
              <p class="mt-2 text-gray-900">{{ formatDate(user()!.createdAt) }}</p>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap gap-4">
            <button
              (click)="saveUser()"
              [disabled]="isSaving()"
              class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {{ isSaving() ? 'Saving...' : 'Save Changes' }}
            </button>

            @if (!user()!.emailVerified) {
              <button
                (click)="resendVerification()"
                [disabled]="isResending()"
                class="px-4 py-2 border border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
              >
                {{ isResending() ? 'Sending...' : 'Resend Verification' }}
              </button>
            }

            @if (user()!.role !== 'Admin') {
              <button
                (click)="deleteUser()"
                [disabled]="isDeleting()"
                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {{ isDeleting() ? 'Deleting...' : 'Delete User' }}
              </button>
            }
          </div>

          @if (message()) {
            <div
              class="mt-4 p-4 rounded-lg"
              [class.bg-green-100]="!isError()"
              [class.text-green-800]="!isError()"
              [class.bg-red-100]="isError()"
              [class.text-red-800]="isError()"
            >
              {{ message() }}
            </div>
          }
        </div>

        <!-- User Sessions -->
        <div class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Sessions ({{ user()!.sessions.length }})
          </h2>
          @if (user()!.sessions.length === 0) {
            <p class="text-gray-500">No sessions found</p>
          } @else {
            <div class="space-y-2">
              @for (session of user()!.sessions; track session.id) {
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center space-x-3">
                    <span class="font-mono font-medium">{{ session.accessCode }}</span>
                    @if (session.name) {
                      <span class="text-gray-500">{{ session.name }}</span>
                    }
                    @if (session.isOrganizer) {
                      <span class="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-medium">
                        Organizer
                      </span>
                    }
                  </div>
                  <div class="flex items-center space-x-4">
                    <span
                      class="px-2 py-0.5 text-xs rounded font-medium"
                      [class.bg-green-100]="session.isActive"
                      [class.text-green-800]="session.isActive"
                      [class.bg-gray-100]="!session.isActive"
                      [class.text-gray-600]="!session.isActive"
                    >
                      {{ session.isActive ? 'Active' : 'Ended' }}
                    </span>
                    <a
                      [routerLink]="['/admin/sessions', session.id]"
                      class="text-emerald-600 hover:text-emerald-900 text-sm"
                    >
                      View
                    </a>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class UserEditComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modalService = inject(ModalService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly isResending = signal(false);
  readonly user = signal<AdminUserDetail | null>(null);
  readonly displayName = signal('');
  readonly role = signal('User');
  readonly emailVerified = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.loadUser(id);
  }

  async loadUser(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const user = await this.adminService.getUser(id);
      this.user.set(user);
      this.displayName.set(user.displayName);
      this.role.set(user.role);
      this.emailVerified.set(user.emailVerified);
    } catch {
      this.router.navigate(['/admin/users']);
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveUser(): Promise<void> {
    this.isSaving.set(true);
    this.message.set('');
    try {
      await this.adminService.updateUser(this.user()!.id, {
        displayName: this.displayName(),
        role: this.role(),
        emailVerified: this.emailVerified(),
      });
      this.message.set('User updated successfully');
      this.isError.set(false);
    } catch {
      this.message.set('Failed to update user');
      this.isError.set(true);
    } finally {
      this.isSaving.set(false);
    }
  }

  async resendVerification(): Promise<void> {
    this.isResending.set(true);
    this.message.set('');
    try {
      await this.adminService.resendVerification(this.user()!.id);
      this.message.set('Verification email sent');
      this.isError.set(false);
    } catch {
      this.message.set('Failed to send verification email');
      this.isError.set(true);
    } finally {
      this.isResending.set(false);
    }
  }

  async deleteUser(): Promise<void> {
    const confirmed = await this.modalService.confirm({
      title: 'Delete User',
      message: 'Are you sure you want to delete this user? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmStyle: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    try {
      await this.adminService.deleteUser(this.user()!.id);
      this.router.navigate(['/admin/users']);
    } catch {
      this.message.set('Failed to delete user');
      this.isError.set(true);
    } finally {
      this.isDeleting.set(false);
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
