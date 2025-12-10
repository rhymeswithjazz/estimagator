import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex justify-end" (click)="close.emit()">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/20"></div>

      <!-- Panel -->
      <div
        class="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full"
        (click)="$event.stopPropagation()"
      >
        <!-- Panel Header -->
        <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-display font-bold text-gray-900">Session Settings</h2>
          <button
            (click)="close.emit()"
            class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Panel Content -->
        <div class="flex-1 overflow-auto p-4 space-y-6">
          <!-- Story Queue Section (Organizer only) -->
          @if (isOrganizer()) {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wider">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Story Queue
                  @if (storyQueue().length > 0) {
                    <span class="bg-poker-green-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {{ storyQueue().length }}
                    </span>
                  }
                </div>
              </div>

              <!-- Add Stories Section -->
              @if (isAddingStories()) {
                <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div class="text-sm font-medium text-gray-700">Add Multiple Stories</div>
                  <p class="text-xs text-gray-500">
                    One story per line. Optionally add a URL with a tab or " | " separator.
                  </p>
                  <textarea
                    [ngModel]="newStoriesText()"
                    (ngModelChange)="newStoriesText.set($event)"
                    placeholder="Story 1&#10;Story 2 | https://link.com&#10;Story 3&#9;https://another.link"
                    class="w-full h-32 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-poker-green-500 focus:ring-2 focus:ring-poker-green-500/20 resize-none"
                  ></textarea>
                  <div class="flex gap-2">
                    <button
                      (click)="addBatchStories()"
                      class="flex-1 px-3 py-2 text-sm font-medium bg-poker-green-500 text-white rounded-lg hover:bg-poker-green-600 transition-colors"
                    >
                      Add Stories
                    </button>
                    <button
                      (click)="cancelAddStories()"
                      class="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              } @else {
                <!-- Quick Add Single Story -->
                <div class="space-y-2">
                  <input
                    type="text"
                    [ngModel]="newStoryTitle()"
                    (ngModelChange)="newStoryTitle.set($event)"
                    placeholder="Story title..."
                    class="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-poker-green-500 focus:ring-2 focus:ring-poker-green-500/20"
                    (keyup.enter)="addSingleStory()"
                  />
                  <input
                    type="url"
                    [ngModel]="newStoryUrl()"
                    (ngModelChange)="newStoryUrl.set($event)"
                    placeholder="URL (optional)"
                    class="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-poker-green-500 focus:ring-2 focus:ring-poker-green-500/20"
                    (keyup.enter)="addSingleStory()"
                  />
                  <div class="flex gap-2">
                    <button
                      (click)="addSingleStory()"
                      [disabled]="!newStoryTitle().trim()"
                      class="flex-1 px-3 py-2 text-sm font-medium bg-poker-green-500 text-white rounded-lg hover:bg-poker-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Story
                    </button>
                    <button
                      (click)="openAddStories()"
                      class="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Add multiple stories"
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              }

              <!-- Story Queue List -->
              <div class="space-y-2">
                <div class="text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span>Queued Stories</span>
                  @if (storyQueue().length > 0) {
                    <span class="text-xs text-gray-400">{{ storyQueue().length }} stories</span>
                  }
                </div>

                @if (storyQueue().length === 0) {
                  <div class="text-center py-6 text-gray-400 text-sm">
                    <svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    No stories queued
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (story of storyQueue(); track story.id; let i = $index) {
                      <div
                        class="group border rounded-lg p-3 transition-colors"
                        [class.bg-white]="story.status === 'pending'"
                        [class.bg-poker-green-50]="story.status === 'completed'"
                        [class.border-gray-200]="story.status === 'pending'"
                        [class.border-poker-green-200]="story.status === 'completed'"
                        [class.hover:border-poker-green-300]="story.status === 'pending'"
                      >
                        <div class="flex items-start gap-3">
                          <span class="text-xs text-gray-400 font-mono mt-0.5">{{ i + 1 }}</span>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="font-medium text-gray-900 truncate">{{ story.title }}</span>
                              @if (story.status === 'completed' && story.finalScore !== null) {
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-poker-green-100 text-poker-green-800">
                                  {{ story.finalScore }}
                                </span>
                              }
                            </div>
                            @if (story.url) {
                              <a
                                [href]="story.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-xs text-poker-green-600 hover:text-poker-green-700 truncate block"
                                (click)="$event.stopPropagation()"
                              >
                                {{ story.url }}
                              </a>
                            }
                          </div>
                          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            @if (story.status === 'pending') {
                              <button
                                (click)="startStoryFromQueue(story.id)"
                                class="p-1.5 text-poker-green-600 hover:bg-poker-green-50 rounded transition-colors"
                                title="Start voting on this story"
                              >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            } @else if (story.status === 'completed') {
                              <button
                                (click)="restartStoryFromQueue(story.id)"
                                class="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                title="Re-vote on this story"
                              >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              </button>
                            }
                            <button
                              (click)="deleteStoryFromQueue(story.id)"
                              class="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Remove story"
                            >
                              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }


        </div>

        <!-- Danger Zone Footer (always at bottom, organizer only) -->
        @if (isOrganizer()) {
          <div class="p-4 border-t border-gray-200 space-y-3 bg-white">
            <div class="flex items-center gap-2 text-sm font-semibold text-red-600 uppercase tracking-wider">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Danger Zone
            </div>

            @if (showDeactivateConfirm()) {
              <div class="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <p class="text-sm text-red-800">
                  Are you sure you want to end this session? The join link will stop working and participants won't be able to rejoin.
                </p>
                <div class="flex gap-2">
                  <button
                    (click)="confirmDeactivate()"
                    [disabled]="isDeactivating()"
                    class="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    @if (isDeactivating()) {
                      <span class="flex items-center justify-center gap-2">
                        <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Ending...
                      </span>
                    } @else {
                      Yes, End Session
                    }
                  </button>
                  <button
                    (click)="cancelDeactivate()"
                    [disabled]="isDeactivating()"
                    class="px-3 py-2 text-sm font-medium bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            } @else {
              <button
                (click)="showDeactivateConfirm.set(true)"
                class="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors flex items-center justify-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                End Session
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class SettingsPanelComponent {
  private readonly gameState = inject(GameStateService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);

  readonly close = output<void>();

  // Game state
  readonly isOrganizer = this.gameState.isOrganizer;
  readonly storyQueue = this.gameState.storyQueue;
  readonly sessionCode = this.gameState.sessionCode;

  // Local state
  readonly isAddingStories = signal(false);
  readonly newStoriesText = signal('');
  readonly newStoryTitle = signal('');
  readonly newStoryUrl = signal('');
  readonly showDeactivateConfirm = signal(false);
  readonly isDeactivating = signal(false);

  // Story management methods
  openAddStories(): void {
    this.isAddingStories.set(true);
    this.newStoriesText.set('');
    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  cancelAddStories(): void {
    this.isAddingStories.set(false);
    this.newStoriesText.set('');
    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  async addSingleStory(): Promise<void> {
    const title = this.newStoryTitle().trim();
    if (!title) return;

    const url = this.newStoryUrl().trim() || undefined;
    await this.gameState.addStories([{ title, url }]);

    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  async addBatchStories(): Promise<void> {
    const text = this.newStoriesText().trim();
    if (!text) return;

    const stories = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        const tabSplit = line.split('\t');
        const pipeSplit = line.split(' | ');

        if (tabSplit.length > 1) {
          return { title: tabSplit[0].trim(), url: tabSplit[1].trim() || undefined };
        } else if (pipeSplit.length > 1) {
          return { title: pipeSplit[0].trim(), url: pipeSplit[1].trim() || undefined };
        }
        return { title: line };
      });

    if (stories.length > 0) {
      await this.gameState.addStories(stories);
      this.isAddingStories.set(false);
      this.newStoriesText.set('');
    }
  }

  async deleteStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.deleteStory(storyId);
  }

  async startStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.startStory(storyId);
  }

  async restartStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.restartStory(storyId);
  }

  cancelDeactivate(): void {
    this.showDeactivateConfirm.set(false);
  }

  async confirmDeactivate(): Promise<void> {
    const code = this.sessionCode();
    if (!code) {
      console.error('No session code available');
      return;
    }

    this.isDeactivating.set(true);
    try {
      const success = await this.sessionService.deactivateSession(code);
      if (success) {
        await this.gameState.leaveSession();
        this.router.navigate(['/']);
      } else {
        console.error('Failed to deactivate session');
      }
    } catch (err) {
      console.error('Error deactivating session:', err);
    } finally {
      this.isDeactivating.set(false);
    }
  }
}
