import { GENERATED_IMAGE_KEYFRAMES } from '@aixsss/shared';
import type { GeneratedImage, GeneratedImageKeyframe } from '@/types';

type GeneratedImageInput = Partial<GeneratedImage> & {
  keyframe: GeneratedImageKeyframe;
  url: string;
};

export function isGeneratedImageKeyframe(value: unknown): value is GeneratedImageKeyframe {
  return (
    typeof value === 'string' &&
    (GENERATED_IMAGE_KEYFRAMES as readonly string[]).includes(value)
  );
}

export function mergeGeneratedImages(
  existing: GeneratedImage[] | undefined,
  incoming: GeneratedImageInput,
): GeneratedImage[] {
  const map = new Map<GeneratedImageKeyframe, GeneratedImage>();

  for (const item of existing ?? []) {
    if (!item || !isGeneratedImageKeyframe(item.keyframe)) continue;
    if (!item.url?.trim()) continue;
    map.set(item.keyframe, item);
  }

  map.set(incoming.keyframe, {
    ...map.get(incoming.keyframe),
    ...incoming,
    keyframe: incoming.keyframe,
    url: incoming.url,
  });

  const ordered: GeneratedImage[] = [];
  for (const key of GENERATED_IMAGE_KEYFRAMES) {
    const item = map.get(key);
    if (item) ordered.push(item);
  }
  return ordered;
}

