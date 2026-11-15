import { Controller, Delete, Get, MethodNotAllowedException, Patch, Post, Put } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ContextAttributeDto } from './context-attributes.dto.js';
import { ContextAttributesService } from './context-attributes.service.js';

const builtInReadOnly = () =>
  new MethodNotAllowedException('Context attributes are read-only: the built-in ones cannot be edited');
const noCustomAttributes = () =>
  new MethodNotAllowedException('Context attributes cannot be created: V1 has only the built-in ones');

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
  @Post()
  @ApiExcludeEndpoint()
  refuseCreate(): never {
    throw noCustomAttributes();
  }

  /** Replacing an attribute: refused with 405, as the built-in ones cannot be edited. */
  @Put(':key')
  @ApiExcludeEndpoint()
  refuseReplace(): never {
    throw builtInReadOnly();
  }

  /** Changing an attribute: refused with 405, as the built-in ones cannot be edited. */
  @Patch(':key')
  @ApiExcludeEndpoint()
  refuseChange(): never {
    throw builtInReadOnly();
  }

  /** Deleting an attribute: refused with 405, as the built-in ones cannot be edited. */
  @Delete(':key')
  @ApiExcludeEndpoint()
  refuseDelete(): never {
    throw builtInReadOnly();
  }
}
