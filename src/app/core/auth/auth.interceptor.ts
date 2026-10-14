import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken;
  const isSessionEndpoint = /\/api\/auth\/(login|refresh|logout)(?:\?|$)/.test(request.url);
  const authorizedRequest = token && !isSessionEndpoint ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token || isSessionEndpoint) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap(() => next(request.clone({setHeaders: { Authorization: `Bearer ${auth.accessToken}` }}))
        ),
        catchError((refreshError: unknown) => {
          auth.clearSession();
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};
