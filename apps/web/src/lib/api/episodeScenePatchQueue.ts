import { apiUpdateEpisodeScene } from '@/lib/api/episodeScenes';
import type { Scene } from '@/types';

type Patch = Partial<Scene>;

type PendingPatch = {
  projectId: string;
  episodeId: string;
  sceneId: string;
  patch: Patch;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prevValue = out[key];
    if (isPlainObject(prevValue) && isPlainObject(value)) {
      out[key] = deepMergeObjects(prevValue, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mergePatch(prev: Patch, next: Patch): Patch {
  const merged: Patch = { ...prev, ...next };
  const prevSummary = prev.contextSummary;
  const nextSummary = next.contextSummary;
  if (isPlainObject(prevSummary) && isPlainObject(nextSummary)) {
    merged.contextSummary = deepMergeObjects(prevSummary, nextSummary);
  }
  return merged;
}

const pending = new Map<string, PendingPatch>();
let timer: number | null = null;

function scheduleFlush() {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    void flushApiEpisodeScenePatchQueue();
  }, 800);
}

export function queueApiEpisodeScenePatch(
  projectId: string,
  episodeId: string,
  sceneId: string,
  patch: Patch,
) {
  const key = `${projectId}:${episodeId}:${sceneId}`;
  const prev = pending.get(key);
  if (prev) {
    pending.set(key, { ...prev, patch: mergePatch(prev.patch, patch) });
  } else {
    pending.set(key, { projectId, episodeId, sceneId, patch });
  }

  scheduleFlush();
}

export async function flushApiEpisodeScenePatchQueue(): Promise<void> {
  if (pending.size === 0) return;

  const items = Array.from(pending.values());
  pending.clear();

  await Promise.all(
    items.map(async (item) => {
      try {
        await apiUpdateEpisodeScene(item.projectId, item.episodeId, item.sceneId, item.patch);
      } catch (err) {
        const key = `${item.projectId}:${item.episodeId}:${item.sceneId}`;
        const prev = pending.get(key);
        pending.set(key, {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          patch: prev ? mergePatch(item.patch, prev.patch) : item.patch,
        });
        console.error('[api] episode scene patch flush failed', { sceneId: item.sceneId, err });
      }
    }),
  );
}
