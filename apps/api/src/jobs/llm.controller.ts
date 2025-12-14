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

@UseGuards(JwtAuthGuard)
@Controller('llm')
export class LlmController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseOrBadRequest(ChatBodySchema, body);
    return this.jobs.enqueueLlmChat(user.teamId, input.aiProfileId, input.messages);
  }
}



