import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

const LOCKERS_API = 'http://localhost:4000/api/lockers';

export interface Locker {
  id_locker: number;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
}

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'INACTIVE' | 'NO_DEVICE';

export interface LockerOverview extends Locker {
  deviceCount: number;
  onlineDeviceCount: number;
  lastSeenAt: string | null;
  deviceStatus: DeviceStatus;
}

interface LockersResponse {
  lockers: LockerOverview[];
}

@Injectable({ providedIn: 'root' })
export class LockersService {
  private readonly http = inject(HttpClient);

  list(): Observable<LockerOverview[]> {
    return this.http.get<LockersResponse>(`${LOCKERS_API}/overview`).pipe(map(({ lockers }) => lockers));
  }
}
