import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
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
