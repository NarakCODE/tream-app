import { calculateNextCycles, getAlignedStartOfWeek } from './cycle-calculator';
import type { Cycle, CycleSettings } from './cycle';

describe('Cycle Calculator Domain Service', () => {
  const defaultSettings: CycleSettings = {
    cycleDurationWeeks: 2,
    cycleStartDay: 1, // Monday
    cycleCooldownDays: 0,
    upcomingCyclesCount: 3,
    cyclesEnabled: true,
    timezone: 'UTC',
  };

  it('returns empty array when cycles are disabled', () => {
    const disabledSettings: CycleSettings = {
      ...defaultSettings,
      cyclesEnabled: false,
    };
    const drafts = calculateNextCycles(disabledSettings, []);
    expect(drafts).toEqual([]);
  });

  it('aligns start of week to Monday correctly', () => {
    // 2026-09-02 is a Wednesday
    const wednesday = new Date('2026-09-02T15:30:00.000Z');
    const monday = getAlignedStartOfWeek(wednesday, 1);
    expect(monday.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('generates sequential non-overlapping initial cycles when none exist', () => {
    const ref = new Date('2026-09-01T12:00:00.000Z');
    const drafts = calculateNextCycles(defaultSettings, [], ref);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      number: 1,
      name: 'Cycle 1',
      startsAt: new Date('2026-08-31T00:00:00.000Z'),
      endsAt: new Date('2026-09-14T00:00:00.000Z'),
    });
    expect(drafts[1]).toMatchObject({
      number: 2,
      name: 'Cycle 2',
      startsAt: new Date('2026-09-14T00:00:00.000Z'),
      endsAt: new Date('2026-09-28T00:00:00.000Z'),
    });
    expect(drafts[2]).toMatchObject({
      number: 3,
      name: 'Cycle 3',
      startsAt: new Date('2026-09-28T00:00:00.000Z'),
      endsAt: new Date('2026-10-12T00:00:00.000Z'),
    });
  });

  it('generates missing future cycles when some exist', () => {
    const existing: Cycle[] = [
      {
        id: 'cyc_01',
        teamId: 'tem_01',
        number: 1,
        name: 'Cycle 1',
        startsAt: new Date('2026-08-31T00:00:00.000Z'),
        endsAt: new Date('2026-09-14T00:00:00.000Z'),
        completedAt: new Date('2026-09-14T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const ref = new Date('2026-09-15T00:00:00.000Z');
    const drafts = calculateNextCycles(defaultSettings, existing, ref);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.number).toBe(2);
    expect(drafts[0]?.startsAt).toEqual(new Date('2026-09-14T00:00:00.000Z'));
    expect(drafts[1]?.number).toBe(3);
    expect(drafts[2]?.number).toBe(4);
  });
});
