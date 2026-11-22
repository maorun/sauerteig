import { urgentStartHours, type Timing } from './calc';

export type NotificationTag = 'peak' | 'urgent';

export interface PlannedNotification {
  tag: NotificationTag;
  /** Epoch milliseconds. */
  at: number;
  title: string;
  body: string;
}

export type WorkerMessage = { type: 'schedule'; items: PlannedNotification[] } | { type: 'cancel' };

const fmtClock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Calculates the two notification times, the peak and the start of the `urgent` level. */
export function calcNotificationTimes(start: Date, timing: Timing): { peak: Date; urgent: Date; windowEnd: Date } {
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000);
  return { peak: at(timing.peakHours), urgent: at(urgentStartHours(timing)), windowEnd: at(timing.windowEndHours) };
}

/** Plans the notifications that still lie in the future. */
export function planNotifications(start: Date, timing: Timing, now: number): PlannedNotification[] {
  const t = calcNotificationTimes(start, timing);
  const plan: PlannedNotification[] = [
    {
      tag: 'peak',
      at: t.peak.getTime(),
      title: 'Sauerteig: Peak erreicht',
      body: 'Die ASG ist am Peak. Jetzt verwenden oder füttern.',
    },
    {
      tag: 'urgent',
      at: t.urgent.getTime(),
      title: 'Sauerteig: Jetzt füttern!',
      body: `Frist ${fmtClock.format(t.windowEnd)} Uhr. Danach verhungert die ASG.`,
    },
  ];
  return plan.filter((n) => n.at > now);
}

/** Sends the plan to the service worker. The caller injects the transport. */
export function createNotifier(post: (message: WorkerMessage) => unknown) {
  // The last sent message. render() runs on each keystroke and must not repeat an equal message.
  let last = '';
  const send = (message: WorkerMessage, force: boolean): void => {
    const key = JSON.stringify(message);
    if (!force && key === last) return;
    last = key;
    // A failed post must not block the next try. This holds for a throw and for a rejection.
    const fail = (): void => {
      if (last === key) last = '';
    };
    try {
      Promise.resolve(post(message)).catch(fail);
    } catch {
      fail();
    }
  };
  return {
    /** Pass `force` to send again, for example after a new worker took over. */
    schedule(start: Date, timing: Timing, now = Date.now(), force = false): void {
      send({ type: 'schedule', items: planNotifications(start, timing, now) }, force);
    },
    cancel(force = false): void {
      send({ type: 'cancel' }, force);
    },
    /** Forget the last message, so the next call sends again. */
    reset(): void {
      last = '';
    },
  };
}
