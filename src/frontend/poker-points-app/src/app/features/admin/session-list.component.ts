import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';
import { AdminSession, PagedResult } from '../../core/models/admin.models';

@Component({
  selector: 'app-session-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Sessions</h1>
        <div class="flex items-center space-x-4">
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="onStatusChange($event)"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Ended</option>
          </select>
          <input
            type="text"
            placeholder="Search sessions..."
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organizer</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deck</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participants</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stories</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (session of sessions(); track session.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900">
                    {{ session.accessCode }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ session.name || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ session.organizerEmail || 'Guest' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {{ session.deckType }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="px-2 py-1 text-xs rounded-full font-medium"
                      [class.bg-green-100]="session.isActive"
                      [class.text-green-800]="session.isActive"
                      [class.bg-gray-100]="!session.isActive"
                      [class.text-gray-600]="!session.isActive"
                    >
                      {{ session.isActive ? 'Active' : 'Ended' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ session.participantCount }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ session.storyCount }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(session.createdAt) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a
                      [routerLink]="['/admin/sessions', session.id]"
                      class="text-emerald-600 hover:text-emerald-900"
                    >
                      View
                    </a>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="px-6 py-8 text-center text-gray-500">
                    No sessions found
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
                {{ r.totalCount }} sessions
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
export class SessionListComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly isLoading = signal(false);
  readonly search = signal('');
  readonly statusFilter = signal('all');
  readonly result = signal<PagedResult<AdminSession> | null>(null);
  readonly sessions = signal<AdminSession[]>([]);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadSessions();
  }

  async loadSessions(): Promise<void> {
    this.isLoading.set(true);
    try {
      const isActive =
        this.statusFilter() === 'all' ? undefined : this.statusFilter() === 'active';
      const result = await this.adminService.getSessions(
        1,
        20,
        this.search() || undefined,
        isActive
      );
      this.result.set(result);
      this.sessions.set(result.items);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadPage(page: number): Promise<void> {
    this.isLoading.set(true);
    try {
      const isActive =
        this.statusFilter() === 'all' ? undefined : this.statusFilter() === 'active';
      const result = await this.adminService.getSessions(
        page,
        20,
        this.search() || undefined,
        isActive
      );
      this.result.set(result);
      this.sessions.set(result.items);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => this.loadSessions(), 300);
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value);
    this.loadSessions();
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
