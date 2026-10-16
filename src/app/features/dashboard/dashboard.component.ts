import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { ClientDashboardComponent } from './client-dashboard.component';
import { DepositorDashboardComponent } from './depositor-dashboard.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    AdminDashboardComponent,
    ClientDashboardComponent,
    DepositorDashboardComponent,
    RouterLink
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly signingOut = signal(false);
  readonly logoutError = signal('');
  readonly darkMode = signal(false);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.darkMode.set(localStorage.getItem('lockergo-theme') === 'dark');
    this.applyTheme();
  }

  toggleTheme(): void {
    this.darkMode.update((enabled) => !enabled);
    localStorage.setItem('lockergo-theme', this.darkMode() ? 'dark' : 'light');
    this.applyTheme();
  }

  logout(): void {
    this.signingOut.set(true);
    this.logoutError.set('');
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: () => {
        this.logoutError.set('No se pudo confirmar el cierre de sesión. Inténtalo de nuevo.');
        this.signingOut.set(false);
      }
    });
  }

  private applyTheme(): void {
    document.documentElement.classList.toggle('theme-dark', this.darkMode());
  }
}
