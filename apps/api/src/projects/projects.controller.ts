import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ProjectsService } from './projects.service.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateProjectInputSchema, UpdateProjectInputSchema } from '@aixsss/shared';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.teamId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateProjectInputSchema, body);
    return this.projects.create(user.teamId, input);
  }

  @Get(':projectId')
  get(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.projects.get(user.teamId, projectId);
  }

  @Patch(':projectId')
  update(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateProjectInputSchema, body);
    return this.projects.update(user.teamId, projectId, input, user.userId);
  }

  @Delete(':projectId')
  remove(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.projects.softDelete(user.teamId, projectId);
  }
}


