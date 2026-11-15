import type { EvaluationRange, EvaluationSeries } from '@ctff/core-api-client';

/** The time ranges the dashboard's evaluation charts switch between, the first one by default. */
export const dashboardRanges: readonly { value: EvaluationRange; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];

/** The `range` of a dashboard address: `24h` or `7d`, and `24h` for anything else. */
export function dashboardRange(value: string | null): EvaluationRange {
  return dashboardRanges.find((range) => range.value === value)?.value ?? '24h';
}

/** A flag as the dashboard needs it to name its evaluations. */
export interface ChartFlag {
  key: string;
  name: string;
  variations: readonly unknown[];
  archived: boolean;
}

/** The evaluations of one bucket: per variation, in the chart's order, and in all. */
export interface ChartBucket {
  start: Date;
  counts: number[];
  total: number;
}

/** A flag's evaluations over the range: per variation, in the chart's order, and in all. */
export interface ChartFlagTotal {
  key: string;
  /** Its name, or its key when the flag list doesn't have it yet (created since it was fetched). */
  name: string;
  archived: boolean;
  counts: number[];
  total: number;
}

/** A flag's evaluations in one environment over the range, for the table view. */
export interface ChartRow {
  flagKey: string;
  flagName: string;
  environmentKey: string;
  counts: number[];
  total: number;
}

export interface EvaluationChart {
  /** The variations the counts are stacked by, as their values: `true` then `false`, then any other. */
  variations: string[];
  /** Every bucket of the range, empty ones included, oldest first. */
  buckets: ChartBucket[];
  /** The flags evaluated in the range, most evaluated first. */
  flags: ChartFlagTotal[];
  /** Each flag's evaluations per environment, by flag key then environment key. */
  rows: ChartRow[];
  /** All evaluations of the range. */
  total: number;
}

/** The variations of every flag in V1, by index (ADR 0002). */
const booleanVariations: readonly unknown[] = [true, false];

/**
 * Lays the evaluation series out for the dashboard's charts: summed by bucket (every bucket of the range, so the
 * time axis has no gaps) and by flag, each split by variation. Variations are grouped by value rather than index, so
 * that `true` of every flag stacks together.
 */
export function evaluationChart(series: EvaluationSeries, flags: readonly ChartFlag[]): EvaluationChart {
  const byKey = new Map(flags.map((flag) => [flag.key, flag]));
  const variationValue = (flagKey: string, index: number) => {
    // Counts go with their flag when it is deleted, so a flag missing from the list was created since it was
    // fetched: it has the variations every flag has in V1 (ADR 0002).
    const variations = byKey.get(flagKey)?.variations ?? booleanVariations;
    return index < variations.length ? String(variations[index]) : `variation ${index}`;
  };

  // The boolean variations come first in every chart, so that each keeps its place and color.
  const variations = booleanVariations.map(String);
  for (const count of series.counts) {
    const value = variationValue(count.flagKey, count.variationIndex);
    if (!variations.includes(value)) variations.push(value);
  }
  const empty = () => variations.map(() => 0);

  const bucketMs = series.bucketMinutes * 60_000;
  const from = Date.parse(series.from);
  const bucketCount = Math.round((Date.parse(series.to) - from) / bucketMs);
  const buckets: ChartBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
    start: new Date(from + index * bucketMs),
    counts: empty(),
    total: 0,
  }));
  const flagTotals = new Map<string, ChartFlagTotal>();
  const rows = new Map<string, ChartRow>();
  let total = 0;

  for (const count of series.counts) {
    const slot = variations.indexOf(variationValue(count.flagKey, count.variationIndex));
    const flag = byKey.get(count.flagKey);
    const name = flag?.name ?? count.flagKey;

    const bucket = buckets[Math.floor((Date.parse(count.start) - from) / bucketMs)];
    if (bucket) add(bucket, slot, count.count);

    let flagTotal = flagTotals.get(count.flagKey);
    if (!flagTotal) {
      flagTotal = {
        key: count.flagKey,
        name,
        archived: flag?.archived ?? false,
        counts: empty(),
        total: 0,
      };
      flagTotals.set(count.flagKey, flagTotal);
    }
    add(flagTotal, slot, count.count);

    const rowKey = `${count.flagKey} ${count.environmentKey}`;
    let row = rows.get(rowKey);
    if (!row) {
      row = { flagKey: count.flagKey, flagName: name, environmentKey: count.environmentKey, counts: empty(), total: 0 };
      rows.set(rowKey, row);
    }
    add(row, slot, count.count);
    total += count.count;
  }

  return {
    variations,
    buckets,
    flags: [...flagTotals.values()].sort((a, b) => b.total - a.total || compare(a.key, b.key)),
    rows: [...rows.values()].sort(
      (a, b) => compare(a.flagKey, b.flagKey) || compare(a.environmentKey, b.environmentKey),
    ),
    total,
  };
}

