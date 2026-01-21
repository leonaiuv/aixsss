import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { JobsService } from './jobs.service.js';

const ChatBodySchema = z.object({
  aiProfileId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(50),
});

const ResponseFormatSchema = z.union([
  z.object({ type: z.literal('json_object') }),
  z.object({
    type: z.literal('json_schema'),
    json_schema: z.object({
      name: z.string().min(1).max(64),
      strict: z.boolean(),
      schema: z.record(z.unknown()),
    }),
  }),
]);

const StructuredTestBodySchema = z.object({
  aiProfileId: z.string().min(1),
  messages: ChatBodySchema.shape.messages,
  responseFormat: ResponseFormatSchema,
  overrideParams: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().positive().optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
      reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
    })
    .optional(),
});

@UseGuards(JwtAuthGuard)
@Controller('llm')
export class LlmController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseOrBadRequest(ChatBodySchema, body);
    return this.jobs.enqueueLlmChat(user.teamId, input.aiProfileId, input.messages);
  }

  @Post('structured-test')
  structuredTest(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseOrBadRequest(StructuredTestBodySchema, body);
    return this.jobs.enqueueLlmStructuredTest(
      user.teamId,
      input.aiProfileId,
      input.messages,
      input.responseFormat,
      input.overrideParams,
    );
  }
}


