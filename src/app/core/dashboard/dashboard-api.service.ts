import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Locker } from '../lockers/lockers.service';

const API = 'http://localhost:4000/api';

export type PackageStatus = 'PENDING' | 'PICKED_UP';
export type PackageSize = 'S' | 'M' | 'L';

export interface LockerPackage {
  id_package: number;
  code: string;
  lockerId: number;
  status: PackageStatus;
  estimatedSize: PackageSize | null;
  depositedAt: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  locker: Pick<Locker, 'id_locker' | 'code' | 'name' | 'location'>;
  depositor: { id_user: number; name: string };
  client: { id_user: number; name: string };
}

export interface PackageLiveUpdate {
  package: Pick<
    LockerPackage,
    'id_package' | 'code' | 'status' | 'estimatedSize' | 'depositedAt' | 'pickedUpAt'
  >;
  event: { type: 'PACKAGE_DEPOSITED' | 'PACKAGE_PICKED_UP'; createdAt: string };
}

export interface PackageLockerOption {
  id_locker: number;
  code: string;
  name: string;
  location: string | null;
}

export interface AdminDashboardOverview {
  generatedAt: string;
  activityRange: { from: string; to: string; timezone: string };
  kpis: {
    lockersOnline: number;
    lockersWithActiveDevices: number;
    doorsOpenNow: number;
    pendingPackages: number;
    doorOpeningsToday: number;
  };
  activityHeatmap: Array<{ dayOfWeek: number; hour: number; count: number }>;
  lockerRanking: Array<{
    lockerId: number;
    lockerCode: string;
    lockerName: string;
    count: number;
  }>;
  packagesByStatus: Array<{ status: PackageStatus; count: number }>;
  alerts: Array<{
    type: string;
    severity: string;
    deviceCode?: string;
    locker: { id_locker?: number; code: string; name: string };
    component?: { key: string; name: string } | null;
    detail?: unknown;
    occurredAt: string | null;
    durationSeconds?: number;
  }>;
  recentEvents: Array<{
    id_event: string;
    type: string;
    severity: string;
    detail: unknown;
    createdAt: string;
    locker: { id_locker: number; code: string; name: string };
    component: { key: string; name: string } | null;
    package: { id_package: number; code: string; status: PackageStatus } | null;
  }>;
  recentPackages: LockerPackage[];
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);

  adminOverview(): Observable<AdminDashboardOverview> {
    return this.http.get<AdminDashboardOverview>(`${API}/dashboard/admin/overview`);
  }

  packages(): Observable<LockerPackage[]> {
    return this.http
      .get<{ packages: LockerPackage[] }>(`${API}/packages`)
      .pipe(map(({ packages }) => packages));
  }

  createPackage(input: { code: string; lockerId: number; clientEmail: string }): Observable<LockerPackage> {
    return this.http
      .post<{ package: LockerPackage }>(`${API}/packages`, input)
      .pipe(map(({ package: packageRecord }) => packageRecord));
  }

  packageLockerOptions(): Observable<PackageLockerOption[]> {
    return this.http
      .get<{ lockers: PackageLockerOption[] }>(`${API}/packages/locker-options`)
      .pipe(map(({ lockers }) => lockers));
  }

  packageStreamTicket(): Observable<{ ticket: string; expiresInSeconds: number }> {
    return this.http.post<{ ticket: string; expiresInSeconds: number }>(
      `${API}/packages/stream-ticket`,
      {}
    );
  }

  packageStreamUrl(ticket: string, lastEventId?: string): string {
    const params = new URLSearchParams({ ticket });
    if (lastEventId) params.set('lastEventId', lastEventId);
    return `${API}/packages/stream?${params.toString()}`;
  }

  lockerStreamTicket(lockerId: number): Observable<{ ticket: string; expiresInSeconds: number }> {
    return this.http.post<{ ticket: string; expiresInSeconds: number }>(
      `${API}/lockers/${lockerId}/stream-ticket`,
      {}
    );
  }

  lockerStreamUrl(lockerId: number, ticket: string, lastEventId?: string): string {
    const params = new URLSearchParams({ ticket });
    if (lastEventId) params.set('lastEventId', lastEventId);
    return `${API}/lockers/${lockerId}/stream?${params.toString()}`;
  }
}
