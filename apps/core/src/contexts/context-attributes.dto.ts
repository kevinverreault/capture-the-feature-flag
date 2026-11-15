import { ApiProperty } from '@nestjs/swagger';

/** The types of context attribute values. */
export const contextAttributeTypes = ['string', 'country_code'] as const;
export type ContextAttributeTypeName = (typeof contextAttributeTypes)[number];

/** A named, typed field of a context that rules can test. */
export class ContextAttributeDto {
  @ApiProperty({ description: 'Its name in contexts and rules.', example: 'country' })
  key!: string;

  @ApiProperty({ example: 'Country' })
  name!: string;

  @ApiProperty({
    enum: contextAttributeTypes,
    enumName: 'ContextAttributeType',
    description: '`string`: any non-empty string. `country_code`: an ISO 3166-1 alpha-2 code, compared in uppercase.',
  })
  type!: ContextAttributeTypeName;

  @ApiProperty()
  description!: string;

  @ApiProperty({ description: 'Built-in attributes cannot be edited. In V1 every attribute is built in.' })
  builtIn!: boolean;
}
