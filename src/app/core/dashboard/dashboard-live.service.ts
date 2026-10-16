import { Injectable, NgZone, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { DashboardApiService, PackageLiveUpdate } from './dashboard-api.service';

export type LiveStatus = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'UNAVAILABLE';

@Injectable({ providedIn: 'root' })
export class DashboardLiveService {
  private readonly api = inject(DashboardApiService);
  private readonly zone = inject(NgZone);

  watchPackages(
    onUpdate: (update: PackageLiveUpdate) => void,
    onStatus: (status: LiveStatus) => void
  ): () => void {
    let destroyed = false;
    let source: EventSource | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastEventId = '';
    let ticketRequest: Subscription | undefined;

    const cleanupSource = () => {
      source?.close();
      source = undefined;
      if (renewalTimer) clearTimeout(renewalTimer);
      renewalTimer = undefined;
    };
    const connect = () => {
      if (destroyed) return;
      cleanupSource();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      this.zone.run(() => onStatus('CONNECTING'));
      ticketRequest = this.api.packageStreamTicket().subscribe({
        next: ({ ticket, expiresInSeconds }) => {
          if (destroyed) return;
          const eventSource = new EventSource(this.api.packageStreamUrl(ticket, lastEventId));
          source = eventSource;
          eventSource.addEventListener('ready', () => this.zone.run(() => onStatus('LIVE')));
          eventSource.addEventListener('reset', () => this.zone.run(() => onStatus('RECONNECTING')));
          eventSource.addEventListener('package.update', (event: Event) => {
            const message = event as MessageEvent<string>;
            if (message.lastEventId) lastEventId = message.lastEventId;
            try {
              const update = JSON.parse(message.data) as PackageLiveUpdate;
              this.zone.run(() => onUpdate(update));
            } catch {
              this.zone.run(() => onStatus('UNAVAILABLE'));
            }
          });
          eventSource.onerror = () => {
            this.zone.run(() => onStatus('RECONNECTING'));
            if (eventSource.readyState === EventSource.CLOSED) scheduleReconnect();
          };
          renewalTimer = setTimeout(
            connect,
            Math.max(30, expiresInSeconds - 60) * 1000
          );
        },
        error: () => {
          if (destroyed) return;
          this.zone.run(() => onStatus('UNAVAILABLE'));
          scheduleReconnect();
        }
      });
    };
    const scheduleReconnect = () => {
      if (destroyed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, 3000);
    };

    connect();
    return () => {
      destroyed = true;
      ticketRequest?.unsubscribe();
      cleanupSource();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }

  watchLocker(
    lockerId: number,
    onUpdate: () => void,
    onStatus: (status: LiveStatus) => void
  ): () => void {
    let destroyed = false;
    let source: EventSource | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastEventId = '';
    let ticketRequest: Subscription | undefined;

    const cleanupSource = () => {
      source?.close();
      source = undefined;
      if (renewalTimer) clearTimeout(renewalTimer);
      renewalTimer = undefined;
    };
    const connect = () => {
      if (destroyed) return;
      cleanupSource();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      this.zone.run(() => onStatus('CONNECTING'));
      ticketRequest = this.api.lockerStreamTicket(lockerId).subscribe({
        next: ({ ticket, expiresInSeconds }) => {
          if (destroyed) return;
          const eventSource = new EventSource(
            this.api.lockerStreamUrl(lockerId, ticket, lastEventId)
          );
          source = eventSource;
          eventSource.addEventListener('ready', () => this.zone.run(() => onStatus('LIVE')));
          eventSource.addEventListener('reset', () => this.zone.run(onUpdate));
          eventSource.addEventListener('locker.update', (event: Event) => {
            const message = event as MessageEvent<string>;
            if (message.lastEventId) lastEventId = message.lastEventId;
            this.zone.run(onUpdate);
          });
          eventSource.onerror = () => {
            this.zone.run(() => onStatus('RECONNECTING'));
            if (eventSource.readyState === EventSource.CLOSED) scheduleReconnect();
          };
          renewalTimer = setTimeout(
            connect,
            Math.max(30, expiresInSeconds - 60) * 1000
          );
        },
        error: () => {
          if (destroyed) return;
          this.zone.run(() => onStatus('UNAVAILABLE'));
          scheduleReconnect();
        }
      });
    };
    const scheduleReconnect = () => {
      if (destroyed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, 3000);
    };

    connect();
    return () => {
      destroyed = true;
      ticketRequest?.unsubscribe();
      cleanupSource();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }
}
