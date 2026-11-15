import type { AuditEntry } from '@ctff/core-api-client';

/** One field an audit entry's change touched, as lines of text: before it (absent for a create), after it. */
export interface AuditFieldChange {
  field: string;
  before?: string[];
  after?: string[];
}

const actionVerbs: Record<AuditEntry['action'], string> = {
  create: 'Created',
  update: 'Updated',
  archive: 'Archived',
  restore: 'Restored',
  delete: 'Deleted',
};

/** What an audit entry did to what, in a line: "Updated targeting of kill-switch in production". */
export function auditSummary(entry: AuditEntry): string {
  const verb = actionVerbs[entry.action];
  switch (entry.targetType) {
    case 'project':
      return `${verb} project ${entry.projectKey}`;
    case 'environment':
      return `${verb} environment ${entry.environmentKey ?? ''}`;
    case 'flag':
      return `${verb} flag ${entry.flagKey ?? ''}`;
    case 'targeting':
      return `${verb} targeting of ${entry.flagKey ?? ''} in ${entry.environmentKey ?? ''}`;
  }
}

const fieldLabels: Record<string, string> = {
  sdkKey: 'SDK key',
  managedBy: 'Managed by',
  on: 'Targeting',
  offVariation: 'Off variation',
  defaultVariation: 'Default variation',
  individualTargets: 'Individual targets',
};

/**
 * The fields an audit entry's change touched, in the order the entry lists them: every field of what was created
 * or deleted, and only the fields an update changed. With the flag's `variations`, targeting shows variations by
 * value (`true`), otherwise by index (`variation 0`).
 */
export function auditChanges(entry: AuditEntry, variations?: readonly unknown[]): AuditFieldChange[] {
  const before = entry.before ?? undefined;
  const after = entry.after ?? undefined;
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const format = (field: string, value: unknown) => formatValue(field, value, variations);
  return fields.flatMap((field) => {
    const old = before?.[field];
    const now = after?.[field];
    if (before && after && JSON.stringify(old) === JSON.stringify(now)) return [];
    return [
      {
        field: fieldLabels[field] ?? sentenceCase(field),
        ...(before && field in before ? { before: format(field, old) } : {}),
        ...(after && field in after ? { after: format(field, now) } : {}),
      },
    ];
  });
}

function formatValue(field: string, value: unknown, variations: readonly unknown[] | undefined): string[] {
  const variation = (index: unknown) =>
    typeof index === 'number' && variations && index in variations
      ? String(variations[index])
      : `variation ${String(index)}`;

  if (field === 'on' && typeof value === 'boolean') return [value ? 'on' : 'off'];
  if (field === 'offVariation' || field === 'defaultVariation') return [variation(value)];
  if (value === null || value === undefined) return ['(none)'];
  if (value === '') return ['(empty)'];
  if (Array.isArray(value)) {
    if (value.length === 0) return ['(none)'];
    if (field === 'individualTargets' && value.every(isIndividualTarget)) {
      return value.map((target) => `${target.userIds.join(', ')} → ${variation(target.variation)}`);
    }
    if (field === 'rules' && value.every(isRule)) {
      return value.map(
        (rule, index) =>
          `${index + 1}. ${rule.attribute} ${rule.operator.replace(/_/g, ' ')} ${rule.values.join(', ')} → ${variation(rule.variation)}`,
      );
    }
    if (value.every((item) => typeof item !== 'object' || item === null)) return [value.map(String).join(', ')];
    return value.map((item) => JSON.stringify(item));
  }
  if (typeof value === 'object') return [JSON.stringify(value)];
  return [String(value)];
}

function isIndividualTarget(value: unknown): value is { userIds: string[]; variation: number } {
  const target = value as { userIds?: unknown };
  return typeof value === 'object' && value !== null && Array.isArray(target.userIds);
}

function isRule(value: unknown): value is { attribute: string; operator: string; values: string[]; variation: number } {
  const rule = value as { attribute?: unknown; operator?: unknown; values?: unknown };
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof rule.attribute === 'string' &&
    typeof rule.operator === 'string' &&
    Array.isArray(rule.values)
  );
}

/** `defaultVariation` → `Default variation`. */
function sentenceCase(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How many audit entries a page of the admin app shows at a time. */
export const auditPageSize = 25;

/** The `cursor` of an audit log address: a positive integer, or undefined for the first (newest) page. */
export function pageCursor(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : undefined;
}

/** The variations of each flag by key, for {@link auditChanges}. */
export function flagVariations(
  flags: readonly { key: string; variations: readonly unknown[] }[],
): Map<string, readonly unknown[]> {
  return new Map(flags.map((flag) => [flag.key, flag.variations]));
}
