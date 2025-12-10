import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/services/session.service';
import { SessionHistoryResponse, StoryHistory, Vote } from '../../core/models/session.models';

@Component({
  selector: 'app-session-history',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './session-history.component.html',
})
export class SessionHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);

  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly session = signal<SessionHistoryResponse | null>(null);

  readonly completedStories = computed(() => {
    const s = this.session();
    if (!s) return [];
    return s.stories.filter((story) => story.status === 'completed');
  });

  readonly totalPoints = computed(() => {
    return this.completedStories().reduce((sum, story) => {
      return sum + (story.finalScore ?? 0);
    }, 0);
  });

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    if (code) {
      this.loadHistory(code);
    } else {
      this.error.set('Invalid session code');
      this.isLoading.set(false);
    }
  }

  async loadHistory(code: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    const history = await this.sessionService.getSessionHistory(code);
    if (history) {
      this.session.set(history);
    } else {
      this.error.set('Session not found or you do not have access');
    }

    this.isLoading.set(false);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getVoteDistribution(votes: Vote[]): Map<string, number> {
    const distribution = new Map<string, number>();
    for (const vote of votes) {
      const value = vote.cardValue ?? '?';
      distribution.set(value, (distribution.get(value) ?? 0) + 1);
    }
    return distribution;
  }

  getVoteDistributionArray(votes: Vote[]): { value: string; count: number }[] {
    const dist = this.getVoteDistribution(votes);
    return Array.from(dist.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  calculateAverage(votes: Vote[]): number | null {
    const numericVotes = votes
      .map((v) => parseFloat(v.cardValue ?? ''))
      .filter((n) => !isNaN(n));

    if (numericVotes.length === 0) return null;
    return numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
  }
}
