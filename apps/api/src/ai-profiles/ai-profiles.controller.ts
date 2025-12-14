import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AIProfilesService } from './ai-profiles.service.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateAIProfileInputSchema, UpdateAIProfileInputSchema } from '@aixsss/shared';

@UseGuards(JwtAuthGuard)
@Controller('ai-profiles')
export class AIProfilesController {
  constructor(@Inject(AIProfilesService) private readonly profiles: AIProfilesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.profiles.list(user.teamId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateAIProfileInputSchema, body);
    return this.profiles.create(user.teamId, input);
  }

  @Patch(':profileId')
  update(@CurrentUser() user: AuthUser, @Param('profileId') profileId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateAIProfileInputSchema, body);
    return this.profiles.update(user.teamId, profileId, input);
  }

  @Delete(':profileId')
  remove(@CurrentUser() user: AuthUser, @Param('profileId') profileId: string) {
    return this.profiles.remove(user.teamId, profileId);
  }
}


