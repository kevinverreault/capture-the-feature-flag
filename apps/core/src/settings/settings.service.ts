import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Settings } from '../generated/prisma/client.js';
import type { SettingsDto, UpdateSettingsDto } from './settings.dto.js';

/** The single row of install-wide settings, which the migration creates. */
const settingsId = 1;

@Injectable()
export class SettingsService {
  private changed: ((settings: SettingsDto) => Promise<void>) | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sets what to do after every update (the retention job), which the update waits for, so a change has taken
   * effect when it answers. The retention job registers itself, since it reads the settings too.
   */
  onChange(apply: (settings: SettingsDto) => Promise<void>): void {
    this.changed = apply;
  }

  /** Read from the database each time, so every Core replica sees a change at once. */
  async get(): Promise<SettingsDto> {
    return toSettingsDto(await this.prisma.settings.findUniqueOrThrow({ where: { id: settingsId } }));
  }

  async update(change: UpdateSettingsDto): Promise<SettingsDto> {
    const settings = toSettingsDto(await this.prisma.settings.update({ where: { id: settingsId }, data: change }));
    await this.changed?.(settings);
    return settings;
  }
}

function toSettingsDto(row: Settings): SettingsDto {
  return {
    metricRetentionDays: row.metricRetentionDays,
    seenContextRetentionDays: row.seenContextRetentionDays,
    seenContextCap: row.seenContextCap,
    staleFlagThresholdDays: row.staleFlagThresholdDays,
  };
}
