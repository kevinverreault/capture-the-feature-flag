import { All, Controller, Get, MethodNotAllowedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContextAttributeDto } from './context-attributes.dto.js';
import { ContextAttributesService } from './context-attributes.service.js';

const readOnly = () =>
  new MethodNotAllowedException('Context attributes are read-only: the built-in ones cannot be edited');

/** The context attributes contexts carry and rules test. In V1 they are the built-in ones, which are read-only. */
@ApiTags('context-attributes')
@Controller('context-attributes')
export class ContextAttributesController {
  constructor(private readonly attributes: ContextAttributesService) {}

  /** Every context attribute, built-in ones first. */
  @Get()
  @ApiOkResponse({ type: [ContextAttributeDto] })
  list(): Promise<ContextAttributeDto[]> {
    return this.attributes.list();
  }

  /** Creating an attribute: refused with 405, as V1 has no custom attributes. */
  @All()
  @ApiExcludeEndpoint()
  create(): never {
    throw readOnly();
  }

  /** Changing or deleting an attribute: refused with 405, as the built-in ones cannot be edited. */
  @All(':key')
  @ApiExcludeEndpoint()
  change(): never {
    throw readOnly();
  }
}
