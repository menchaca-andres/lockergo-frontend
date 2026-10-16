import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LockerOverview, LockersService } from '../../core/lockers/lockers.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnDestroy, OnInit {
  readonly auth = inject(AuthService);
  readonly signingOut = signal(false);
  readonly lockers = signal<LockerOverview[]>([]);
  readonly loadingLockers = signal(true);
  readonly lockersError = signal('');
  readonly logoutError = signal('');
  private readonly router = inject(Router);
  private readonly lockersService = inject(LockersService);
  private overviewRefresh?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.loadLockers();
    this.overviewRefresh = setInterval(() => {
      if (!this.loadingLockers()) this.loadLockers();
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.overviewRefresh) clearInterval(this.overviewRefresh);
  }

  loadLockers(): void {
    this.loadingLockers.set(true);
    this.lockersError.set('');
    this.lockersService.list().subscribe({
      next: (lockers) => this.lockers.set(lockers),
      error: (error: unknown) => {
        this.lockersError.set(
          error instanceof HttpErrorResponse && error.status === 0
            ? 'No se pudo conectar con LockerGo. Comprueba tu conexión e inténtalo de nuevo.'
            : 'No se pudieron cargar tus lockers. Inténtalo de nuevo.'
        );
        this.loadingLockers.set(false);
      },
      complete: () => this.loadingLockers.set(false)
    });
  }

  logout(): void {
    this.signingOut.set(true);
    this.logoutError.set('');
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => {
        this.logoutError.set('No se pudo confirmar el cierre de sesión. Comprueba tu conexión e inténtalo de nuevo.');
        this.signingOut.set(false);
      }
    });
  }
}
