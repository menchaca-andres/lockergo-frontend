import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly signingOut = signal(false);
  readonly errorMessage = signal('');
  private readonly router = inject(Router);

  logout(): void {
    this.signingOut.set(true);
    this.errorMessage.set('');
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => {
        this.errorMessage.set('No se pudo confirmar el cierre de sesión. Comprueba tu conexión e inténtalo de nuevo.');
        this.signingOut.set(false);
      }
    });
  }
}
