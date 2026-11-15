import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Settings } from '../generated/prisma/client.js';
import type { SettingsDto, UpdateSettingsDto } from './settings.dto.js';

/** The single row of install-wide settings, which the migration creates. */
const settingsId = 1;

@Injectable()
export class SettingsService {
  private readonly listeners: ((settings: SettingsDto) => Promise<void>)[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /** Calls `listener` after every update, which waits for it, so a change has taken effect when it answers. */
  onChange(listener: (settings: SettingsDto) => Promise<void>): void {
    this.listeners.push(listener);
  }

  /** Read from the database each time, so every Core replica sees a change at once. */
  async get(): Promise<SettingsDto> {
    return toDto(await this.prisma.settings.findUniqueOrThrow({ where: { id: settingsId } }));
  }

  async update(change: UpdateSettingsDto): Promise<SettingsDto> {
    const settings = toDto(await this.prisma.settings.update({ where: { id: settingsId }, data: change }));
    for (const listener of this.listeners) await listener(settings);
    return settings;
  }
}

function toDto(row: Settings): SettingsDto {
  return {
    metricRetentionDays: row.metricRetentionDays,
    seenContextRetentionDays: row.seenContextRetentionDays,
    seenContextCap: row.seenContextCap,
    staleFlagThresholdDays: row.staleFlagThresholdDays,
  };
}
