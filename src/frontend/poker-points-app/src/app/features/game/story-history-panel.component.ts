import { Component, computed, inject, output } from '@angular/core';
import { GameStateService } from '../../core/services/game-state.service';

@Component({
  selector: 'app-story-history-panel',
  standalone: true,
  template: `
    <div class="fixed inset-0 z-50 flex justify-start" (click)="close.emit()">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/20"></div>

      <!-- Panel -->
      <div
        class="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full"
        (click)="$event.stopPropagation()"
      >
        <!-- Panel Header -->
        <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-display font-bold text-gray-900">Story History</h2>
            @if (totalPoints() !== null) {
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-poker-green-100 text-poker-green-800"
              >
                {{ totalPoints() }} pts
              </span>
            }
          </div>
          <button
            (click)="close.emit()"
            class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Panel Content -->
        <div class="flex-1 overflow-auto p-4">
          @if (completedStories().length === 0) {
            <div class="text-center py-12 text-gray-400 text-sm">
              <svg
                class="w-10 h-10 mx-auto mb-3 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              No completed stories yet
            </div>
          } @else {
            <div class="space-y-2">
              @for (story of completedStories(); track story.id; let i = $index) {
                <div
                  class="group border border-poker-green-200 bg-poker-green-50 rounded-lg p-3 transition-colors hover:border-poker-green-300"
                >
                  <div class="flex items-start gap-3">
                    <span class="text-xs text-gray-400 font-mono mt-0.5">{{ i + 1 }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-900 truncate">{{ story.title }}</span>
                        @if (story.finalScore !== null) {
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-poker-green-100 text-poker-green-800 shrink-0"
                          >
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
                    @if (isOrganizer()) {
                      <div
                        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <button
                          (click)="restartStory(story.id)"
                          class="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Re-vote on this story"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                        <button
                          (click)="deleteStory(story.id)"
                          class="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove story"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class StoryHistoryPanelComponent {
  private readonly gameState = inject(GameStateService);

  readonly close = output<void>();

  readonly isOrganizer = this.gameState.isOrganizer;
  readonly storyQueue = this.gameState.storyQueue;

  readonly completedStories = computed(() =>
    this.storyQueue().filter((s) => s.status === 'completed'),
  );

  readonly totalPoints = computed(() => {
    const completed = this.completedStories();
    if (completed.length === 0) return null;
    const sum = completed.reduce((acc, s) => acc + (s.finalScore ?? 0), 0);
    return sum;
  });

  async restartStory(storyId: string): Promise<void> {
    await this.gameState.restartStory(storyId);
  }

  async deleteStory(storyId: string): Promise<void> {
    await this.gameState.deleteStory(storyId);
  }
}
