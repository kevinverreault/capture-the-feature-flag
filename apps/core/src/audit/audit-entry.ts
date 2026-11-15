import type { Variation } from '@ctff/evaluation';
import type { AuditAction, Environment, Flag, Prisma, Project, Targeting } from '../generated/prisma/client.js';
import { toTargetingSnapshot } from '../targeting/targeting-snapshot.js';

/** The state of an audit entry's target, as recorded before and after the change. */
export type AuditState = Prisma.InputJsonObject;

/** What a change was about, for {@link recordAudit}. */
export type AuditTarget =
  | { type: 'project'; project: Project }
  | { type: 'environment'; project: Project; environment: Environment }
  | { type: 'flag'; project: Project; flag: Flag }
  | { type: 'targeting'; project: Project; flag: Flag; environment: Environment; targeting: Targeting };

/** One change to record: what was done, by whom, and the target's state around it. */
export interface AuditChange {
  action: AuditAction;
  actor: string;
  /** The target before the change; absent for a create. */
  before?: AuditState | undefined;
  /** The target after the change; absent for a delete. */
  after?: AuditState | undefined;
}

/**
 * Records the audit entry of one change, in the transaction that makes the change, so a change is never saved
 * without its entry (or the other way round).
 */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  target: AuditTarget,
  change: AuditChange,
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      projectId: target.project.id,
      projectKey: target.project.key,
      targetType: target.type,
      targetId: targetId(target),
      flagId: 'flag' in target ? target.flag.id : null,
      flagKey: 'flag' in target ? target.flag.key : null,
      environmentKey: 'environment' in target ? target.environment.key : null,
      action: change.action,
      actor: change.actor,
      before: change.before,
      after: change.after,
    },
  });
}

function targetId(target: AuditTarget): string {
  switch (target.type) {
    case 'project':
      return target.project.id;
    case 'environment':
      return target.environment.id;
    case 'flag':
      return target.flag.id;
    case 'targeting':
      return target.targeting.id;
  }
}

/** The audited state of a project: what an admin can change, plus its key. */
export function projectState(project: Project): AuditState {
  return { key: project.key, name: project.name };
}

/** The audited state of an environment: its key, name and SDK key (which identifies it, and is not a secret in V1). */
export function environmentState(environment: Environment): AuditState {
  return { key: environment.key, name: environment.name, sdkKey: environment.sdkKey };
}

/** The audited state of a flag: everything but its timestamps. */
export function flagState(flag: Flag): AuditState {
  return {
    key: flag.key,
    name: flag.name,
    description: flag.description,
    tags: flag.tags,
    variations: flag.variations as Variation[],
    managedBy: flag.managedBy,
    version: flag.version,
  };
}

/** The audited state of targeting, in the shape of the shared snapshot type. */
export function targetingState(targeting: Targeting): AuditState {
  return toTargetingSnapshot(targeting) as unknown as AuditState;
}
