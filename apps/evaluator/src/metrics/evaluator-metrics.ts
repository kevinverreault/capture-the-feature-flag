import type { EvaluationReason, EvaluatorError } from '@ctff/evaluation';
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import type { EnvironmentIdentity, SnapshotPoller } from '../snapshots/snapshot-poller.js';

/**
 * How an evaluation request ended, the `result` label: the evaluation reason kind; the Evaluator error it was
 * answered with; `MISSING_SDK_KEY`; `ABORTED` when the client hung up before the answer was sent; or `HTTP_<status>`
 * for any other answer that never reached evaluation, such as a body that isn't JSON.
 */
export type EvaluationRequestResult =
  EvaluationReason['kind'] | 'BULK' | EvaluatorError | 'MISSING_SDK_KEY' | 'ABORTED' | `HTTP_${number}`;

type EnvironmentLabelName = 'project_key' | 'environment_key';

/** The labels of an environment. The SDK key itself never becomes a label, so an unknown one gets empty labels. */
function environmentLabels(environment: EnvironmentIdentity | undefined): Record<EnvironmentLabelName, string> {
  return { project_key: environment?.projectKey ?? '', environment_key: environment?.environmentKey ?? '' };
}

/**
 * The Evaluator's Prometheus metrics, served at `/metrics`: evaluation requests per environment and result, their
 * latency, and the age of every snapshot held. They live in their own registry rather than prom-client's global
 * one, so each app instance has its own.
 */
export class EvaluatorMetrics {
  readonly registry = new Registry();
  private readonly requests: Counter<EnvironmentLabelName | 'result'>;
  private readonly duration: Histogram<EnvironmentLabelName>;

  constructor(snapshots: SnapshotPoller) {
    this.requests = new Counter({
      name: 'ctff_evaluator_evaluation_requests_total',
      help: 'Evaluation requests answered, per environment and result (an evaluation reason, or why there was none)',
      labelNames: ['project_key', 'environment_key', 'result'],
      registers: [this.registry],
    });
    this.duration = new Histogram({
      name: 'ctff_evaluator_evaluation_duration_seconds',
      help: 'Time from receiving an evaluation request to finishing its response (or the client hanging up)',
      labelNames: ['project_key', 'environment_key'],
      // Fine-grained under 10 ms, the p99 target for single evaluations.
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });
    new Gauge<EnvironmentLabelName>({
      name: 'ctff_evaluator_snapshot_age_seconds',
      help: "Time since Core last confirmed the environment's snapshot as current (a 200 or a 304)",
      labelNames: ['project_key', 'environment_key'],
      registers: [this.registry],
      collect() {
        this.reset();
        const now = Date.now();
        for (const confirmation of snapshots.snapshotConfirmations()) {
          this.set(environmentLabels(confirmation), Math.max(0, now - confirmation.confirmedAt) / 1000);
        }
      },
    });
  }

  /**
   * Adds prom-client's default `process_*` and `nodejs_*` metrics (CPU, memory, event loop lag, garbage
   * collection) to this registry. They are process-wide: this starts timers and a garbage collection observer that
   * last as long as the process, so call it once per process, for the app that serves `/metrics`.
   */
  collectProcessMetrics(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  observeEvaluation(
    environment: EnvironmentIdentity | undefined,
    result: EvaluationRequestResult,
    durationSeconds: number,
  ): void {
    const labels = environmentLabels(environment);
    this.requests.inc({ ...labels, result });
    this.duration.observe(labels, durationSeconds);
  }
}
