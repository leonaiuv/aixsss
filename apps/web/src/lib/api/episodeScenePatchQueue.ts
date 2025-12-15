import { apiUpdateEpisodeScene } from '@/lib/api/episodeScenes';

type Patch = Record<string, unknown>;

type PendingPatch = {
  projectId: string;
  episodeId: string;
  sceneId: string;
  patch: Patch;
};

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
    pending.set(key, { ...prev, patch: { ...prev.patch, ...patch } });
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
        await apiUpdateEpisodeScene(item.projectId, item.episodeId, item.sceneId, item.patch as any);
      } catch (err) {
        const key = `${item.projectId}:${item.episodeId}:${item.sceneId}`;
        const prev = pending.get(key);
        pending.set(key, {
          projectId: item.projectId,
          episodeId: item.episodeId,
          sceneId: item.sceneId,
          patch: prev ? { ...item.patch, ...prev.patch } : item.patch,
        });
        console.error('[api] episode scene patch flush failed', { sceneId: item.sceneId, err });
      }
    }),
  );
}

