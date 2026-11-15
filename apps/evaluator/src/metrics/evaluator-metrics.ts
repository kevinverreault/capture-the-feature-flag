import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import type { SnapshotPoller } from '../snapshots/snapshot-poller.js';

/** The environment an evaluation request was for, and its result, as metric labels. */
export interface EvaluationLabels {
  /** Empty when the SDK key names no environment, since the SDK key itself never becomes a label. */
  project_key: string;
  environment_key: string;
  /** The evaluation reason kind (`DEFAULT`, `FLAG_NOT_FOUND`, …), or why the request got no evaluation. */
  result: string;
}

type EnvironmentLabel = 'project_key' | 'environment_key';

/**
 * The Evaluator's Prometheus metrics, served at `/metrics`: evaluation requests per environment and result, their
 * latency, the age of every snapshot held, plus prom-client's default process and Node.js metrics. They live in
 * their own registry rather than prom-client's global one, so each app instance has its own.
 */
export class EvaluatorMetrics {
  readonly registry = new Registry();
  private readonly requests: Counter<keyof EvaluationLabels>;
  private readonly duration: Histogram<EnvironmentLabel>;

  constructor(snapshots: SnapshotPoller) {
    collectDefaultMetrics({ register: this.registry });
    this.requests = new Counter({
      name: 'ctff_evaluator_evaluation_requests_total',
      help: 'Evaluation requests answered, per environment and result (an evaluation reason, or an error)',
      labelNames: ['project_key', 'environment_key', 'result'],
      registers: [this.registry],
    });
    this.duration = new Histogram({
      name: 'ctff_evaluator_evaluation_duration_seconds',
      help: 'Time from receiving an evaluation request to finishing its response, per environment',
      labelNames: ['project_key', 'environment_key'],
      // Fine-grained under 10 ms, the p99 target for single evaluations.
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });
    new Gauge<EnvironmentLabel>({
      name: 'ctff_evaluator_snapshot_age_seconds',
      help: "Time since Core last confirmed the environment's snapshot as current (a 200 or a 304)",
      labelNames: ['project_key', 'environment_key'],
      registers: [this.registry],
      collect() {
        this.reset();
        const now = Date.now();
        for (const held of snapshots.heldSnapshots()) {
          const labels = { project_key: held.projectKey, environment_key: held.environmentKey };
          this.set(labels, Math.max(0, now - held.checkedAt) / 1000);
        }
      },
    });
  }

  observeEvaluation(labels: EvaluationLabels, durationSeconds: number): void {
    this.requests.inc(labels);
    this.duration.observe(
      { project_key: labels.project_key, environment_key: labels.environment_key },
      durationSeconds,
    );
  }
}
