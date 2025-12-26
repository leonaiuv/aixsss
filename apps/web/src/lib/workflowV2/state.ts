import type {
  ArtifactStatus,
  Episode,
  Project,
  WorkflowV2EpisodeState,
  WorkflowV2ProjectState,
} from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeArtifactStatus(value: unknown): ArtifactStatus {
  if (value === 'draft' || value === 'review' || value === 'locked') return value;
  return 'draft';
}

function normalizeArtifactState(value: unknown): WorkflowV2ProjectState['artifacts']['bible'] {
  if (!isRecord(value)) return { status: 'draft' };
  return {
    status: normalizeArtifactStatus(value.status),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    lockedAt: typeof value.lockedAt === 'string' ? value.lockedAt : undefined,
  };
}

export function getProjectWorkflowV2(project: Project | null): WorkflowV2ProjectState {
  const cached = project?.contextCache?.workflowV2;
  if (cached && typeof cached === 'object') {
    const v = cached as WorkflowV2ProjectState;
    const artifacts = (v as { artifacts?: unknown }).artifacts;
    if ((v as { version?: unknown }).version === 1 && isRecord(artifacts)) {
      return {
        version: 1,
        artifacts: {
          bible: normalizeArtifactState(artifacts.bible),
          ...(artifacts.seasonArc !== undefined
            ? { seasonArc: normalizeArtifactState(artifacts.seasonArc) }
            : {}),
        },
      };
    }
  }

  return { version: 1, artifacts: { bible: { status: 'draft' } } };
}

export function getEpisodeWorkflowV2(episode: Episode | null): WorkflowV2EpisodeState {
  const rawCache = episode?.contextCache;
  const cached = isRecord(rawCache) ? rawCache.workflowV2 : undefined;
  if (cached && typeof cached === 'object') {
    const v = cached as WorkflowV2EpisodeState;
    const artifacts = (v as { artifacts?: unknown }).artifacts;
    if ((v as { version?: unknown }).version === 1 && isRecord(artifacts)) {
      return {
        version: 1,
        artifacts: {
          outline: normalizeArtifactState(artifacts.outline),
          storyboard: normalizeArtifactState(artifacts.storyboard),
          promptPack: normalizeArtifactState(artifacts.promptPack),
        },
      };
    }
  }

  return {
    version: 1,
    artifacts: {
      outline: { status: 'draft' },
      storyboard: { status: 'draft' },
      promptPack: { status: 'draft' },
    },
  };
}

export function buildProjectArtifactPatch(
  project: Project,
  artifact: keyof WorkflowV2ProjectState['artifacts'],
  status: ArtifactStatus,
  nowIso = new Date().toISOString(),
): Pick<Project, 'contextCache'> {
  const base =
    project.contextCache && typeof project.contextCache === 'object' ? project.contextCache : {};
  const v2 = getProjectWorkflowV2(project);
  const prev = v2.artifacts[artifact] ?? { status: 'draft' };

  const next = {
    ...prev,
    status,
    updatedAt: nowIso,
    lockedAt: status === 'locked' ? (prev.lockedAt ?? nowIso) : undefined,
  };

  return {
    contextCache: {
      ...base,
      workflowV2: {
        ...v2,
        artifacts: {
          ...v2.artifacts,
          [artifact]: next,
        },
      },
    },
  };
}

export function buildEpisodeArtifactPatch(
  episode: Episode,
  artifact: keyof WorkflowV2EpisodeState['artifacts'],
  status: ArtifactStatus,
  nowIso = new Date().toISOString(),
): Pick<Episode, 'contextCache'> {
  const base =
    episode.contextCache && typeof episode.contextCache === 'object' ? episode.contextCache : {};
  const v2 = getEpisodeWorkflowV2(episode);
  const prev = v2.artifacts[artifact] ?? { status: 'draft' };

  const next = {
    ...prev,
    status,
    updatedAt: nowIso,
    lockedAt: status === 'locked' ? (prev.lockedAt ?? nowIso) : undefined,
  };

  return {
    contextCache: {
      ...base,
      workflowV2: {
        ...v2,
        artifacts: {
          ...v2.artifacts,
          [artifact]: next,
        },
      },
    },
  };
}
