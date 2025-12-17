import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomUUID } from 'node:crypto';

export type NarrativeCausalChainVersionSource = 'ai' | 'manual' | 'restore';

export type NarrativeCausalChainVersionSummary = {
  id: string;
  createdAt: string;
  source: NarrativeCausalChainVersionSource;
  phase: number | null;
  completedPhase: number | null;
  validationStatus: string | null;
  chainSchemaVersion: string | null;
  label: string | null;
  note: string | null;
  basedOnVersionId: string | null;
};

export type NarrativeCausalChainVersionDetail = NarrativeCausalChainVersionSummary & {
  chain: unknown;
};

const MAX_VERSIONS_PER_PROJECT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractChainMeta(chain: unknown): {
  completedPhase: number | null;
  validationStatus: string | null;
  chainSchemaVersion: string | null;
} {
  if (!isRecord(chain)) return { completedPhase: null, validationStatus: null, chainSchemaVersion: null };
  const completedPhase = chain.completedPhase;
  const validationStatus = chain.validationStatus;
  const chainSchemaVersion = chain.version;
  return {
    completedPhase: typeof completedPhase === 'number' ? completedPhase : null,
    validationStatus: typeof validationStatus === 'string' ? validationStatus : null,
    chainSchemaVersion: typeof chainSchemaVersion === 'string' ? chainSchemaVersion : null,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

@Injectable()
export class NarrativeCausalChainVersionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertProject(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  async list(teamId: string, projectId: string, limit = 50): Promise<NarrativeCausalChainVersionSummary[]> {
    await this.assertProject(teamId, projectId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          createdAt: Date;
          source: NarrativeCausalChainVersionSource;
          phase: number | null;
          completedPhase: number | null;
          validationStatus: string | null;
          chainSchemaVersion: string | null;
          label: string | null;
          note: string | null;
          basedOnVersionId: string | null;
        }>
      >`
        SELECT
          "id",
          "createdAt",
          "source",
          "phase",
          "completedPhase",
          "validationStatus",
          "chainSchemaVersion",
          "label",
          "note",
          "basedOnVersionId"
        FROM "NarrativeCausalChainVersion"
        WHERE "teamId" = ${teamId} AND "projectId" = ${projectId}
        ORDER BY "createdAt" DESC
        LIMIT ${safeLimit}
      `;
      return rows.map((r) => ({
        id: r.id,
        createdAt: toIso(r.createdAt),
        source: r.source,
        phase: r.phase,
        completedPhase: r.completedPhase,
        validationStatus: r.validationStatus,
        chainSchemaVersion: r.chainSchemaVersion,
        label: r.label,
        note: r.note,
        basedOnVersionId: r.basedOnVersionId,
      }));
    } catch (err) {
      // 兼容：未迁移数据库时不阻断主流程
      console.warn('[api] NarrativeCausalChainVersion list failed (maybe not migrated):', err);
      return [];
    }
  }

  async get(teamId: string, projectId: string, versionId: string): Promise<NarrativeCausalChainVersionDetail> {
    await this.assertProject(teamId, projectId);
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          createdAt: Date;
          source: NarrativeCausalChainVersionSource;
          phase: number | null;
          completedPhase: number | null;
          validationStatus: string | null;
          chainSchemaVersion: string | null;
          label: string | null;
          note: string | null;
          basedOnVersionId: string | null;
          chain: unknown;
        }>
      >`
        SELECT
          "id",
          "createdAt",
          "source",
          "phase",
          "completedPhase",
          "validationStatus",
          "chainSchemaVersion",
          "label",
          "note",
          "basedOnVersionId",
          "chain"
        FROM "NarrativeCausalChainVersion"
        WHERE "teamId" = ${teamId} AND "projectId" = ${projectId} AND "id" = ${versionId}
        LIMIT 1
      `;
      const r = rows[0];
      if (!r) throw new NotFoundException('Version not found');
      return {
        id: r.id,
        createdAt: toIso(r.createdAt),
        source: r.source,
        phase: r.phase,
        completedPhase: r.completedPhase,
        validationStatus: r.validationStatus,
        chainSchemaVersion: r.chainSchemaVersion,
        label: r.label,
        note: r.note,
        basedOnVersionId: r.basedOnVersionId,
        chain: r.chain,
      };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      console.warn('[api] NarrativeCausalChainVersion get failed (maybe not migrated):', err);
      throw new NotFoundException('Version not found');
    }
  }

  async createSnapshot(args: {
    teamId: string;
    userId: string;
    projectId: string;
    label?: string | null;
    note?: string | null;
  }): Promise<NarrativeCausalChainVersionSummary> {
    await this.assertProject(args.teamId, args.projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: args.projectId, teamId: args.teamId, deletedAt: null },
      select: { contextCache: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const cache = project.contextCache as unknown;
    const chain = isRecord(cache) ? cache['narrativeCausalChain'] : undefined;
    if (!chain) throw new BadRequestException('narrativeCausalChain is empty');

    const phase = isRecord(chain) && typeof chain.completedPhase === 'number' ? chain.completedPhase : null;
    const created = await this.tryCreateVersion({
      teamId: args.teamId,
      projectId: args.projectId,
      userId: args.userId,
      source: 'manual',
      phase,
      label: args.label ?? null,
      note: args.note ?? null,
      basedOnVersionId: null,
      chain,
    });
    if (!created) throw new BadRequestException('Failed to create snapshot (db not migrated?)');
    return created;
  }

  async restore(args: {
    teamId: string;
    userId: string;
    projectId: string;
    versionId: string;
    label?: string | null;
    note?: string | null;
  }): Promise<{ ok: true; restoredVersion: NarrativeCausalChainVersionSummary }> {
    await this.assertProject(args.teamId, args.projectId);
    const version = await this.get(args.teamId, args.projectId, args.versionId);

    // 写回当前 Project.contextCache
    const project = await this.prisma.project.findFirst({
      where: { id: args.projectId, teamId: args.teamId, deletedAt: null },
      select: { contextCache: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const base = isRecord(project.contextCache) ? (project.contextCache as Record<string, unknown>) : {};
    const nextCache = {
      ...base,
      narrativeCausalChain: version.chain,
      narrativeCausalChainUpdatedAt: new Date().toISOString(),
    };
    await this.prisma.project.update({
      where: { id: args.projectId },
      data: { contextCache: nextCache as unknown as Prisma.InputJsonValue },
    });

    const phase =
      isRecord(version.chain) && typeof version.chain.completedPhase === 'number'
        ? version.chain.completedPhase
        : version.phase;

    const restored = await this.tryCreateVersion({
      teamId: args.teamId,
      projectId: args.projectId,
      userId: args.userId,
      source: 'restore',
      phase: typeof phase === 'number' ? phase : null,
      label: args.label ?? (version.label ? `恢复：${version.label}` : `恢复版本 ${version.id.slice(0, 8)}`),
      note: args.note ?? null,
      basedOnVersionId: version.id,
      chain: version.chain,
    });
    if (!restored) throw new BadRequestException('Restore succeeded but version record failed (db not migrated?)');
    return { ok: true, restoredVersion: restored };
  }

  /**
   * 供内部调用：在因果链发生变更时记录版本（best-effort，不应阻断主流程）
   */
  async tryCreateVersion(args: {
    teamId: string;
    projectId: string;
    userId: string | null;
    source: NarrativeCausalChainVersionSource;
    phase: number | null;
    label: string | null;
    note: string | null;
    basedOnVersionId: string | null;
    chain: unknown;
  }): Promise<NarrativeCausalChainVersionSummary | null> {
    const { completedPhase, validationStatus, chainSchemaVersion } = extractChainMeta(args.chain);
    const id = randomUUID();
    const chainJson = JSON.stringify(args.chain ?? null);
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "NarrativeCausalChainVersion" (
          "id",
          "teamId",
          "projectId",
          "userId",
          "source",
          "phase",
          "completedPhase",
          "validationStatus",
          "chainSchemaVersion",
          "label",
          "note",
          "basedOnVersionId",
          "chain"
        ) VALUES (
          ${id},
          ${args.teamId},
          ${args.projectId},
          ${args.userId},
          ${args.source}::"NarrativeCausalChainVersionSource",
          ${args.phase},
          ${completedPhase},
          ${validationStatus},
          ${chainSchemaVersion},
          ${args.label},
          ${args.note},
          ${args.basedOnVersionId},
          ${chainJson}::jsonb
        )
      `;

      // 保底裁剪：每个项目最多保留 MAX_VERSIONS_PER_PROJECT 条（删除更旧的）
      await this.prisma.$executeRaw`
        DELETE FROM "NarrativeCausalChainVersion"
        WHERE "teamId" = ${args.teamId}
          AND "projectId" = ${args.projectId}
          AND "id" IN (
            SELECT "id"
            FROM "NarrativeCausalChainVersion"
            WHERE "teamId" = ${args.teamId} AND "projectId" = ${args.projectId}
            ORDER BY "createdAt" DESC
            OFFSET ${MAX_VERSIONS_PER_PROJECT}
          )
      `;

      return {
        id,
        createdAt: new Date().toISOString(),
        source: args.source,
        phase: args.phase,
        completedPhase,
        validationStatus,
        chainSchemaVersion,
        label: args.label,
        note: args.note,
        basedOnVersionId: args.basedOnVersionId,
      };
    } catch (err) {
      console.warn('[api] NarrativeCausalChainVersion insert failed (maybe not migrated):', err);
      return null;
    }
  }
}


