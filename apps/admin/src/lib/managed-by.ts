import type { components } from '@ctff/core-api-client';

/** The "managed by" marker of a flag: the tool managing it as code, or null when it is managed by hand. */
export type ManagedBy = components['schemas']['FlagDto']['managedBy'];

const toolNames: Record<NonNullable<ManagedBy>, string> = {
  terraform: 'Terraform',
};

/** The name of the tool managing a flag as code, such as "Terraform", or undefined when none does. */
export function managingTool(managedBy: ManagedBy | undefined): string | undefined {
  return managedBy ? toolNames[managedBy] : undefined;
}
