import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/admin.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-layout.component').then((m) => m.AdminLayoutComponent),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./user-list.component').then((m) => m.UserListComponent),
      },
      {
        path: 'users/:id',
        loadComponent: () =>
          import('./user-edit.component').then((m) => m.UserEditComponent),
      },
      {
        path: 'sessions',
        loadComponent: () =>
          import('./session-list.component').then((m) => m.SessionListComponent),
      },
      {
        path: 'sessions/:id',
        loadComponent: () =>
          import('./session-detail.component').then((m) => m.SessionDetailComponent),
      },
    ],
  },
];
