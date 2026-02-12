import { getExistingPanelScript } from './panelScriptHints.js';

export type VisualReferenceImage = {
  url: string;
  label?: string;
  source: 'scene_asset' | 'character_asset' | 'character_avatar' | 'character_appearances';
  characterId?: string;
  characterName?: string;
};

export type VisualReferenceBundle = {
  sceneRefs: VisualReferenceImage[];
  characterRefs: VisualReferenceImage[];
  allRefs: VisualReferenceImage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function addUnique(target: VisualReferenceImage[], item: VisualReferenceImage): void {
  if (!item.url) return;
  if (target.some((x) => x.url === item.url)) return;
  target.push(item);
}

function extractImageUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
      return [trimmed];
    }
    try {
      const parsed = JSON.parse(trimmed);
      return extractImageUrls(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((v) => extractImageUrls(v));
  }
  if (!isRecord(value)) return [];

  const out: string[] = [];
  const directUrl = safeTrim(value.url);
  if (directUrl) out.push(directUrl);

  const imageUrl = safeTrim(value.imageUrl);
  if (imageUrl) out.push(imageUrl);

  const nestedUrls = ['urls', 'images', 'refs']
    .map((k) => value[k])
    .flatMap((v) => extractImageUrls(v));
  out.push(...nestedUrls);

  return Array.from(new Set(out));
}

export function buildVisualReferenceBundle(args: {
  contextSummary: unknown;
  castCharacters: Array<{ id: string; name: string; avatar?: string | null; appearances?: unknown }>;
}): VisualReferenceBundle {
  const sceneRefs: VisualReferenceImage[] = [];
  const characterRefs: VisualReferenceImage[] = [];

  const panelScript = getExistingPanelScript(args.contextSummary);
  if (panelScript?.assets?.sceneRefs) {
    for (const item of panelScript.assets.sceneRefs) {
      const url = safeTrim(item?.url);
      if (!url) continue;
      addUnique(sceneRefs, {
        url,
        label: safeTrim(item?.label) || undefined,
        source: 'scene_asset',
      });
    }
  }

  const characterAssetById = new Map<string, Array<{ url: string; label?: string }>>();
  for (const binding of panelScript?.assets?.characters ?? []) {
    const id = safeTrim(binding?.characterId);
    if (!id) continue;
    const refs = (binding.imageRefs ?? [])
      .map((ref) => ({ url: safeTrim(ref?.url), label: safeTrim(ref?.label) || undefined }))
      .filter((ref) => Boolean(ref.url));
    if (!refs.length) continue;
    characterAssetById.set(id, refs);
  }

  for (const character of args.castCharacters) {
    const fromPanelAssets = characterAssetById.get(character.id) ?? [];
    for (const item of fromPanelAssets) {
      addUnique(characterRefs, {
        url: item.url,
        label: item.label,
        source: 'character_asset',
        characterId: character.id,
        characterName: character.name,
      });
    }

    const avatar = safeTrim(character.avatar);
    if (avatar) {
      addUnique(characterRefs, {
        url: avatar,
        source: 'character_avatar',
        characterId: character.id,
        characterName: character.name,
      });
    }

    for (const url of extractImageUrls(character.appearances)) {
      addUnique(characterRefs, {
        url,
        source: 'character_appearances',
        characterId: character.id,
        characterName: character.name,
      });
    }
  }

  const allRefs = [...sceneRefs];
  for (const item of characterRefs) {
    addUnique(allRefs, item);
  }

  return { sceneRefs, characterRefs, allRefs };
}

export function buildMultimodalUserContent(args: {
  text: string;
  references: VisualReferenceBundle;
  maxImages?: number;
}): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const maxImages = Math.max(0, args.maxImages ?? 12);
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: args.text },
  ];
  const refs = args.references.allRefs.slice(0, maxImages);
  for (const ref of refs) {
    content.push({ type: 'image_url', image_url: { url: ref.url } });
  }
  return content;
}
