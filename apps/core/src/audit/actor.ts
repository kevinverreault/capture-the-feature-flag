import { applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';

export const actorHeader = 'X-CTFF-Actor';
/** The actor of a change whose request doesn't say who made it. */
export const anonymousActor = 'anonymous';
const actorMaxLength = 200;

/**
 * Who a request's changes are attributed to, from its `X-CTFF-Actor` header: the admin's display name, `terraform`
 * from the Terraform provider, or {@link anonymousActor} when absent or blank. Header values can't carry most
 * non-ASCII text, so a percent-encoded (UTF-8) value is decoded; a value that isn't valid percent-encoding is
 * taken as it is.
 */
export function actorFrom(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === undefined) return anonymousActor;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Not percent-encoded: keep it as sent.
  }
  const actor = decoded.replace(/\s+/g, ' ').trim().slice(0, actorMaxLength).trim();
  return actor === '' ? anonymousActor : actor;
}

/** Injects the actor of the request (see {@link actorFrom}) into a controller method. */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  actorFrom(context.switchToHttp().getRequest<Request>().headers['x-ctff-actor']),
);

/** Documents that an endpoint records an audit entry attributed to the `X-CTFF-Actor` header. */
export function RecordsAudit(): MethodDecorator {
  return applyDecorators(
    ApiHeader({
      name: actorHeader,
      required: false,
      description:
        'Who makes the change, recorded in its audit entry: a display name (percent-encoded UTF-8 for non-ASCII ' +
        `text), or "terraform". Defaults to "${anonymousActor}".`,
    }),
  );
}
