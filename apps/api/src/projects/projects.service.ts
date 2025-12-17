import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectInput, UpdateProjectInput } from '@aixsss/shared';
import type { Prisma, Project, ProjectWorkflowState } from '@prisma/client';
import { NarrativeCausalChainVersionsService } from './narrative-causal-chain-versions.service.js';

function toIso(date: Date): string {
  return date.toISOString();
}

type ApiProject = Omit<Project, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

function mapProject(project: Project): ApiProject {
  return {
    ...project,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
    deletedAt: project.deletedAt ? toIso(project.deletedAt) : null,
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NarrativeCausalChainVersionsService)
    private readonly chainVersions: NarrativeCausalChainVersionsService,
  ) {}

  private extractChainUpdatedAt(cache: unknown): string | null {
    if (!cache || typeof cache !== 'object') return null;
    const c = cache as Record<string, unknown>;
    const ts = c.narrativeCausalChainUpdatedAt;
    return typeof ts === 'string' ? ts : null;
  }

  private extractChain(cache: unknown): unknown | null {
    if (!cache || typeof cache !== 'object') return null;
    const c = cache as Record<string, unknown>;
    return c.narrativeCausalChain ?? null;
  }

  async list(teamId: string) {
    const projects = await this.prisma.project.findMany({
      where: { teamId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return projects.map(mapProject);
  }

  async get(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Project not found');
    return mapProject(project);
  }

  async create(teamId: string, input: CreateProjectInput) {
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          teamId,
          title: input.title,
          summary: input.summary ?? '',
          style: input.style ?? '',
          artStyleConfig: input.artStyleConfig ?? undefined,
          protagonist: input.protagonist ?? '',
        },
      });

      await tx.episode.create({
        data: {
          projectId: created.id,
          order: 1,
          title: '',
          summary: '',
          workflowState: 'IDLE',
        },
      });

      return created;
    });
    return mapProject(project);
  }

  async update(teamId: string, projectId: string, input: UpdateProjectInput, userId?: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true, contextCache: true },
    });
    if (!existing) throw new NotFoundException('Project not found');

    const prevChainUpdatedAt = this.extractChainUpdatedAt(existing.contextCache);

    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(typeof input.title === 'string' ? { title: input.title } : {}),
        ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
        ...(typeof input.style === 'string' ? { style: input.style } : {}),
        ...(typeof input.protagonist === 'string' ? { protagonist: input.protagonist } : {}),
        ...(input.artStyleConfig !== undefined
          ? { artStyleConfig: input.artStyleConfig as Prisma.InputJsonValue }
          : {}),
        ...(input.contextCache !== undefined
          ? { contextCache: input.contextCache as Prisma.InputJsonValue }
          : {}),
        ...(input.workflowState
          ? { workflowState: input.workflowState as unknown as ProjectWorkflowState }
          : {}),
        ...(typeof input.currentSceneOrder === 'number' ? { currentSceneOrder: input.currentSceneOrder } : {}),
        ...(input.currentSceneStep ? { currentSceneStep: input.currentSceneStep } : {}),
      },
    });

    // 若本次更新确实“推进/修改”了叙事因果链，则自动写入一条版本（手动编辑来源）
    try {
      const nextCache = input.contextCache !== undefined ? input.contextCache : null;
      const nextChain = this.extractChain(nextCache);
      const nextUpdatedAt = this.extractChainUpdatedAt(nextCache);
      if (nextChain && nextUpdatedAt && nextUpdatedAt !== prevChainUpdatedAt) {
        const phase = (() => {
          if (!nextChain || typeof nextChain !== 'object' || Array.isArray(nextChain)) return null;
          const v = (nextChain as Record<string, unknown>).completedPhase;
          return typeof v === 'number' ? v : null;
        })();
        await this.chainVersions.tryCreateVersion({
          teamId,
          projectId,
          userId: typeof userId === 'string' ? userId : null,
          source: 'manual',
          phase: typeof phase === 'number' ? phase : null,
          label: '手动保存',
          note: null,
          basedOnVersionId: null,
          chain: nextChain,
        });
      }
    } catch {
      // best-effort：版本写入失败不应阻断主更新
    }
    return mapProject(project);
  }

  async softDelete(teamId: string, projectId: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Project not found');

    await this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}

