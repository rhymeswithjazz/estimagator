import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { AdminUser, PagedResult } from '../../core/models/admin.models';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Users</h1>
        <div class="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Search users..."
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      @if (isLoading()) {
        <div class="text-center py-8">
          <div class="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      } @else {
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verified</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (user of users(); track user.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ user.email }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ user.displayName }}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="px-2 py-1 text-xs rounded-full font-medium"
                      [class.bg-purple-100]="user.role === 'Admin'"
                      [class.text-purple-800]="user.role === 'Admin'"
                      [class.bg-gray-100]="user.role === 'User'"
                      [class.text-gray-800]="user.role === 'User'"
                    >
                      {{ user.role }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    @if (user.emailVerified) {
                      <span class="text-green-600 text-sm">Yes</span>
                    } @else {
                      <span class="text-red-600 text-sm">No</span>
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ user.sessionCount }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(user.createdAt) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a
                      [routerLink]="['/admin/users', user.id]"
                      class="text-emerald-600 hover:text-emerald-900"
                    >
                      View
                    </a>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (result(); as r) {
          @if (r.totalCount > r.pageSize) {
            <div class="flex justify-between items-center">
              <p class="text-sm text-gray-700">
                Showing {{ (r.page - 1) * r.pageSize + 1 }} to
                {{ min(r.page * r.pageSize, r.totalCount) }} of
                {{ r.totalCount }} users
              </p>
              <div class="flex space-x-2">
                <button
                  (click)="loadPage(r.page - 1)"
                  [disabled]="r.page <= 1"
                  class="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  (click)="loadPage(r.page + 1)"
                  [disabled]="r.page * r.pageSize >= r.totalCount"
                  class="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
})
export class UserListComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly isLoading = signal(false);
  readonly search = signal('');
  readonly result = signal<PagedResult<AdminUser> | null>(null);
  readonly users = signal<AdminUser[]>([]);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    try {
      const result = await this.adminService.getUsers(1, 20, this.search() || undefined);
      this.result.set(result);
      this.users.set(result.items);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadPage(page: number): Promise<void> {
    this.isLoading.set(true);
    try {
      const result = await this.adminService.getUsers(page, 20, this.search() || undefined);
      this.result.set(result);
      this.users.set(result.items);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => this.loadUsers(), 300);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  min(a: number, b: number): number {
    return Math.min(a, b);
  }
}
