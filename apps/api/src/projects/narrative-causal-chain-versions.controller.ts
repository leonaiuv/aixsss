import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { NarrativeCausalChainVersionsService } from './narrative-causal-chain-versions.service.js';

const CreateSnapshotSchema = z
  .object({
    label: z.string().max(200).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  })
  .optional()
  .default({});

const RestoreSchema = z
  .object({
    label: z.string().max(200).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  })
  .optional()
  .default({});

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/narrative-causal-chain/versions')
export class NarrativeCausalChainVersionsController {
  constructor(
    @Inject(NarrativeCausalChainVersionsService)
    private readonly versions: NarrativeCausalChainVersionsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const n = typeof limit === 'string' ? Number(limit) : NaN;
    return this.versions.list(user.teamId, projectId, Number.isFinite(n) ? n : 50);
  }

  @Post()
  createSnapshot(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateSnapshotSchema, body);
    return this.versions.createSnapshot({
      teamId: user.teamId,
      userId: user.userId,
      projectId,
      label: input.label ?? null,
      note: input.note ?? null,
    });
  }

  @Get(':versionId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versions.get(user.teamId, projectId, versionId);
  }

  @Post(':versionId/restore')
  restore(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(RestoreSchema, body);
    return this.versions.restore({
      teamId: user.teamId,
      userId: user.userId,
      projectId,
      versionId,
      label: input.label ?? null,
      note: input.note ?? null,
    });
  }
}


