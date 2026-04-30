import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import {
  EMOJI_REACTION_OPTIONS,
  getEmojiReactionOptionMetadata,
} from '../../core/models/session.models';

@Component({
  selector: 'app-emoji-reaction-palette',
  standalone: true,
  template: `
    @for (emoji of emojiReactionOptions; track emoji) {
      <button
        type="button"
        (click)="selectEmoji(emoji, $event)"
        [attr.aria-label]="'Send ' + getReactionOptionLabel(emoji) + ' reaction'"
      >
        {{ emoji }}
      </button>
    }
  `,
  styles: [
    `
      app-emoji-reaction-palette {
        position: absolute;
        left: 50%;
        top: -3.25rem;
        z-index: 30;
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: 9999px;
        border: 1px solid rgb(187 247 208);
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

      app-emoji-reaction-palette.emoji-reaction-palette--open {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0) scale(1);
      }

      app-emoji-reaction-palette button {
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

      app-emoji-reaction-palette button:hover {
        background: rgb(220 252 231);
        transform: translateY(-1px);
      }

      .dark app-emoji-reaction-palette {
        border-color: rgb(34 197 94 / 0.42);
        background: rgb(17 24 39 / 0.96);
      }

      .dark app-emoji-reaction-palette button:hover {
        background: rgb(22 101 52 / 0.58);
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class EmojiReactionPaletteComponent {
  @HostBinding('class.emoji-reaction-palette--open') @Input() open = false;
  @Output() readonly emojiSelected = new EventEmitter<string>();

  readonly emojiReactionOptions = EMOJI_REACTION_OPTIONS;

  selectEmoji(emoji: string, event: Event): void {
    event.stopPropagation();
    this.emojiSelected.emit(emoji);
  }

  getReactionOptionLabel(emoji: string): string {
    return getEmojiReactionOptionMetadata(emoji)?.label ?? emoji;
  }
}
