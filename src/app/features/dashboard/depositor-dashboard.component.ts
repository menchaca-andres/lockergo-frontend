import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardApiService, LockerPackage, PackageLockerOption, PackageLiveUpdate } from '../../core/dashboard/dashboard-api.service';
import { DashboardLiveService, LiveStatus } from '../../core/dashboard/dashboard-live.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-depositor-dashboard',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './depositor-dashboard.component.html',
  styleUrl: './depositor-dashboard.component.scss'
})
export class DepositorDashboardComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly packages = signal<LockerPackage[]>([]);
  readonly lockers = signal<PackageLockerOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly notice = signal('');
  readonly liveStatus = signal<LiveStatus>('CONNECTING');
  draft = { code: '', lockerId: '', clientEmail: '' };

  private readonly api = inject(DashboardApiService);
  private readonly live = inject(DashboardLiveService);
  private streamDispose?: () => void;
  private pollTimer?: ReturnType<typeof setInterval>;
  private destroyed = false;

  get pendingCount(): number {
    return this.packages().filter((item) => item.status === 'PENDING').length;
  }

  get pickedUpCount(): number {
    return this.packages().filter((item) => item.status === 'PICKED_UP').length;
  }

  ngOnInit(): void {
    this.loadDashboard();
    this.streamDispose = this.live.watchPackages(
      (update) => this.applyPackageUpdate(update),
      (status) => this.liveStatus.set(status)
    );
    this.pollTimer = setInterval(() => this.loadDashboard(false), 60_000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.streamDispose?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  submit(): void {
    if (!this.draft.code.trim() || !this.draft.clientEmail.trim() || !this.draft.lockerId) {
      this.formError.set('Completa los tres campos para registrar el paquete.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    this.api.createPackage({
      code: this.draft.code.trim(),
      lockerId: Number(this.draft.lockerId),
      clientEmail: this.draft.clientEmail.trim()
    }).subscribe({
      next: (packageRecord) => {
        this.packages.update((items) => [
          packageRecord,
          ...items.filter((item) => item.id_package !== packageRecord.id_package)
        ]);
        this.draft = { code: '', lockerId: '', clientEmail: '' };
        this.notice.set('Paquete pre-registrado. Se actualizará al depositarse en el locker.');
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.formError.set(this.errorMessage(error, 'No se pudo registrar el paquete.'));
        this.saving.set(false);
      }
    });
  }

  retry(): void {
    this.error.set('');
    this.loading.set(true);
    this.loadDashboard();
  }

  private loadDashboard(showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    this.api.packages().subscribe({
      next: (packages) => {
        if (this.destroyed) return;
        this.packages.set(packages);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.error.set(this.errorMessage(error, 'No se pudieron cargar tus paquetes.'));
        this.loading.set(false);
      }
    });
    if (this.lockers().length === 0) {
      this.api.packageLockerOptions().subscribe({
        next: (lockers) => this.lockers.set(lockers),
        error: (error: unknown) => this.formError.set(this.errorMessage(error, 'No se pudieron cargar los lockers disponibles.'))
      });
    }
  }

  private applyPackageUpdate(update: PackageLiveUpdate): void {
    const found = this.packages().some((item) => item.id_package === update.package.id_package);
    if (!found) {
      this.loadDashboard(false);
      return;
    }
    this.packages.update((items) =>
      items.map((item) => item.id_package === update.package.id_package
        ? { ...item, ...update.package }
        : item)
    );
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con LockerGo.';
      if (error.status === 409) return 'Ya existe un paquete con ese código.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return fallback;
  }
}
