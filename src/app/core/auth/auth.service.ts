import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthResponse, AuthUser, LoginCredentials } from './auth.models';

const AUTH_API = 'http://localhost:4000/api/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly accessTokenState = signal<string | null>(null);
  private refreshRequest?: Observable<AuthResponse>;

  readonly user = signal<AuthUser | null>(null);

  get accessToken(): string | null {
    return this.accessTokenState();
  }

  login(credentials: LoginCredentials): Observable<void> {
    return this.http
      .post<AuthResponse>(`${AUTH_API}/login`, credentials, { withCredentials: true })
      .pipe(tap((session) => this.setSession(session)), map(() => undefined));
  }

  refresh(): Observable<AuthResponse> {
    if (!this.refreshRequest) {
      this.refreshRequest = this.http
        .post<AuthResponse>(`${AUTH_API}/refresh`, {}, { withCredentials: true })
        .pipe(tap((session) => this.setSession(session)), finalize(() => (this.refreshRequest = undefined)), shareReplay({ bufferSize: 1, refCount: false })
        );
    }
    return this.refreshRequest;
  }

  ensureAuthenticated(): Observable<boolean> {
    if (this.accessToken) return of(true);

    return this.refresh().pipe(
      map(() => true),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) return of(false);
        return throwError(() => error);
      })
    );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${AUTH_API}/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearSession()));
  }

  clearSession(): void {
    this.accessTokenState.set(null);
    this.user.set(null);
  }

  private setSession(session: AuthResponse): void {
    this.accessTokenState.set(session.accessToken);
    this.user.set(session.user);
  }
}
