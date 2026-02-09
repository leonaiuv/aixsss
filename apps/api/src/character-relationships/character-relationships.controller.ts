import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CharacterRelationshipsService } from './character-relationships.service.js';

const CharacterRelationshipInputSchema = z.object({
  fromCharacterId: z.string().min(1),
  toCharacterId: z.string().min(1),
  type: z.string().min(1).max(100),
  label: z.string().max(60).optional(),
  description: z.string().max(2000).optional(),
  intensity: z.number().int().min(1).max(10).optional(),
  arc: z.unknown().optional(),
});

const CharacterRelationshipPatchSchema = CharacterRelationshipInputSchema.partial();

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/character-relationships')
export class CharacterRelationshipsController {
  constructor(
    @Inject(CharacterRelationshipsService)
    private readonly relationships: CharacterRelationshipsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.relationships.list(user.teamId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CharacterRelationshipInputSchema, body);
    return this.relationships.create(user.teamId, projectId, input);
  }

  @Patch(':relationshipId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('relationshipId') relationshipId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(CharacterRelationshipPatchSchema, body);
    return this.relationships.update(user.teamId, projectId, relationshipId, input);
  }

  @Delete(':relationshipId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('relationshipId') relationshipId: string,
  ) {
    return this.relationships.remove(user.teamId, projectId, relationshipId);
  }
}

