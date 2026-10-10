import { BrandComponent } from '../../shared/components/brand.component';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeSelectorComponent } from '../../shared/components/theme-selector.component';

@Component({
  selector: 'app-privacy',
  imports: [BrandComponent, RouterLink, ThemeSelectorComponent],
  templateUrl: './privacy.component.html',
})
export class PrivacyComponent {}
