import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/auth/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'join/:code',
    loadComponent: () =>
      import('./features/join/join-session.component').then((m) => m.JoinSessionComponent),
  },
  {
    path: 'game/:code',
    loadComponent: () =>
      import('./features/game/game-room.component').then((m) => m.GameRoomComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
