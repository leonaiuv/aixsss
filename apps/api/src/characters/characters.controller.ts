import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CharactersService } from './characters.service.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateCharacterInputSchema, UpdateCharacterInputSchema } from '@aixsss/shared';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/characters')
export class CharactersController {
  constructor(@Inject(CharactersService) private readonly characters: CharactersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.characters.list(user.teamId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateCharacterInputSchema, body);
    return this.characters.create(user.teamId, projectId, input);
  }

  @Patch(':characterId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdateCharacterInputSchema, body);
    return this.characters.update(user.teamId, projectId, characterId, input);
  }

  @Delete(':characterId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
  ) {
    return this.characters.remove(user.teamId, projectId, characterId);
  }
}


