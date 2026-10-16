import { Component, input, output } from '@angular/core';
import { CARD_BACKS, CardBack } from '../../core/models/session.models';
import { CardBackComponent } from './card-back.component';

@Component({
  selector: 'app-card-back-picker',
  standalone: true,
  imports: [CardBackComponent],
  template: `
    <div class="flex flex-wrap gap-3" role="radiogroup" aria-label="Card back">
      @for (back of backs; track back.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="selected() === back.id"
          [attr.aria-label]="back.label"
          [attr.title]="back.label"
          [attr.data-testid]="'card-back-option-' + back.id"
          (click)="selectedChange.emit(back.id)"
          class="relative w-12 h-[72px] rounded-lg shadow-card transition-all duration-200 ring-offset-2"
          [class.ring-2]="selected() === back.id"
          [class.ring-poker-green-500]="selected() === back.id"
        >
          <app-card-back [back]="back.id" />
        </button>
      }
    </div>
  `,
})
export class CardBackPickerComponent {
  readonly selected = input.required<CardBack>();
  readonly selectedChange = output<CardBack>();
  readonly backs = CARD_BACKS;
}
