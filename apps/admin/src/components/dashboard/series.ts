/** The color of the chart series at `slot`: the first two (true, false) have their own, any other is gray. */
export function seriesColor(slot: number): string {
  return slot < 2 ? `hsl(var(--chart-series-${slot + 1}))` : 'hsl(var(--chart-series-other))';
}
