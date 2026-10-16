import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartConfiguration, ChartData } from 'chart.js';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardApiService, AdminDashboardOverview } from '../../core/dashboard/dashboard-api.service';
import { DashboardLiveService, LiveStatus } from '../../core/dashboard/dashboard-live.service';
import { LockerOverview, LockersService } from '../../core/lockers/lockers.service';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [BaseChartDirective, DatePipe, RouterLink],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  readonly overview = signal<AdminDashboardOverview | null>(null);
  readonly lockers = signal<LockerOverview[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly liveStatus = signal<LiveStatus>('CONNECTING');
  readonly days = DAY_LABELS;
  readonly hours = Array.from({ length: 24 }, (_value, hour) => hour);
  readonly hasAlerts = computed(() => (this.overview()?.alerts.length ?? 0) > 0);
  readonly totalActivityCount = computed(
    () => (this.overview()?.activityHeatmap ?? []).reduce((total, cell) => total + cell.count, 0)
  );
  readonly rankingData = computed<ChartData<'bar'>>(() => {
    const ranking = this.overview()?.lockerRanking ?? [];
    return {
      labels: ranking.map((item) => item.lockerCode),
      datasets: [{
        data: ranking.map((item) => item.count),
        label: 'Aperturas',
        backgroundColor: '#148b7e',
        borderRadius: 6,
        barThickness: 16
      }]
    };
  });
  readonly packageData = computed<ChartData<'doughnut'>>(() => {
    const statuses = this.overview()?.packagesByStatus ?? [];
    return {
      labels: statuses.map(({ status }) => status === 'PENDING' ? 'Pendientes' : 'Recogidos'),
      datasets: [{
        data: statuses.map(({ count }) => count),
        backgroundColor: ['#e7a43b', '#178b74'],
        borderWidth: 0,
        hoverOffset: 5
      }]
    };
  });
  readonly packageMeasurementData = computed<ChartData<'bar'>>(() => {
    const measurements = this.overview()?.packageMeasurements ?? [];
    return {
      labels: measurements.map(({ packageCode, lockerCode }) => `${packageCode} · ${lockerCode}`),
      datasets: [{
        data: measurements.map(({ estimatedHeightCm }) => estimatedHeightCm),
        label: 'Altura estimada',
        backgroundColor: '#168b7e',
        borderRadius: 6,
        barThickness: 18
      }]
    };
  });
  readonly packageMeasurementChartHeight = computed(
    () => `${Math.max(180, (this.overview()?.packageMeasurements.length ?? 0) * 34)}px`
  );
  readonly rankingOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(120, 145, 146, .16)' }, ticks: { precision: 0 } },
      y: { grid: { display: false } }
    }
  };
  readonly packageOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: { legend: { position: 'bottom' } }
  };
  readonly packageMeasurementOptions: ChartConfiguration<'bar'>['options'] = {
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
          const measurement = this.overview()?.packageMeasurements[context.dataIndex];
          return measurement ? `Registrada: ${new Date(measurement.recordedAt).toLocaleString()}` : '';
        }
      }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 20,
        title: { display: true, text: 'Altura estimada del paquete (cm)' },
        ticks: { precision: 1 },
        grid: { color: 'rgba(120, 145, 146, .16)' }
      },
      y: { grid: { display: false } }
    }
  };

  private readonly api = inject(DashboardApiService);
  private readonly live = inject(DashboardLiveService);
  private readonly lockersApi = inject(LockersService);
  private readonly streamDisposers = new Map<number, () => void>();
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private destroyed = false;

  ngOnInit(): void {
    this.loadDashboard(true);
    this.pollTimer = setInterval(() => this.loadDashboard(false), 60_000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    for (const dispose of this.streamDisposers.values()) dispose();
    this.streamDisposers.clear();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  retry(): void {
    this.loadDashboard(true);
  }

  heatCount(dayOfWeek: number, hour: number): number {
    return this.overview()?.activityHeatmap.find(
      (cell) => cell.dayOfWeek === dayOfWeek && cell.hour === hour
    )?.count ?? 0;
  }

  heatBackground(dayOfWeek: number, hour: number): string {
    const cells = this.overview()?.activityHeatmap ?? [];
    const max = Math.max(1, ...cells.map((cell) => cell.count));
    const intensity = this.heatCount(dayOfWeek, hour) / max;
    return `rgba(25, 140, 126, ${0.08 + intensity * 0.92})`;
  }

  heatTextColor(dayOfWeek: number, hour: number): string {
    const cells = this.overview()?.activityHeatmap ?? [];
    const max = Math.max(1, ...cells.map((cell) => cell.count));
    return this.heatCount(dayOfWeek, hour) / max >= 0.5 ? '#fff' : '#18584f';
  }

  heatCellLabel(dayOfWeek: number, hour: number): string {
    const formatHour = (value: number) => String(value).padStart(2, '0');
    const nextHour = (hour + 1) % 24;
    const timezone = this.overview()?.activityRange.timezone ?? 'hora local';
    return `${DAY_LABELS[dayOfWeek]}, ${formatHour(hour)}:00–${formatHour(nextHour)}:00 ${timezone}: ${this.heatCount(dayOfWeek, hour)} aperturas`;
  }

  eventLabel(type: string): string {
    const labels: Record<string, string> = {
      DOOR_OPENED: 'Puerta abierta',
      DOOR_CLOSED: 'Puerta cerrada',
      PACKAGE_DEPOSITED: 'Paquete depositado',
      PACKAGE_PICKED_UP: 'Paquete recogido',
      PACKET_DETECTED: 'Paquete detectado',
      PACKET_REMOVED: 'Paquete retirado',
      SENSOR_ERROR: 'Error de sensor',
      SENSOR_OUT_OF_RANGE: 'Lectura fuera de rango',
      SENSOR_RECOVERED: 'Sensor recuperado'
    };
    return labels[type] ?? type.replaceAll('_', ' ').toLowerCase();
  }

  alertLabel(type: string): string {
    if (type === 'DEVICE_OFFLINE') return 'Dispositivo desconectado';
    if (type === 'DOOR_OPEN_TOO_LONG') return 'Puerta abierta demasiado tiempo';
    return this.eventLabel(type);
  }

  private loadDashboard(showLoading: boolean): void {
    if (showLoading) {
      this.loading.set(true);
      this.error.set('');
    }
    this.api.adminOverview().subscribe({
      next: (overview) => {
        if (this.destroyed) return;
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (this.destroyed) return;
        if (showLoading || !this.overview()) {
          this.error.set(this.errorMessage(error));
          this.loading.set(false);
        }
      }
    });
    if (this.streamDisposers.size === 0) {
      this.lockersApi.list().subscribe({
        next: (lockers) => {
          if (this.destroyed) return;
          this.lockers.set(lockers);
          for (const locker of lockers) {
            if (!locker.isActive || this.streamDisposers.has(locker.id_locker)) continue;
            const dispose = this.live.watchLocker(
              locker.id_locker,
              () => this.scheduleRefresh(),
              (status) => this.liveStatus.set(status)
            );
            this.streamDisposers.set(locker.id_locker, dispose);
          }
        },
        error: (error: unknown) => {
          if (!this.overview()) this.error.set(this.errorMessage(error));
        }
      });
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.loadDashboard(false), 300);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con LockerGo.';
      if (typeof error.error?.message === 'string') return error.error.message;
    }
    return 'No se pudo cargar el dashboard. Inténtalo de nuevo.';
  }
}
