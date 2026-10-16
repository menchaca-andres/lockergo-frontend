import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminRole, AdminService, ManagedUser, ManagedUserDetail } from '../../core/admin/admin.service';
import { AuthService } from '../../core/auth/auth.service';
import { Locker } from '../../core/lockers/lockers.service';

type AdminSection = 'lockers' | 'users';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly section = signal<AdminSection>('lockers');
  readonly lockers = signal<Locker[]>([]);
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editingLocker = signal<Locker | null>(null);
  readonly selectedUser = signal<ManagedUserDetail | null>(null);
  readonly selectedLockerIds = signal<number[]>([]);
  private readonly api = inject(AdminService);
  private readonly router = inject(Router);

  lockerDraft = { code: '', name: '', location: '' };
  userDraft = { name: '', email: '', password: '', role: 'USER' as AdminRole };

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ lockers: this.api.listLockers(), users: this.api.listUsers() }).subscribe({
      next: ({ lockers, users }) => {
        this.lockers.set(lockers.lockers);
        this.users.set(users.users);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudieron cargar los datos de administración.'));
        this.loading.set(false);
      }
    });
  }

  setSection(section: AdminSection): void {
    this.section.set(section);
    this.clearMessages();
  }

  startCreateLocker(): void {
    this.editingLocker.set(null);
    this.lockerDraft = { code: '', name: '', location: '' };
    this.clearMessages();
  }

  editLocker(locker: Locker): void {
    this.editingLocker.set(locker);
    this.lockerDraft = { code: locker.code, name: locker.name, location: locker.location ?? '' };
    this.clearMessages();
  }

  saveLocker(): void {
    this.saving.set(true);
    this.clearMessages();
    const current = this.editingLocker();
    const input = { ...this.lockerDraft, location: this.lockerDraft.location.trim() || null };
    const request = current
      ? this.api.updateLocker(current.id_locker, input)
      : this.api.createLocker(input);
    request.subscribe({
      next: () => {
        this.notice.set(current ? 'Locker actualizado.' : 'Locker creado.');
        this.editingLocker.set(null);
        this.lockerDraft = { code: '', name: '', location: '' };
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudo guardar el locker.'));
        this.saving.set(false);
      }
    });
  }

  toggleLocker(locker: Locker): void {
    this.saving.set(true);
    this.clearMessages();
    this.api.updateLocker(locker.id_locker, { isActive: !locker.isActive }).subscribe({
      next: () => {
        this.notice.set(locker.isActive ? 'Locker desactivado.' : 'Locker activado.');
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudo cambiar el estado del locker.'));
        this.saving.set(false);
      }
    });
  }

  createUser(): void {
    this.saving.set(true);
    this.clearMessages();
    this.api.createUser(this.userDraft).subscribe({
      next: () => {
        this.userDraft = { name: '', email: '', password: '', role: 'USER' };
        this.notice.set('Usuario creado.');
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudo crear el usuario.'));
        this.saving.set(false);
      }
    });
  }

  toggleUser(user: ManagedUser): void {
    this.saving.set(true);
    this.clearMessages();
    this.api.updateUser(user.id_user, { isActive: !user.isActive }).subscribe({
      next: () => {
        this.notice.set(user.isActive ? 'Usuario desactivado.' : 'Usuario activado.');
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudo cambiar el estado del usuario.'));
        this.saving.set(false);
      }
    });
  }

  changeRole(user: ManagedUser, role: AdminRole): void {
    if (role === user.role) return;
    this.saving.set(true);
    this.clearMessages();
    this.api.updateUser(user.id_user, { role }).subscribe({
      next: () => {
        this.notice.set('Rol de usuario actualizado.');
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudo cambiar el rol.'));
        this.saving.set(false);
      }
    });
  }

  manageAssignments(user: ManagedUser): void {
    this.clearMessages();
    this.api.getUser(user.id_user).subscribe({
      next: ({ user: detail }) => {
        this.selectedUser.set(detail);
        this.selectedLockerIds.set(detail.assignments.map(({ locker }) => locker.id_locker));
      },
      error: (error: unknown) => this.error.set(this.errorMessage(error, 'No se pudieron cargar las asignaciones.'))
    });
  }

  toggleAssignment(lockerId: number, checked: boolean): void {
    this.selectedLockerIds.update((ids) =>
      checked ? [...ids, lockerId] : ids.filter((id) => id !== lockerId)
    );
  }

  saveAssignments(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.saving.set(true);
    this.clearMessages();
    this.api.setUserLockers(user.id_user, this.selectedLockerIds()).subscribe({
      next: () => {
        this.selectedUser.set(null);
        this.notice.set('Asignaciones actualizadas.');
        this.loadData();
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error, 'No se pudieron guardar las asignaciones.'));
        this.saving.set(false);
      }
    });
  }

  closeAssignments(): void {
    this.selectedUser.set(null);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login'),
      error: (error: unknown) => this.error.set(this.errorMessage(error, 'No se pudo cerrar sesión.'))
    });
  }

  isCurrentUser(user: ManagedUser): boolean {
    return user.id_user === this.auth.user()?.id_user;
  }

  private clearMessages(): void {
    this.error.set('');
    this.notice.set('');
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error && typeof error.error.message === 'string' ? error.error.message : '';
      if (error.status === 0) return 'No se pudo conectar con LockerGo. Comprueba que el backend esté iniciado.';
      if (error.status === 409) return 'Ya existe un registro con esos datos.';
      if (message === 'Invalid request') return 'Revisa los datos ingresados e inténtalo de nuevo.';
      if (message) return message;
    }
    return fallback;
  }
}
