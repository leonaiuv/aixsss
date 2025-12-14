import { BadRequestException } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';

export function parseOrBadRequest<S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}


