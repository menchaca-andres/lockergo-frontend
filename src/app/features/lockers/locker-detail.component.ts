import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  LockerDetailService,
  LockerDetailState,
  LockerEvent,
  Reading
} from '../../core/lockers/locker-detail.service';
import { DeviceStatus } from '../../core/lockers/lockers.service';

@Component({
  selector: 'app-locker-detail',
  standalone: true,
  imports: [DatePipe, JsonPipe, RouterLink],
  templateUrl: './locker-detail.component.html',
  styleUrl: './locker-detail.component.scss'
})
export class LockerDetailComponent implements OnInit, OnDestroy {
  readonly state = signal<LockerDetailState | null>(null);
  readonly readings = signal<Reading[]>([]);
  readonly events = signal<LockerEvent[]>([]);
  readonly loading = signal(true);
  readonly pageError = signal('');
  readonly activityError = signal('');
  readonly streamStatus = signal<'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'UNAVAILABLE'>('CONNECTING');
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(LockerDetailService);
  private lockerId = 0;
  private source?: EventSource;
  private renewalTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private statusTimer?: ReturnType<typeof setInterval>;
  private lastEventId = '';
  private destroyed = false;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {
      this.pageError.set('El identificador del locker no es válido.');
      this.loading.set(false);
      return;
    }
    this.lockerId = id;
    this.loadInitial();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.closeStream();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
  }

  reload(): void {
    this.pageError.set('');
    this.loading.set(true);
    this.loadInitial();
  }

  valueOf(reading: Pick<Reading, 'valueNum' | 'valueBool' | 'valueText' | 'payload'>, unit?: string | null): string {
    if (reading.valueNum !== null) return `${reading.valueNum}${unit ? ` ${unit}` : ''}`;
    if (reading.valueBool !== null) return reading.valueBool ? 'Sí' : 'No';
    if (reading.valueText !== null) return reading.valueText;
    if (reading.payload !== null) return JSON.stringify(reading.payload);
    return 'Sin valor';
  }

  deviceStatusLabel(status: DeviceStatus | 'INACTIVE'): string {
    switch (status) {
      case 'ONLINE': return 'En línea';
      case 'OFFLINE': return 'Desconectado';
      case 'INACTIVE': return 'Inactivo';
      case 'NO_DEVICE': return 'Sin dispositivo';
    }
  }

  private loadInitial(): void {
    forkJoin({
      state: this.api.state(this.lockerId),
      readings: this.api.readings(this.lockerId),
      events: this.api.events(this.lockerId)
    }).subscribe({
      next: ({ state, readings, events }) => {
        if (this.destroyed) return;
        this.state.set(state);
        this.readings.set(readings.readings);
        this.events.set(events.events);
        this.loading.set(false);
        this.activityError.set('');
        this.connectStream();
        if (!this.statusTimer) {
          this.statusTimer = setInterval(() => this.refreshState(), 30_000);
        }
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.pageError.set(this.errorMessage(error, 'No se pudo cargar el detalle del locker.'));
        this.loading.set(false);
      }
    });
  }

  private connectStream(): void {
    if (this.destroyed) return;
    this.closeStream();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.streamStatus.set('CONNECTING');
    this.api.streamTicket(this.lockerId).subscribe({
      next: ({ ticket, expiresInSeconds }) => {
        if (this.destroyed) return;
        const source = new EventSource(this.api.streamUrl(this.lockerId, ticket, this.lastEventId));
        this.source = source;
        source.addEventListener('ready', () => this.streamStatus.set('LIVE'));
        source.addEventListener('reset', () => this.scheduleRefresh());
        source.addEventListener('locker.update', (event: Event) => {
          const streamEvent = event as MessageEvent<string>;
          if (streamEvent.lastEventId) this.lastEventId = streamEvent.lastEventId;
          this.scheduleRefresh();
        });
        source.onerror = () => {
          if (source.readyState === EventSource.CLOSED) {
            this.streamStatus.set('RECONNECTING');
            this.scheduleReconnect();
          } else {
            this.streamStatus.set('RECONNECTING');
          }
        };
        this.renewalTimer = setTimeout(
          () => this.connectStream(),
          Math.max(30, expiresInSeconds - 60) * 1000
        );
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.streamStatus.set('UNAVAILABLE');
        this.activityError.set(this.errorMessage(error, 'No se pudo establecer la actualización en vivo.'));
        this.scheduleReconnect();
      }
    });
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshLiveData(), 350);
  }

  private refreshLiveData(): void {
    forkJoin({
      state: this.api.state(this.lockerId),
      readings: this.api.readings(this.lockerId),
      events: this.api.events(this.lockerId)
    }).subscribe({
      next: ({ state, readings, events }) => {
        if (this.destroyed) return;
        this.state.set(state);
        this.readings.set(readings.readings);
        this.events.set(events.events);
        this.activityError.set('');
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.activityError.set(this.errorMessage(error, 'No se pudo actualizar la información.'));
      }
    });
  }

  private refreshState(): void {
    this.api.state(this.lockerId).subscribe({
      next: (state) => {
        if (!this.destroyed) this.state.set(state);
      },
      error: (error: unknown) => {
        if (!this.destroyed) this.activityError.set(this.errorMessage(error, 'No se pudo actualizar el estado.'));
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connectStream(), 3000);
  }

  private closeStream(): void {
    this.source?.close();
    this.source = undefined;
    if (this.renewalTimer) clearTimeout(this.renewalTimer);
    this.renewalTimer = undefined;
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con LockerGo. Comprueba que el backend esté iniciado.';
      if (error.status === 404) return 'No se encontró el locker o no tienes permiso para verlo.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return fallback;
  }
}
