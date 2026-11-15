import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SettingsDto, UpdateSettingsDto } from './settings.dto.js';
import { SettingsService } from './settings.service.js';

/** The install-wide telemetry settings: retention, the seen-context cap and the stale-flag threshold. */
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }

  /** Changes the settings sent and leaves the others. They take effect at once, without a restart. */
  @Patch()
  @ApiOkResponse({ type: SettingsDto })
  update(@Body() body: UpdateSettingsDto): Promise<SettingsDto> {
    return this.settings.update(body);
  }
}
