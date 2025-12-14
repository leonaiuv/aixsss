import { apiUpdateScene } from '@/lib/api/scenes';

type Patch = Record<string, unknown>;

type PendingPatch = {
  projectId: string;
  sceneId: string;
  patch: Patch;
};

const pending = new Map<string, PendingPatch>();
let timer: number | null = null;

function scheduleFlush() {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    void flushApiScenePatchQueue();
  }, 800);
}

export function queueApiScenePatch(projectId: string, sceneId: string, patch: Patch) {
  const key = `${projectId}:${sceneId}`;
  const prev = pending.get(key);
  if (prev) {
    pending.set(key, { ...prev, patch: { ...prev.patch, ...patch } });
  } else {
    pending.set(key, { projectId, sceneId, patch });
  }

  scheduleFlush();
}

export async function flushApiScenePatchQueue(): Promise<void> {
  if (pending.size === 0) return;

  const items = Array.from(pending.values());
  pending.clear();

  await Promise.all(
    items.map(async (item) => {
      try {
        await apiUpdateScene(item.projectId, item.sceneId, item.patch as any);
      } catch (err) {
        // best-effort：失败则回填到队列，等待下次 flush（避免频繁重试造成雪崩）
        const key = `${item.projectId}:${item.sceneId}`;
        const prev = pending.get(key);
        pending.set(key, {
          projectId: item.projectId,
          sceneId: item.sceneId,
          patch: prev ? { ...item.patch, ...prev.patch } : item.patch,
        });
        console.error('[api] scene patch flush failed', { sceneId: item.sceneId, err });
      }
    }),
  );
}



