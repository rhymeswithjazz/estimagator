import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStateService } from '../../core/services/game-state.service';

@Component({
  selector: 'app-timer-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="text-6xl font-mono font-bold mb-3 transition-colors"
      [class]="seconds() < 10 ? 'text-red-400 animate-pulse' : 'text-white'"
    >
      {{ gameState.formatTime(seconds()) }}
    </div>
  `,
})
export class TimerCountdownComponent {
  readonly gameState = inject(GameStateService);
  readonly seconds = this.gameState.timerSecondsRemaining;
}
