import type { AllFlags, EvaluationReason } from '@ctff/birdwatch-contract';

/** The admin app the flag inspector links to, and the project and environment Birdwatch evaluates in there. */
export interface AdminApp {
  /** The admin app's address as a browser reaches it (Core's), or `''` when unknown: then there are no links. */
  url: string;
  projectKey: string;
  environmentKey: string;
}

/**
 * The admin app the flag inspector links to, from CTFF_ADMIN_URL (without trailing slashes; none means no links),
 * CTFF_PROJECT (`birdwatch`) and CTFF_ENVIRONMENT (`development`), which should name birdwatch-api's environment.
 */
export function adminAppFromEnv(env: Record<string, string | undefined>): AdminApp {
  return {
    url: env['CTFF_ADMIN_URL']?.trim().replace(/\/+$/, '') ?? '',
    projectKey: env['CTFF_PROJECT']?.trim() || 'birdwatch',
    environmentKey: env['CTFF_ENVIRONMENT']?.trim() || 'development',
  };
}

/** One row of the flag inspector. */
export interface InspectedFlag {
  key: string;
  /** The served variation, or `null` when the flag served none (an error). */
  value: boolean | null;
  reason: string;
  reasonKind: EvaluationReason['kind'];
}

/** An evaluation reason as the Evaluator names it, with the matching rule (from 1) or the kind of error. */
export function reasonLabel(reason: EvaluationReason): string {
  switch (reason.kind) {
    case 'RULE_MATCH':
      return `RULE_MATCH (rule ${reason.ruleIndex + 1})`;
    case 'ERROR':
      return `ERROR (${reason.errorKind})`;
    default:
      return reason.kind;
  }
}

/** The page of a flag in the admin app, on the tab of the environment Birdwatch evaluates in. */
export function adminFlagUrl(admin: AdminApp, flagKey: string): string | undefined {
  if (!admin.url) return undefined;
  const segment = encodeURIComponent;
  const query = new URLSearchParams({ environment: admin.environmentKey }).toString();
  return `${admin.url}/projects/${segment(admin.projectKey)}/flags/${segment(flagKey)}?${query}`;
}

/** Every flag the birder's flags were evaluated for, by flag key. */
export function inspectedFlags(flags: AllFlags): InspectedFlag[] {
  return Object.entries(flags.details)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, detail]) => ({
      key,
      value: detail.value,
      reason: reasonLabel(detail.reason),
      reasonKind: detail.reason.kind,
    }));
}
