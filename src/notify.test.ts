import { describe, expect, it } from 'vitest';
import { buildSchedule, calcTiming, getDeadlineStatus } from './calc';
import { calcNotificationTimes, createNotifier, planNotifications, type WorkerMessage } from './notify';

const ratio = { flour: 1, water: 1, starter: 1 };
const timing = calcTiming(ratio, 24);
const start = new Date('2026-01-01T08:00:00Z');

describe('calcNotificationTimes', () => {
  it('returns the peak of the schedule', () => {
    expect(calcNotificationTimes(start, timing).peak).toEqual(buildSchedule(start, timing).peak);
  });

  it('returns the first moment of the urgent level', () => {
    const { urgent } = calcNotificationTimes(start, timing);
    const elapsed = (ms: number) => (ms - start.getTime()) / 3_600_000;
    expect(getDeadlineStatus(elapsed(urgent.getTime() + 1000), timing).level).toBe('urgent');
    expect(getDeadlineStatus(elapsed(urgent.getTime() - 60_000), timing).level).not.toBe('urgent');
  });
});

describe('planNotifications', () => {
  it('plans both notifications with the correct text', () => {
    const plan = planNotifications(start, timing, start.getTime());
    expect(plan.map((n) => n.tag)).toEqual(['peak', 'urgent']);
    expect(plan[0].body).toContain('Peak');
    expect(plan[1].body).toMatch(/Frist \d\d:\d\d Uhr/);
  });

  it('drops a notification that already lies in the past', () => {
    const { peak } = calcNotificationTimes(start, timing);
    expect(planNotifications(start, timing, peak.getTime() + 1).map((n) => n.tag)).toEqual(['urgent']);
  });
});

describe('createNotifier', () => {
  it('cancels the scheduled notifications after a reset', () => {
    const sent: WorkerMessage[] = [];
    const notifier = createNotifier((m) => sent.push(m));
    notifier.schedule(start, timing, start.getTime());
    notifier.cancel();
    expect(sent.map((m) => m.type)).toEqual(['schedule', 'cancel']);
  });

  it('replaces the old plan when the user feeds again', () => {
    const sent: WorkerMessage[] = [];
    const notifier = createNotifier((m) => sent.push(m));
    const later = new Date(start.getTime() + 3_600_000);
    notifier.schedule(start, timing, start.getTime());
    notifier.schedule(later, timing, later.getTime());
    const [a, b] = sent.map((m) => (m.type === 'schedule' ? m.items[0].at : 0));
    expect(b - a).toBe(3_600_000);
  });

  it('sends an equal plan only once', () => {
    const sent: WorkerMessage[] = [];
    const notifier = createNotifier((m) => sent.push(m));
    notifier.schedule(start, timing, start.getTime());
    notifier.schedule(start, timing, start.getTime());
    notifier.cancel();
    notifier.cancel();
    expect(sent.map((m) => m.type)).toEqual(['schedule', 'cancel']);
  });

  it('sends again after reset, for example when a new worker takes over', () => {
    const sent: WorkerMessage[] = [];
    const notifier = createNotifier((m) => sent.push(m));
    notifier.schedule(start, timing, start.getTime());
    notifier.reset();
    notifier.schedule(start, timing, start.getTime());
    expect(sent).toHaveLength(2);
  });

  it('sends again after a failed post', async () => {
    let calls = 0;
    const notifier = createNotifier(async () => {
      calls += 1;
      if (calls === 1) throw new Error('no active worker');
    });
    notifier.schedule(start, timing, start.getTime());
    await new Promise((r) => setTimeout(r, 0));
    notifier.schedule(start, timing, start.getTime());
    expect(calls).toBe(2);
  });

  it('sends again after a synchronous throw', () => {
    let calls = 0;
    const notifier = createNotifier(() => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    });
    notifier.schedule(start, timing, start.getTime());
    notifier.schedule(start, timing, start.getTime());
    expect(calls).toBe(2);
  });

  it('keeps a newer message when an older post fails late', async () => {
    const calls: string[] = [];
    let failFirst: (() => void) | undefined;
    const notifier = createNotifier((m) => {
      calls.push(m.type);
      if (calls.length === 1) return new Promise((_, reject) => (failFirst = () => reject(new Error('late'))));
    });
    notifier.schedule(start, timing, start.getTime());
    notifier.cancel();
    failFirst?.();
    await new Promise((r) => setTimeout(r, 0));
    notifier.cancel();
    expect(calls).toEqual(['schedule', 'cancel']);
  });
});
