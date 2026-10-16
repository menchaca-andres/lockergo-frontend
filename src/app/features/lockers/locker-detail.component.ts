import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  LockerAnalytics,
  LockerDetailService,
  LockerDetailState,
  LockerEvent,
  Reading
} from '../../core/lockers/locker-detail.service';
import { DeviceStatus } from '../../core/lockers/lockers.service';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-locker-detail',
  standalone: true,
  imports: [BaseChartDirective, DatePipe, JsonPipe, RouterLink],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './locker-detail.component.html',
  styleUrl: './locker-detail.component.scss'
})
export class LockerDetailComponent implements OnInit, OnDestroy {
  readonly state = signal<LockerDetailState | null>(null);
  readonly readings = signal<Reading[]>([]);
  readonly readingPage = signal(1);
  readonly readingPagination = signal({ page: 1, limit: 20, total: 0, totalPages: 0 });
  readonly readingComponentId = signal<number | null>(null);
  readonly readingLoading = signal(false);
  readonly readingError = signal('');
  readonly events = signal<LockerEvent[]>([]);
  readonly analytics = signal<LockerAnalytics | null>(null);
  readonly loading = signal(true);
  readonly pageError = signal('');
  readonly activityError = signal('');
  readonly analyticsLoading = signal(true);
  readonly analyticsError = signal('');
  readonly streamStatus = signal<'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'UNAVAILABLE'>('CONNECTING');
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly readingComponents = computed(() => this.state()?.devices.flatMap(
    (device) => device.components
  ) ?? []);
  readonly days = DAY_LABELS;
  readonly hours = Array.from({ length: 24 }, (_value, hour) => hour);
  readonly doorChartData = computed<ChartData<'bar'>>(() => {
    const days = this.analytics()?.doorByDay ?? [];
    return {
      labels: days.map(({ day }) => day.slice(5)),
      datasets: [
        {
          label: 'Aperturas',
          data: days.map(({ opened }) => opened),
          backgroundColor: '#168b7e',
          borderRadius: 5
        },
        {
          label: 'Cierres',
          data: days.map(({ closed }) => closed),
          backgroundColor: '#8eaaa5',
          borderRadius: 5
        }
      ]
    };
  });
  readonly measurementChartData = computed<ChartData<'bar'>>(() => {
    const measurements = this.analytics()?.packageMeasurements ?? [];
    return {
      labels: measurements.map(({ packageCode }) => packageCode),
      datasets: [{
        data: measurements.map(({ estimatedHeightCm }) => estimatedHeightCm),
        label: 'Altura estimada (cm)',
        backgroundColor: '#168b7e',
        borderRadius: 5
      }]
    };
  });
  readonly doorChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(120, 145, 146, .16)' } }
    }
  };
  readonly measurementChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const height = context.parsed.x;
            return typeof height === 'number' ? ` ${height.toFixed(1)} cm` : 'Sin medida válida';
          },
          afterLabel: (context) => {
            const measurement = this.analytics()?.packageMeasurements[context.dataIndex];
            return measurement ? `Registrada: ${new Date(measurement.recordedAt).toLocaleString()}` : '';
          }
        }
      }
    },
    scales: {
      x: { beginAtZero: true, max: 20, title: { display: true, text: 'Altura estimada (cm)' } },
      y: { grid: { display: false } }
    }
  };
  private readonly auth = inject(AuthService);
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

  doorOpenings(): number {
    return (this.analytics()?.doorByDay ?? []).reduce((total, day) => total + day.opened, 0);
  }

  heatCount(dayOfWeek: number, hour: number): number {
    return this.analytics()?.activityHeatmap.find(
      (cell) => cell.dayOfWeek === dayOfWeek && cell.hour === hour
    )?.count ?? 0;
  }

  heatColor(dayOfWeek: number, hour: number): string {
    const cells = this.analytics()?.activityHeatmap ?? [];
    const max = Math.max(1, ...cells.map((cell) => cell.count));
    const opacity = 0.1 + (this.heatCount(dayOfWeek, hour) / max) * 0.9;
    return `rgba(22, 139, 126, ${opacity})`;
  }

  packageHeightPercent(heightCm: number | null): number {
    return heightCm === null ? 0 : Math.max(0, Math.min(100, (heightCm / 20) * 100));
  }

  retryAnalytics(): void {
    this.loadAnalytics();
  }

  deviceStatusLabel(status: DeviceStatus | 'INACTIVE'): string {
    switch (status) {
      case 'ONLINE': return 'En línea';
      case 'OFFLINE': return 'Desconectado';
      case 'INACTIVE': return 'Inactivo';
      case 'NO_DEVICE': return 'Sin dispositivo';
    }
  }

  onReadingComponentChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const componentId = Number(target.value);
    if (!Number.isSafeInteger(componentId) || componentId <= 0) return;
    this.readingComponentId.set(componentId);
    this.loadReadingHistory(1);
  }

  previousReadingPage(): void {
    if (this.readingPage() > 1) this.loadReadingHistory(this.readingPage() - 1);
  }

  nextReadingPage(): void {
    if (this.readingPage() < this.readingPagination().totalPages) {
      this.loadReadingHistory(this.readingPage() + 1);
    }
  }

  private loadInitial(): void {
    forkJoin({
      state: this.api.state(this.lockerId),
      events: this.api.events(this.lockerId)
    }).subscribe({
      next: ({ state, events }) => {
        if (this.destroyed) return;
        this.state.set(state);
        const components = state.devices.flatMap((device) => device.components);
        const selected = this.readingComponentId();
        if (!selected || !components.some((component) => component.id_component === selected)) {
          this.readingComponentId.set(components[0]?.id_component ?? null);
        }
        this.events.set(events.events);
        this.loading.set(false);
        this.activityError.set('');
        this.loadReadingHistory(1);
        this.connectStream();
        this.loadAnalytics();
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
      events: this.api.events(this.lockerId)
    }).subscribe({
      next: ({ state, events }) => {
        if (this.destroyed) return;
        this.state.set(state);
        const components = state.devices.flatMap((device) => device.components);
        if (!components.some((component) => component.id_component === this.readingComponentId())) {
          this.readingComponentId.set(components[0]?.id_component ?? null);
          this.loadReadingHistory(1);
        } else {
          this.loadReadingHistory(this.readingPage());
        }
        this.events.set(events.events);
        this.activityError.set('');
        this.loadAnalytics();
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.activityError.set(this.errorMessage(error, 'No se pudo actualizar la información.'));
      }
    });
  }

  private loadReadingHistory(page: number): void {
    const componentId = this.readingComponentId();
    if (componentId === null) {
      this.readings.set([]);
      this.readingPagination.set({ page: 1, limit: 20, total: 0, totalPages: 0 });
      this.readingLoading.set(false);
      return;
    }
    this.readingLoading.set(true);
    this.readingError.set('');
    this.api.readings(this.lockerId, { componentId, page, limit: 20 }).subscribe({
      next: (result) => {
        if (this.destroyed || componentId !== this.readingComponentId()) return;
        this.readings.set(result.readings);
        this.readingPagination.set(result.pagination);
        this.readingPage.set(result.pagination.page);
        this.readingLoading.set(false);
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.readingError.set(this.errorMessage(error, 'No se pudo cargar el historial de lecturas.'));
        this.readingLoading.set(false);
      }
    });
  }

  private refreshState(): void {
    this.api.state(this.lockerId).subscribe({
      next: (state) => {
        if (!this.destroyed) {
          this.state.set(state);
          this.loadAnalytics();
        }
      },
      error: (error: unknown) => {
        if (!this.destroyed) this.activityError.set(this.errorMessage(error, 'No se pudo actualizar el estado.'));
      }
    });
  }

  private loadAnalytics(): void {
    if (!this.isAdmin()) {
      this.analyticsLoading.set(false);
      return;
    }
    this.api.analytics(this.lockerId).subscribe({
      next: (analytics) => {
        if (this.destroyed) return;
        this.analytics.set(analytics);
        this.analyticsError.set('');
        this.analyticsLoading.set(false);
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        this.analyticsError.set(this.errorMessage(error, 'No se pudo cargar la analítica del locker.'));
        this.analyticsLoading.set(false);
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
