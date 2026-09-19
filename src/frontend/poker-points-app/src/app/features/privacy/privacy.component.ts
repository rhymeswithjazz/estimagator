import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSelectorComponent } from '../../shared/components/theme-selector.component';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, ThemeSelectorComponent],
  templateUrl: './privacy.component.html',
})
export class PrivacyComponent {}
