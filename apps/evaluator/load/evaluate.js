// k6 load script: the latency of single evaluations against a running Evaluator. Manual, not part of CI.
// The target is a p99 under 10 ms inside the cluster. See ../README.md#load-testing for how to run it.
//
// Environment:
//   EVALUATOR_URL  The Evaluator (default http://localhost:3001).
//   CORE_URL       Core (default http://localhost:3000). Unless SDK_KEY is set, setup() creates a project with an
//                  environment and a flag through Core's API, switches its targeting on, and waits for the
//                  Evaluator to serve it.
//   SDK_KEY        Evaluate in an existing environment instead, with no setup.
//   FLAG_KEY       The flag to evaluate (default load-test-flag).
//   VUS            Concurrent virtual users, each sending one evaluation at a time (default 10).
//   DURATION       How long to send evaluations (default 30s).

import { check, fail, sleep } from 'k6';
import http from 'k6/http';

const evaluatorUrl = (__ENV.EVALUATOR_URL || 'http://localhost:3001').replace(/\/+$/, '');
const coreUrl = (__ENV.CORE_URL || 'http://localhost:3000').replace(/\/+$/, '');
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

function core(method, path, body) {
  const response = http.request(method, `${coreUrl}/api/v1${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    tags: { name: 'setup' },
  });
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

  const projectKey = `load-test-${Date.now()}`;
  core('POST', '/projects', { key: projectKey, name: 'Load test' });
  const { sdkKey } = core('POST', `/projects/${projectKey}/environments`, { key: 'production', name: 'Production' });
  core('POST', `/projects/${projectKey}/flags`, { key: flagKey, name: 'Load test flag' });
  const targetingPath = `/projects/${projectKey}/flags/${flagKey}/targeting/production`;
  core('PATCH', targetingPath, { version: core('GET', targetingPath).version, on: true });

  // The Evaluator serves the new environment from its next poll on.
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = evaluate(sdkKey, { user_id: 'setup' }, 'setup');
    if (response.status === 200 && response.json('reason.kind') === 'DEFAULT') return { sdkKey };
    sleep(0.25);
  }
  return fail('The Evaluator did not serve the load test flag with targeting on within 30 seconds');
}

export default function ({ sdkKey }) {
  const context = {
    user_id: `birder-${Math.floor(Math.random() * 10_000)}`,
    country: countries[Math.floor(Math.random() * countries.length)],
  };
  const response = evaluate(sdkKey, context, 'evaluate');
  check(response, { evaluated: (r) => r.status === 200 && r.json('reason.kind') !== 'ERROR' }, { name: 'evaluate' });
}
