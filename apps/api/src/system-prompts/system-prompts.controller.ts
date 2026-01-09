import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { UpdateSystemPromptInputSchema } from '@aixsss/shared';
import { SystemPromptsService } from './system-prompts.service.js';

@UseGuards(JwtAuthGuard)
@Controller('system-prompts')
export class SystemPromptsController {
  constructor(@Inject(SystemPromptsService) private readonly prompts: SystemPromptsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prompts.list(user.teamId);
  }

  @Put(':key')
  update(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateSystemPromptInputSchema, body);
    return this.prompts.update(user.teamId, key, input);
  }
}

