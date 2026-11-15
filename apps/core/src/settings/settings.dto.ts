import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { IsOmittable } from '../common/keys.js';

/** The bounds of each setting, which the API enforces (and publishes in the OpenAPI document). */
export const settingsBounds = {
  metricRetentionDays: { min: 1, max: 3650 },
  seenContextRetentionDays: { min: 1, max: 3650 },
  seenContextCap: { min: 1, max: 100_000 },
  staleFlagThresholdDays: { min: 1, max: 3650 },
} as const;

type SettingName = keyof typeof settingsBounds;

const descriptions: Record<SettingName, string> = {
  metricRetentionDays: 'How many days evaluation count buckets are kept.',
  seenContextRetentionDays: 'How many days a seen context is kept after it was last seen.',
  seenContextCap: 'How many seen contexts are kept per environment: the most recently seen.',
  staleFlagThresholdDays: 'After how many days without evaluations in any environment a flag counts as stale.',
};

function Setting(name: SettingName, { optional }: { optional: boolean }): PropertyDecorator {
  const { min, max } = settingsBounds[name];
  return applyDecorators(
    ApiProperty({ description: descriptions[name], minimum: min, maximum: max, type: 'integer', required: !optional }),
    ...(optional ? [IsOmittable()] : []),
    IsInt({ message: `${name} must be a whole number` }),
    Min(min),
    Max(max),
  );
}

/** The install-wide telemetry settings. Changes take effect without a restart. */
export class SettingsDto {
  @Setting('metricRetentionDays', { optional: false })
  metricRetentionDays!: number;

  @Setting('seenContextRetentionDays', { optional: false })
  seenContextRetentionDays!: number;

  @Setting('seenContextCap', { optional: false })
  seenContextCap!: number;

  @Setting('staleFlagThresholdDays', { optional: false })
  staleFlagThresholdDays!: number;
}

/** A change to some settings; the others stay as they are. */
export class UpdateSettingsDto {
  @Setting('metricRetentionDays', { optional: true })
  metricRetentionDays?: number;

  @Setting('seenContextRetentionDays', { optional: true })
  seenContextRetentionDays?: number;

  @Setting('seenContextCap', { optional: true })
  seenContextCap?: number;

  @Setting('staleFlagThresholdDays', { optional: true })
  staleFlagThresholdDays?: number;
}
