import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardApiService, LockerPackage, PackageLiveUpdate } from '../../core/dashboard/dashboard-api.service';
import { DashboardLiveService, LiveStatus } from '../../core/dashboard/dashboard-live.service';
import { LockerOverview, LockersService } from '../../core/lockers/lockers.service';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.scss'
})
export class ClientDashboardComponent implements OnInit, OnDestroy {
  readonly packages = signal<LockerPackage[]>([]);
  readonly lockers = signal<LockerOverview[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly liveStatus = signal<LiveStatus>('CONNECTING');
  readonly auth = inject(AuthService);

  private readonly api = inject(DashboardApiService);
  private readonly live = inject(DashboardLiveService);
  private readonly lockersApi = inject(LockersService);
  private readonly lockerStreamDisposers = new Map<number, () => void>();
  private packageStreamDispose?: () => void;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshDebounce?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  ngOnInit(): void {
    this.loadDashboard();
    this.packageStreamDispose = this.live.watchPackages(
      (update) => this.applyPackageUpdate(update),
      (status) => this.liveStatus.set(status)
    );
    this.refreshTimer = setInterval(() => this.loadDashboard(false), 60_000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.packageStreamDispose?.();
    for (const dispose of this.lockerStreamDisposers.values()) dispose();
    this.lockerStreamDisposers.clear();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.refreshDebounce) clearTimeout(this.refreshDebounce);
  }

  get pendingPackages(): LockerPackage[] {
    return this.packages().filter((item) => item.status === 'PENDING' && item.depositedAt !== null);
  }

  get preparingPackages(): LockerPackage[] {
    return this.packages().filter((item) => item.status === 'PENDING' && item.depositedAt === null);
  }

  get pickedUpPackages(): LockerPackage[] {
    return this.packages().filter((item) => item.status === 'PICKED_UP');
  }

  retry(): void {
    this.error.set('');
    this.loading.set(true);
    this.loadDashboard();
  }

  private loadDashboard(showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    forkJoin({ packages: this.api.packages(), lockers: this.lockersApi.list() }).subscribe({
      next: ({ packages, lockers }) => {
        if (this.destroyed) return;
        this.packages.set(packages);
        this.lockers.set(lockers);
        this.loading.set(false);
        for (const locker of lockers) {
          if (!locker.isActive || this.lockerStreamDisposers.has(locker.id_locker)) continue;
          const dispose = this.live.watchLocker(
            locker.id_locker,
            () => this.scheduleRefresh(),
            (status) => this.liveStatus.set(status)
          );
          this.lockerStreamDisposers.set(locker.id_locker, dispose);
        }
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.error.set(this.errorMessage(error));
        this.loading.set(false);
      }
    });
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

  private scheduleRefresh(): void {
    if (this.refreshDebounce) clearTimeout(this.refreshDebounce);
    this.refreshDebounce = setTimeout(() => this.loadDashboard(false), 400);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con LockerGo. Comprueba tu conexión.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return 'No se pudieron cargar tus paquetes. Inténtalo de nuevo.';
  }
}
