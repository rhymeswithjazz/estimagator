import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';
import { ModalService } from '../../core/services/modal.service';
import { AdminSessionDetail } from '../../core/models/admin.models';

@Component({
  selector: 'app-session-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <a routerLink="/admin/sessions" class="text-emerald-600 hover:text-emerald-900">
          &larr; Back to Sessions
        </a>
      </div>

      @if (isLoading()) {
        <div class="text-center py-8">
          <div class="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      } @else if (session()) {
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 font-mono">{{ session()!.accessCode }}</h1>
              @if (session()!.name) {
                <p class="text-gray-600 mt-1">{{ session()!.name }}</p>
              }
            </div>
            <span
              class="px-3 py-1 rounded-full text-sm font-medium"
              [class.bg-green-100]="session()!.isActive"
              [class.text-green-800]="session()!.isActive"
              [class.bg-gray-100]="!session()!.isActive"
              [class.text-gray-600]="!session()!.isActive"
            >
              {{ session()!.isActive ? 'Active' : 'Ended' }}
            </span>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p class="text-sm text-gray-500">Deck Type</p>
              <p class="font-medium capitalize">{{ session()!.deckType }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Created</p>
              <p class="font-medium">{{ formatDate(session()!.createdAt) }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Participants</p>
              <p class="font-medium">{{ session()!.participants.length }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Stories</p>
              <p class="font-medium">{{ session()!.stories.length }}</p>
            </div>
          </div>

          @if (session()!.organizer) {
            <div class="mb-6">
              <p class="text-sm text-gray-500">Organizer</p>
              <a
                [routerLink]="['/admin/users', session()!.organizer!.id]"
                class="text-emerald-600 hover:text-emerald-900"
              >
                {{ session()!.organizer!.email }} ({{ session()!.organizer!.displayName }})
              </a>
            </div>
          }

          <div class="flex flex-wrap gap-4">
            <a
              [href]="'/game/' + session()!.accessCode"
              target="_blank"
              class="px-4 py-2 border border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50"
            >
              Open Game Room
            </a>
            <button
              (click)="deleteSession()"
              [disabled]="isDeleting()"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {{ isDeleting() ? 'Deleting...' : 'Delete Session' }}
            </button>
          </div>
        </div>

        <!-- Participants -->
        <div class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Participants ({{ session()!.participants.length }})
          </h2>
          @if (session()!.participants.length === 0) {
            <p class="text-gray-500">No participants</p>
          } @else {
            <div class="space-y-2">
              @for (p of session()!.participants; track p.id) {
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center space-x-2">
                    <span class="font-medium">{{ p.displayName }}</span>
                    @if (p.isOrganizer) {
                      <span class="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded font-medium">
                        Organizer
                      </span>
                    }
                    @if (p.isObserver) {
                      <span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded font-medium">
                        Observer
                      </span>
                    }
                  </div>
                  @if (p.userId) {
                    <a
                      [routerLink]="['/admin/users', p.userId]"
                      class="text-emerald-600 hover:text-emerald-900 text-sm"
                    >
                      View User
                    </a>
                  } @else {
                    <span class="text-gray-400 text-sm">Guest</span>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Stories -->
        <div class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">
            Stories ({{ session()!.stories.length }})
          </h2>
          @if (session()!.stories.length === 0) {
            <p class="text-gray-500">No stories</p>
          } @else {
            <div class="space-y-2">
              @for (story of session()!.stories; track story.id) {
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center space-x-2">
                    <span class="font-medium">{{ story.title }}</span>
                    <span
                      class="px-2 py-0.5 text-xs rounded font-medium"
                      [class.bg-yellow-100]="story.status === 'pending'"
                      [class.text-yellow-800]="story.status === 'pending'"
                      [class.bg-blue-100]="story.status === 'active'"
                      [class.text-blue-800]="story.status === 'active'"
                      [class.bg-green-100]="story.status === 'completed'"
                      [class.text-green-800]="story.status === 'completed'"
                    >
                      {{ story.status }}
                    </span>
                  </div>
                  <div class="text-gray-500 text-sm space-x-4">
                    @if (story.finalScore !== null) {
                      <span class="font-medium">Score: {{ story.finalScore }}</span>
                    }
                    <span>{{ story.voteCount }} votes</span>
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
export class SessionDetailComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modalService = inject(ModalService);

  readonly isLoading = signal(true);
  readonly isDeleting = signal(false);
  readonly session = signal<AdminSessionDetail | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    this.loadSession(id);
  }

  async loadSession(id: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const session = await this.adminService.getSession(id);
      this.session.set(session);
    } catch {
      this.router.navigate(['/admin/sessions']);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteSession(): Promise<void> {
    const confirmed = await this.modalService.confirm({
      title: 'Delete Session',
      message: 'Are you sure you want to delete this session? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmStyle: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    try {
      await this.adminService.deleteSession(this.session()!.id);
      this.router.navigate(['/admin/sessions']);
    } catch {
      await this.modalService.alert({
        title: 'Error',
        message: 'Failed to delete session. Please try again.',
        buttonText: 'OK',
        style: 'error',
      });
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
