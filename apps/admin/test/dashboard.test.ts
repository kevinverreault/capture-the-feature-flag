import { describe, expect, it } from 'vitest';
import {
  axisLabel,
  compactCount,
  dashboardRange,
  describeCounts,
  evaluationChart,
  lastEvaluated,
  niceTicks,
  variationCells,
  variationColumns,
} from '../src/lib/dashboard.js';

const flags = [
  { key: 'rare-bird-alerts', name: 'Rare bird alerts', variations: [true, false], archived: false },
  { key: 'photo-id-beta', name: 'Photo ID (beta)', variations: [true, false], archived: false },
  { key: 'old-feed', name: 'Old feed', variations: [true, false], archived: true },
];

const series = {
  range: '24h' as const,
  environmentKey: null,
  bucketMinutes: 60,
  from: '2026-11-14T13:00:00.000Z',
  to: '2026-11-15T13:00:00.000Z',
  counts: [
    {
      start: '2026-11-14T13:00:00.000Z',
      flagKey: 'rare-bird-alerts',
      environmentKey: 'production',
      variationIndex: 0,
      count: 4,
    },
    {
      start: '2026-11-14T13:00:00.000Z',
      flagKey: 'rare-bird-alerts',
      environmentKey: 'production',
      variationIndex: 1,
      count: 1,
    },
    {
      start: '2026-11-15T12:00:00.000Z',
      flagKey: 'photo-id-beta',
      environmentKey: 'development',
      variationIndex: 1,
      count: 7,
    },
    {
      start: '2026-11-15T12:00:00.000Z',
      flagKey: 'rare-bird-alerts',
      environmentKey: 'development',
      variationIndex: 0,
      count: 2,
    },
    {
      start: '2026-11-15T12:00:00.000Z',
      flagKey: 'old-feed',
      environmentKey: 'production',
      variationIndex: 0,
      count: 3,
    },
    // A flag deleted since.
    { start: '2026-11-15T12:00:00.000Z', flagKey: 'gone', environmentKey: 'production', variationIndex: 0, count: 1 },
  ],
};

describe('dashboardRange', () => {
  it('reads 24h or 7d, and falls back on 24h', () => {
    expect(dashboardRange('7d')).toBe('7d');
    expect(dashboardRange('24h')).toBe('24h');
    expect(dashboardRange(null)).toBe('24h');
    expect(dashboardRange('30d')).toBe('24h');
  });
});

describe('evaluationChart', () => {
  const chart = evaluationChart(series, flags);

  it('has a bucket for every hour of the range, empty ones included, oldest first', () => {
    expect(chart.buckets).toHaveLength(24);
    expect(chart.buckets[0]).toEqual({ start: new Date('2026-11-14T13:00:00.000Z'), counts: [4, 1], total: 5 });
    expect(chart.buckets[1]).toEqual({ start: new Date('2026-11-14T14:00:00.000Z'), counts: [0, 0], total: 0 });
    expect(chart.buckets[23]).toEqual({ start: new Date('2026-11-15T12:00:00.000Z'), counts: [6, 7], total: 13 });
  });

  it('stacks the variations by value, true before false, whatever their index', () => {
    expect(chart.variations).toEqual(['true', 'false']);
    expect(chart.total).toBe(18);
    expect(chart.totals).toEqual([10, 8]);
  });

  it('totals each flag over the range, most evaluated first, naming flags by their name when known', () => {
    expect(chart.flags).toEqual([
      { key: 'photo-id-beta', name: 'Photo ID (beta)', known: true, archived: false, counts: [0, 7], total: 7 },
      { key: 'rare-bird-alerts', name: 'Rare bird alerts', known: true, archived: false, counts: [6, 1], total: 7 },
      { key: 'old-feed', name: 'Old feed', known: true, archived: true, counts: [3, 0], total: 3 },
      { key: 'gone', name: 'gone', known: false, archived: false, counts: [1, 0], total: 1 },
    ]);
  });

  it('totals each flag in each environment, for the table view', () => {
    expect(chart.rows).toEqual([
      { flagKey: 'gone', flagName: 'gone', environmentKey: 'production', counts: [1, 0], total: 1 },
      { flagKey: 'old-feed', flagName: 'Old feed', environmentKey: 'production', counts: [3, 0], total: 3 },
      {
        flagKey: 'photo-id-beta',
        flagName: 'Photo ID (beta)',
        environmentKey: 'development',
        counts: [0, 7],
        total: 7,
      },
      {
        flagKey: 'rare-bird-alerts',
        flagName: 'Rare bird alerts',
        environmentKey: 'development',
        counts: [2, 0],
        total: 2,
      },
      {
        flagKey: 'rare-bird-alerts',
        flagName: 'Rare bird alerts',
        environmentKey: 'production',
        counts: [4, 1],
        total: 5,
      },
    ]);
  });

  it('has 28 six-hour buckets over 7 days, and nothing to stack without evaluations', () => {
    const week = evaluationChart(
      {
        ...series,
        range: '7d',
        bucketMinutes: 360,
        from: '2026-11-08T18:00:00.000Z',
        to: '2026-11-15T18:00:00.000Z',
        counts: [],
      },
      flags,
    );
    expect(week.buckets).toHaveLength(28);
    expect(week.total).toBe(0);
    expect(week.flags).toEqual([]);
    expect(week.variations).toEqual(['true', 'false']);
  });
});

describe('niceTicks', () => {
  it('steps from 0 past the largest value in round numbers', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(4_200)).toEqual([0, 2_000, 4_000, 6_000]);
  });

  it('still has an axis when there is nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('compactCount', () => {
  it('writes counts from 1,000 up compactly', () => {
    expect(compactCount(950)).toBe('950');
    expect(compactCount(1_284)).toBe('1.3K');
    expect(compactCount(12_900_000)).toBe('12.9M');
  });
});

describe('axisLabel', () => {
  it('labels hourly buckets by their UTC hour, and 6-hour buckets by their UTC day', () => {
    expect(axisLabel(new Date('2026-11-15T06:00:00.000Z'), '24h')).toBe('06:00');
    expect(axisLabel(new Date('2026-11-15T00:00:00.000Z'), '7d')).toBe('Sun 15');
  });
});

describe('lastEvaluated', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');

  it('says how long ago a flag was last evaluated, in days', () => {
    expect(lastEvaluated('2026-11-05T11:00:00.000Z', now)).toBe('Last evaluated 10 days ago');
    expect(lastEvaluated('2026-11-14T11:00:00.000Z', now)).toBe('Last evaluated 1 day ago');
  });

  it('says when no evaluation was kept', () => {
    expect(lastEvaluated(null, now)).toBe('No evaluations in the kept telemetry');
  });
});

describe('chart table views and labels', () => {
  it('describes counts per variation, and lays them out as table columns and cells', () => {
    expect(describeCounts(['true', 'false'], [1_200, 3])).toBe('1,200 true, 3 false');
    expect(variationColumns(['true', 'false']).map((column) => column.label)).toEqual(['true', 'false', 'Total']);
    expect(variationCells([1_200, 3], 1_203)).toEqual({ v0: '1,200', v1: '3', total: '1,203' });
  });
});
