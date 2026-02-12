import { PrismaClient } from '@prisma/client';
import { convertLegacyShotPromptToV2, isStoryboardPromptV2 } from '../src/tasks/migrate-shotprompt-v2.js';

export type CliOptions = {
  dryRun: boolean;
  apply: boolean;
  limit: number;
  projectId?: string;
};

type MigrationStats = {
  mode: 'dry-run' | 'apply';
  scanned: number;
  migrated: number;
  skipped: number;
};

type SceneRow = { id: string; projectId: string; shotPrompt: string | null };
type SceneModel = {
  findMany: (args: {
    where: { projectId?: string };
    select: { id: true; projectId: true; shotPrompt: true };
    take?: number;
  }) => Promise<SceneRow[]>;
  update: (args: { where: { id: string }; data: { shotPrompt: string } }) => Promise<unknown>;
};

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    apply: false,
    limit: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.apply = false;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
      }
      i += 1;
      continue;
    }
    if (arg === '--project-id') {
      const value = argv[i + 1];
      if (value?.trim()) {
        options.projectId = value.trim();
      }
      i += 1;
    }
  }

  return options;
}

export async function migrateShotPromptToV2(
  sceneModel: SceneModel,
  options: CliOptions,
): Promise<MigrationStats> {
  const scenes = await sceneModel.findMany({
    where: {
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    select: { id: true, projectId: true, shotPrompt: true },
    ...(options.limit > 0 ? { take: options.limit } : {}),
  });

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  for (const scene of scenes) {
    scanned += 1;
    const raw = scene.shotPrompt?.trim();
    if (!raw) {
      skipped += 1;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skipped += 1;
      continue;
    }

    if (isStoryboardPromptV2(parsed)) {
      skipped += 1;
      continue;
    }

    const converted = convertLegacyShotPromptToV2(raw);
    if (!converted) {
      skipped += 1;
      continue;
    }

    migrated += 1;
    if (!options.dryRun && options.apply) {
      await sceneModel.update({
        where: { id: scene.id },
        data: { shotPrompt: JSON.stringify(converted, null, 2) },
      });
    }
  }

  return {
    mode: options.apply ? 'apply' : 'dry-run',
    scanned,
    migrated,
    skipped,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const stats = await migrateShotPromptToV2(prisma.scene, options);
    console.log(
      `[migrate-shotprompt-v2] mode=${stats.mode} scanned=${stats.scanned} migrated=${stats.migrated} skipped=${stats.skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const entryArg = process.argv[1];
if (entryArg && import.meta.url === new URL(entryArg, 'file://').href) {
  main().catch((err) => {
    console.error('[migrate-shotprompt-v2] failed:', err);
    process.exit(1);
  });
}
