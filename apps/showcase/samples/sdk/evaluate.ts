import { createClient, type Context } from '@ctff/sdk';

// One client per environment: the Evaluator to ask, and the environment's SDK key (copy it from the admin app).
const flags = createClient({
  evaluatorUrl: 'http://localhost:3001',
  sdkKey: 'ctff-env-…',
  timeoutMs: 500, // optional; this is the default
});

// The context: who the flag is evaluated for. Both attributes are optional; country is ISO 3166-1 alpha-2.
const context: Context = { user_id: 'alice', country: 'CA' };

export async function showRareBirdAlerts(): Promise<boolean> {
  // The served variation, or the fallback value (here `false`) when the flag can't be evaluated:
  // unknown or archived flag, Evaluator unreachable or slower than the timeout. It never throws.
  return flags.variation('rare-bird-alerts', context, false);
}

export async function explainRareBirdAlerts(): Promise<string> {
  // The same evaluation, with the variation index and the evaluation reason.
  const detail = await flags.variationDetail('rare-bird-alerts', context, false);
  switch (detail.reason.kind) {
    case 'RULE_MATCH':
      return `rule ${detail.reason.ruleIndex} matched, serving ${detail.value}`;
    case 'DEFAULT':
      return `no target or rule matched: the default variation, ${detail.value}`;
    case 'ERROR':
      return `the fallback value, because of ${detail.reason.errorKind}`;
    default:
      return `${detail.reason.kind}: ${detail.value}`;
  }
}

export async function homePageFlags(): Promise<{ alerts: boolean; photoId: boolean }> {
  // Every flag of the environment in one request (a bulk evaluation). There is no fallback value to pass:
  // a flag missing from `values` falls back on your side.
  const all = await flags.allFlags(context);
  return {
    alerts: all.values['rare-bird-alerts'] ?? false,
    photoId: all.values['photo-id-beta'] ?? false,
  };
}
