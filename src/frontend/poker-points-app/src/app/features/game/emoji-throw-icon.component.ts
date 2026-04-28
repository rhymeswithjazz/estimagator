import { Component, Input } from '@angular/core';
import { getEmojiThrowOptionMetadata } from '../../core/models/session.models';

@Component({
  selector: 'app-emoji-throw-icon',
  standalone: true,
  template: `
    @switch (iconKind()) {
      @case ('dart') {
        <img
          class="throw-object-icon dart-icon"
          src="throw-dart.svg"
          data-testid="emoji-throw-icon-dart"
          alt=""
          aria-hidden="true"
        />
      }
      @case ('airplane') {
        <svg
          class="throw-object-icon airplane-icon"
          viewBox="50 -45 490 300"
          fill="none"
          data-testid="emoji-throw-icon-airplane"
          aria-hidden="true"
        >
          <g transform="rotate(27 250 130)">
            <polygon points="141.31,181.81 100,260 176.81,210" fill="#b7d7ea" />
            <polygon
              points="0,70 240,260 500,0"
              fill="#edf8ff"
              stroke="#9bb8cb"
              stroke-width="8"
              stroke-linejoin="round"
            />
            <polygon
              points="83.69,136.25 100,260 141.31,181.81 500,0"
              fill="#d1e8f6"
              stroke="#aac6d9"
              stroke-width="6"
              stroke-linejoin="round"
            />
          </g>
        </svg>
      }
      @case ('paper-ball') {
        <svg
          class="throw-object-icon paper-ball-icon"
          viewBox="0 0 64 64"
          fill="none"
          data-testid="emoji-throw-icon-paper-ball"
          aria-hidden="true"
        >
          <path d="M13 19 26 8l17 4 10 14-4 22-18 8-18-11-5-16 5-10Z" fill="#f4f4f2" />
          <path
            d="m26 8 2 15-15-4m30-7-15 11 25 3m-4 22-16-10-2 18m-18-11 20-7-25-9"
            stroke="#b7bec6"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="m28 23 5 15 16 10M13 19l20 19 10-26M8 29l20-6"
            stroke="#d5d9de"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M21 48c8 5 20 3 27-5" stroke="#9aa3ad" stroke-width="2" stroke-linecap="round" />
        </svg>
      }
      @default {
        {{ emoji }}
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .throw-object-icon {
        display: block;
        width: 1.375rem;
        height: 1.375rem;
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.14));
      }

      .airplane-icon {
        width: 1.625rem;
      }

      .dart-icon {
        width: 1.75rem;
        height: auto;
        transform: rotate(45deg);
      }

      :host(.emoji-throw-icon--flight) .throw-object-icon {
        width: 2.5rem;
        height: 2.5rem;
      }

      :host(.emoji-throw-icon--flight) .dart-icon {
        width: 3.25rem;
        height: auto;
        transform: none;
      }

      :host(.emoji-throw-icon--flight) .airplane-icon {
        width: 3rem;
      }
    `,
  ],
})
export class EmojiThrowIconComponent {
  @Input({ required: true }) emoji = '';

  iconKind(): string {
    return getEmojiThrowOptionMetadata(this.emoji)?.iconKind ?? 'emoji';
  }
}
