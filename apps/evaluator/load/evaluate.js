// k6 load script: the latency of single evaluations against a running Evaluator. Manual, not part of CI.
// The target is a p99 under 10 ms inside the cluster. See ../README.md#load-testing for how to run it.
//
// Environment:
//   EVALUATOR_URL  The Evaluator (default http://localhost:3001).
//   CORE_URL       Core (default http://localhost:3000). Unless SDK_KEY is set, setup() makes sure Core has the
//                  project PROJECT_KEY with a `production` environment and the flag FLAG_KEY, creating whatever is
//                  missing, switches the flag's targeting on, and waits for the Evaluator to serve it. Every run
//                  reuses them; delete the project in the admin app (or DELETE /api/v1/projects/load-test) to drop it.
//   PROJECT_KEY    The project setup() uses (default load-test).
//   SDK_KEY        Evaluate in an existing environment instead, with no setup.
//   FLAG_KEY       The flag to evaluate (default load-test-flag).
//   VUS            Concurrent virtual users, each sending one evaluation at a time (default 10).
//   DURATION       How long to send evaluations (default 30s).

import { check, fail, sleep } from 'k6';
import http from 'k6/http';

const evaluatorUrl = (__ENV.EVALUATOR_URL || 'http://localhost:3001').replace(/\/+$/, '');
const coreUrl = (__ENV.CORE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const projectKey = __ENV.PROJECT_KEY || 'load-test';
const flagKey = __ENV.FLAG_KEY || 'load-test-flag';
const countries = ['CA', 'US', 'FR', 'GB', 'MX', 'BR', 'JP', 'AU'];

export const options = {
  scenarios: {
    evaluate: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '30s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // Only the evaluations count, not setup's calls to Core.
    'http_req_duration{name:evaluate}': ['p(99)<10'],
    'checks{name:evaluate}': ['rate>0.999'],
  },
};

/** Calls Core's API and returns the JSON answer, or `null` for a `404` when `orNotFound` is set. */
function core(method, path, body, { orNotFound = false } = {}) {
  const response = http.request(method, `${coreUrl}/api/v1${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    tags: { name: 'setup' },
  });
  if (orNotFound && response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) {
    fail(`${method} ${path} answered ${response.status}: ${response.body}`);
  }
  return response.json();
}

function evaluate(sdkKey, context, name) {
  return http.post(`${evaluatorUrl}/api/v1/evaluate/${flagKey}`, JSON.stringify({ context }), {
    headers: { 'content-type': 'application/json', 'x-ctff-sdk-key': sdkKey },
    tags: { name },
  });
}

export function setup() {
  if (__ENV.SDK_KEY) return { sdkKey: __ENV.SDK_KEY };

  const project = `/projects/${projectKey}`;
  const existing = (path) => core('GET', path, undefined, { orNotFound: true });
  if (!existing(project)) core('POST', '/projects', { key: projectKey, name: 'Load test' });
  const { sdkKey } =
    existing(`${project}/environments/production`) ??
    core('POST', `${project}/environments`, { key: 'production', name: 'Production' });
  if (!existing(`${project}/flags/${flagKey}`)) {
    core('POST', `${project}/flags`, { key: flagKey, name: 'Load test flag' });
  }
  const targetingPath = `${project}/flags/${flagKey}/targeting/production`;
  const targeting = core('GET', targetingPath);
  if (!targeting.on) core('PATCH', targetingPath, { version: targeting.version, on: true });

  // The Evaluator serves a new environment, or changed targeting, from its next poll on.
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = evaluate(sdkKey, { user_id: 'setup' }, 'setup');
    if (response.status === 200 && response.json('reason.kind') === 'DEFAULT') return { sdkKey };
    sleep(0.25);
  }
  return fail('The Evaluator did not serve the load test flag with targeting on within 30 seconds');
}

export default function ({ sdkKey }) {
  const context = {
    user_id: `birder-${Math.floor(Math.random() * 10000)}`,
    country: countries[Math.floor(Math.random() * countries.length)],
  };
  const response = evaluate(sdkKey, context, 'evaluate');
  check(response, { evaluated: (r) => r.status === 200 && r.json('reason.kind') !== 'ERROR' }, { name: 'evaluate' });
}
