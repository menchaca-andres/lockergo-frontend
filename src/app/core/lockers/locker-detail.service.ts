import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Locker, DeviceStatus } from './lockers.service';

const LOCKERS_API = 'http://localhost:4000/api/lockers';

export interface LockerDetailState {
  locker: Locker;
  devices: Array<{
    id_device: number;
    code: string;
    boardModel: string;
    firmwareVersion: string | null;
    lastSeenAt: string | null;
    isActive: boolean;
    connectionStatus: Exclude<DeviceStatus, 'NO_DEVICE'>;
    components: Array<{
      id_component: number;
      key: string;
      name: string;
      isEnabled: boolean;
      model: {
        name: string;
        type: { name: string; unit: string | null; valueKind: string };
      };
      latestReading: LatestReading | null;
    }>;
  }>;
}

export interface LatestReading {
  id_reading: string;
  valueNum: number | null;
  valueBool: boolean | null;
  valueText: string | null;
  payload: unknown;
  quality: string;
  recordedAt: string;
  receivedAt: string;
}

export interface Reading {
  id_reading: string;
  componentId: number;
  valueNum: number | null;
  valueBool: boolean | null;
  valueText: string | null;
  payload: unknown;
  quality: string;
  recordedAt: string;
  receivedAt: string;
  component: {
    key: string;
    name: string;
    model: { type: { name: string; unit: string | null; valueKind: string } };
  };
}

export interface LockerEvent {
  id_event: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  detail: unknown;
  createdAt: string;
  acknowledgedAt: string | null;
  component: { key: string; name: string } | null;
  reading: { id_reading: string; recordedAt: string } | null;
}

export interface LockerDataFilters {
  from?: string;
  to?: string;
  limit?: number;
}

export interface LockerAnalytics {
  locker: Pick<Locker, 'id_locker' | 'code' | 'name' | 'location'>;
  range: { from: string; to: string; timezone: string };
  doorByDay: Array<{ day: string; opened: number; closed: number }>;
  activityHeatmap: Array<{ dayOfWeek: number; hour: number; count: number }>;
  infraredDetectionsWithDoorClosed: number;
  packageSizeDistribution: Array<{ size: 'S' | 'M' | 'L'; count: number }>;
  liveDistance: Array<{
    componentId: number;
    key: string;
    name: string;
    unit: string | null;
    measuredDistanceCm: number | null;
    quality: string | null;
    recordedAt: string | null;
    emptyDistanceCm: number;
    estimatedHeightCm: number | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class LockerDetailService {
  private readonly http = inject(HttpClient);

  state(id: number): Observable<LockerDetailState> {
    return this.http.get<LockerDetailState>(`${LOCKERS_API}/${id}/state`);
  }

  readings(id: number, filters: LockerDataFilters = {}): Observable<{ readings: Reading[] }> {
    return this.http.get<{ readings: Reading[] }>(`${LOCKERS_API}/${id}/readings`, {
      params: this.toParams(filters)
    });
  }

  events(id: number, filters: LockerDataFilters = {}): Observable<{ events: LockerEvent[] }> {
    return this.http.get<{ events: LockerEvent[] }>(`${LOCKERS_API}/${id}/events`, {
      params: this.toParams(filters)
    });
  }

  analytics(id: number): Observable<LockerAnalytics> {
    return this.http.get<LockerAnalytics>(`${LOCKERS_API}/${id}/analytics`);
  }

  streamTicket(id: number): Observable<{ ticket: string; expiresInSeconds: number }> {
    return this.http.post<{ ticket: string; expiresInSeconds: number }>(
      `${LOCKERS_API}/${id}/stream-ticket`,
      {}
    );
  }

  streamUrl(id: number, ticket: string, lastEventId?: string): string {
    const params = new URLSearchParams({ ticket });
    if (lastEventId) params.set('lastEventId', lastEventId);
    return `${LOCKERS_API}/${id}/stream?${params.toString()}`;
  }

  private toParams(filters: LockerDataFilters): HttpParams {
    let params = new HttpParams().set('limit', String(filters.limit ?? 100));
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    return params;
  }
}
