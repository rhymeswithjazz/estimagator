import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  standalone: true,
  template: `
    <span
      class="brand"
      [class.brand-stacked]="size() !== 'sm'"
      [class.brand-hero]="size() === 'lg'"
      role="img"
      aria-label="Estimagator"
    >
      <img src="brand/logo.svg?v=scout-1" alt="" width="272" height="256" />
      <span class="brand-wordmark" aria-hidden="true">Estima<span>gator</span></span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
    img {
      width: 2.75rem;
      height: auto;
      flex-shrink: 0;
    }
    .brand-wordmark {
      font-family: Poppins, system-ui, sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.05em;
      line-height: 1.2;
      color: #233d22;
    }
    .brand-wordmark > span {
      color: #47772c;
      font-style: italic;
      letter-spacing: 0.05em;
    }
    .brand-stacked {
      flex-direction: column;
      gap: 0.5rem;
    }
    .brand-stacked img {
      width: 7.5rem;
    }
    .brand-stacked .brand-wordmark {
      font-size: 2rem;
    }
    .brand-hero img {
      width: 11rem;
    }
    .brand-hero .brand-wordmark {
      font-size: clamp(2.25rem, 9vw, 3rem);
    }
    :host-context(.dark) .brand-wordmark {
      color: #edf4e6;
    }
    :host-context(.dark) .brand-wordmark > span {
      color: #a5cc7d;
    }
  `,
})
export class BrandComponent {
  readonly size = input<'sm' | 'md' | 'lg'>('sm');
}
