import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { from } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  // Don't add auth header to auth endpoints (except logout and me)
  const isAuthEndpoint =
    req.url.includes('/api/auth/') &&
    !req.url.includes('/api/auth/logout') &&
    !req.url.includes('/api/auth/me');

  if (!token || isAuthEndpoint) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/api/auth/refresh')) {
        // Try to refresh the token
        return from(authService.refreshToken()).pipe(
          switchMap((success) => {
            if (success) {
              const newToken = authService.accessToken();
              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                },
              });
              return next(retryReq);
            }
            return throwError(() => error);
          }),
          catchError(() => throwError(() => error))
        );
      }
      return throwError(() => error);
    })
  );
};
