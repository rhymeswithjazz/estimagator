import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import { EMOJI_THROW_OPTIONS, getEmojiThrowOptionMetadata } from '../../core/models/session.models';
import { EmojiThrowIconComponent } from './emoji-throw-icon.component';

@Component({
  selector: 'app-emoji-throw-palette',
  standalone: true,
  imports: [EmojiThrowIconComponent],
  template: `
    @for (emoji of emojiThrowOptions; track emoji) {
      <button
        type="button"
        (click)="selectEmoji(emoji, $event)"
        [attr.aria-label]="'Throw ' + getThrowOptionLabel(emoji) + ' at ' + targetDisplayName"
      >
        <app-emoji-throw-icon [emoji]="emoji" />
      </button>
    }
  `,
  styles: [
    `
      app-emoji-throw-palette {
        position: absolute;
        left: 50%;
        top: -3.25rem;
        z-index: 30;
        display: flex;
        gap: 0.625rem;
        padding: 0.5rem 0.875rem;
        border-radius: 9999px;
        border: 1px solid rgb(229 231 235);
        background: rgb(255 255 255 / 0.98);
        box-shadow:
          0 18px 35px rgb(0 0 0 / 0.18),
          0 6px 14px rgb(0 0 0 / 0.12);
        opacity: 0;
        pointer-events: none;
        transform: translateX(-50%) translateY(6px) scale(0.98);
        transition:
          opacity 150ms ease,
          transform 150ms ease;
        white-space: nowrap;
      }

      app-emoji-throw-palette.emoji-throw-palette--open {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0) scale(1);
      }

      app-emoji-throw-palette button {
        display: inline-flex;
        width: 2.25rem;
        height: 2.25rem;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        font-size: 1.375rem;
        line-height: 1;
        transition:
          background-color 150ms ease,
          transform 150ms ease;
      }

      app-emoji-throw-palette button:hover {
        background: rgb(230 242 212);
        transform: translateY(-1px);
      }

      .dark app-emoji-throw-palette {
        border-color: rgb(55 65 81);
        background: rgb(17 24 39 / 0.96);
      }

      .dark app-emoji-throw-palette button:hover {
        background: rgb(42 76 4 / 0.72);
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class EmojiThrowPaletteComponent {
  @Input({ required: true }) targetDisplayName = '';
  @HostBinding('class.emoji-throw-palette--open') @Input() open = false;
  @Output() readonly emojiSelected = new EventEmitter<string>();

  readonly emojiThrowOptions = EMOJI_THROW_OPTIONS;

  selectEmoji(emoji: string, event: Event): void {
    event.stopPropagation();
    this.emojiSelected.emit(emoji);
  }

  getThrowOptionLabel(emoji: string): string {
    return getEmojiThrowOptionMetadata(emoji)?.label ?? emoji;
  }
}
