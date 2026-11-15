import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ContextAttributeDto } from './context-attributes.dto.js';

/** The context attributes, stored as data (the migration creates the built-in ones). */
@Injectable()
export class ContextAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ContextAttributeDto[]> {
    const rows = await this.prisma.contextAttribute.findMany({ orderBy: [{ position: 'asc' }, { key: 'asc' }] });
    return rows.map(({ key, name, type, description, builtIn }) => ({ key, name, type, description, builtIn }));
  }
}
