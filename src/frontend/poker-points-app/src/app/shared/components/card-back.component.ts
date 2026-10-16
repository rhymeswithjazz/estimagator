import { Component, computed, input } from '@angular/core';
import { CardBack } from '../../core/models/session.models';

@Component({
  selector: 'app-card-back',
  standalone: true,
  host: { '[class]': 'backClass()' },
  template: `
    @if (hasLogo()) {
      <img class="card-back-logo" src="brand/logo.svg?v=scout-1" alt="" width="272" height="256" />
    }
  `,
})
export class CardBackComponent {
  readonly back = input.required<CardBack>();
  readonly backClass = computed(() => `card-back card-back-${this.back()}`);
  readonly hasLogo = computed(() => this.back().startsWith('scout-'));
}
