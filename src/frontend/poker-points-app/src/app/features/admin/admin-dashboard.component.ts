import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Total Users</div>
          <div class="mt-2 text-3xl font-bold text-gray-900">{{ userCount() }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Total Sessions</div>
          <div class="mt-2 text-3xl font-bold text-gray-900">{{ sessionCount() }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Active Sessions</div>
          <div class="mt-2 text-3xl font-bold text-emerald-600">{{ activeSessionCount() }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm font-medium text-gray-500">Ended Sessions</div>
          <div class="mt-2 text-3xl font-bold text-gray-400">{{ sessionCount() - activeSessionCount() }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a
          routerLink="/admin/users"
          class="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h2 class="text-lg font-semibold text-gray-900">User Management</h2>
          <p class="mt-2 text-gray-600">View, edit, and manage registered users</p>
          <div class="mt-4 text-emerald-600 font-medium">View Users &rarr;</div>
        </a>

        <a
          routerLink="/admin/sessions"
          class="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h2 class="text-lg font-semibold text-gray-900">Session Management</h2>
          <p class="mt-2 text-gray-600">View and manage estimation sessions</p>
          <div class="mt-4 text-emerald-600 font-medium">View Sessions &rarr;</div>
        </a>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly userCount = signal(0);
  readonly sessionCount = signal(0);
  readonly activeSessionCount = signal(0);

  async ngOnInit(): Promise<void> {
    const [users, sessions, activeSessions] = await Promise.all([
      this.adminService.getUsers(1, 1),
      this.adminService.getSessions(1, 1),
      this.adminService.getSessions(1, 1, undefined, true),
    ]);

    this.userCount.set(users.totalCount);
    this.sessionCount.set(sessions.totalCount);
    this.activeSessionCount.set(activeSessions.totalCount);
  }
}