function add(target: { counts: number[]; total: number }, slot: number, count: number): void {
  target.counts[slot] = (target.counts[slot] ?? 0) + count;
  target.total += count;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** About how many steps a value axis has. */
const tickSteps = 4;

/**
 * The ticks of a value axis from 0 to just past `max`, a round step apart (1, 2 or 5 times a power of ten), about
 * four of them. With nothing to show, the axis still goes from 0 to 1.
 */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / tickSteps;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((multiple) => multiple * power).find((candidate) => candidate >= rough) ?? 10 * power;
  // Counts are whole numbers, so the step is too.
  const whole = Math.max(1, step);
  const top = Math.ceil(max / whole) * whole;
  return Array.from({ length: Math.round(top / whole) + 1 }, (_, index) => index * whole);
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

/** A count as charts label it: in full below 1,000, then compactly (1.3K, 12.9M). */
export function compactCount(count: number): string {
  return count < 1000 ? String(count) : compact.format(count);
}

/** A count in full, with separators: 12,900. */
export function fullCount(count: number): string {
  return full.format(count);
}

const hourFormat = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const bucketFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** The time axis label of a bucket, in UTC: its hour for the 24-hour chart, its day for the 7-day one. */
export function axisLabel(start: Date, range: EvaluationRange): string {
  return range === '24h' ? hourFormat.format(start) : dayFormat.format(start).replace(/^(\d+) (\w+)$/, '$2 $1');
}

/** Which buckets carry a time axis label: every 6th hour, or each day's first 6-hour bucket. */
export function hasAxisLabel(start: Date, range: EvaluationRange): boolean {
  return range === '24h' ? start.getUTCHours() % 6 === 0 : start.getUTCHours() === 0;
}

/** A bucket's start in full, in UTC, for its tooltip and the table view: "Sun, Nov 15, 06:00". */
export function bucketTime(start: Date): string {
  return bucketFormat.format(start);
}

const dayMs = 24 * 60 * 60_000;

/** How long ago a stale flag was last evaluated, in whole days, or that no evaluation of it is kept. */
export function lastEvaluated(lastEvaluatedAt: string | null, now: Date): string {
  if (lastEvaluatedAt === null) return 'No evaluations in the kept telemetry';
  const days = Math.floor((now.getTime() - Date.parse(lastEvaluatedAt)) / dayMs);
  return `Last evaluated ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Counts per variation in words, for a chart mark's accessible name: "30 true, 12 false". */
export function describeCounts(variations: readonly string[], counts: readonly number[]): string {
  return variations.map((variation, slot) => `${fullCount(counts[slot] ?? 0)} ${variation}`).join(', ');
}

/** The columns of a chart's table view for its variations, then their total. */
export function variationColumns(variations: readonly string[]): { key: string; label: string; align: 'end' }[] {
  return [
    ...variations.map((variation, slot) => ({ key: `v${slot}`, label: variation, align: 'end' as const })),
    { key: 'total', label: 'Total', align: 'end' },
  ];
}

/** The cells of a row of a chart's table view for {@link variationColumns}. */
export function variationCells(counts: readonly number[], total: number): Record<string, string> {
  return {
    ...Object.fromEntries(counts.map((count, slot) => [`v${slot}`, fullCount(count)])),
    total: fullCount(total),
  };
}
