import type {
  AssetImageRefV1,
  Character,
  PanelAssetBindingsV1,
  PanelCharacterAssetBindingV1,
  Scene,
} from '@/types';
import { getPanelScript } from './panelScript';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqByUrl(refs: AssetImageRefV1[]): AssetImageRefV1[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const url = safeTrim(r.url);
    if (!url) return false;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function buildDefaultCharacterImageRefs(character: Character): AssetImageRefV1[] {
  const refs: AssetImageRefV1[] = [];
  const avatar = safeTrim(character.avatar);
  if (avatar) {
    refs.push({ id: `char_${character.id}_avatar`, url: avatar, label: 'avatar' });
  }
  const extra = character.portraitPrompts?.referenceImages ?? [];
  extra.forEach((r) => {
    const url = safeTrim(r?.url);
    if (!url) return;
    refs.push({
      id: safeTrim(r.id) || `char_${character.id}_ref_${refs.length}`,
      url,
      ...(safeTrim(r.label) ? { label: safeTrim(r.label) } : {}),
      ...(typeof r.weight === 'number' ? { weight: r.weight } : {}),
      ...(safeTrim(r.notes) ? { notes: safeTrim(r.notes) } : {}),
    });
  });
  return uniqByUrl(refs);
}

export interface ResolvedPanelCharacterAssetsV1 {
  characterId: string;
  name?: string;
  imageRefs: AssetImageRefV1[];
  /** imageRefs 的来源：panel 代表该格覆盖；character 代表角色库默认；none 代表缺失 */
  source: 'panel' | 'character' | 'none';
  weight?: number;
  expression?: string;
  pose?: string;
  costume?: string;
  interaction?: string;
  notes?: string;
}

export interface ResolvedPanelAssetManifestV1 {
  version: 1;
  sceneRefs: AssetImageRefV1[];
  characters: ResolvedPanelCharacterAssetsV1[];
  propRefs: AssetImageRefV1[];
  layoutRefs: AssetImageRefV1[];
  maskRefs: AssetImageRefV1[];
  params?: PanelAssetBindingsV1['params'];
  notes?: string;
}

function pickAssets(scene: Scene): PanelAssetBindingsV1 | undefined {
  const ps = getPanelScript(scene);
  return ps.assets;
}

function normalizeAssetRefs(refs: AssetImageRefV1[] | undefined): AssetImageRefV1[] {
  return uniqByUrl((refs ?? []).map((r) => ({ ...r, url: safeTrim(r.url) })).filter((r) => r.url));
}

function normalizeBinding(binding: PanelCharacterAssetBindingV1): PanelCharacterAssetBindingV1 {
  const imageRefs = normalizeAssetRefs(binding.imageRefs);
  return {
    ...binding,
    ...(imageRefs.length > 0 ? { imageRefs } : {}),
  };
}

export function resolvePanelAssetManifest(
  scene: Scene,
  characters: Character[],
): ResolvedPanelAssetManifestV1 {
  const assets = pickAssets(scene);
  const ps = getPanelScript(scene);
  const characterById = new Map(characters.map((c) => [c.id, c]));

  const presentIds = ps.charactersPresentIds ?? [];
  const bindings = (assets?.characters ?? []).map(normalizeBinding);
  const bindingById = new Map(bindings.map((b) => [b.characterId, b]));

  const allCharacterIds = Array.from(
    new Set<string>([...presentIds, ...bindings.map((b) => b.characterId)].filter(Boolean)),
  );

  const resolvedCharacters: ResolvedPanelCharacterAssetsV1[] = allCharacterIds.map((id) => {
    const character = characterById.get(id);
    const binding = bindingById.get(id);
    const panelRefs = normalizeAssetRefs(binding?.imageRefs);
    const defaultRefs = character ? buildDefaultCharacterImageRefs(character) : [];
    const imageRefs = panelRefs.length > 0 ? panelRefs : defaultRefs;
    const source: ResolvedPanelCharacterAssetsV1['source'] =
      panelRefs.length > 0 ? 'panel' : defaultRefs.length > 0 ? 'character' : 'none';
    return {
      characterId: id,
      ...(character?.name ? { name: character.name } : {}),
      imageRefs,
      source,
      ...(typeof binding?.weight === 'number' ? { weight: binding.weight } : {}),
      ...(safeTrim(binding?.expression) ? { expression: safeTrim(binding?.expression) } : {}),
      ...(safeTrim(binding?.pose) ? { pose: safeTrim(binding?.pose) } : {}),
      ...(safeTrim(binding?.costume) ? { costume: safeTrim(binding?.costume) } : {}),
      ...(safeTrim(binding?.interaction) ? { interaction: safeTrim(binding?.interaction) } : {}),
      ...(safeTrim(binding?.notes) ? { notes: safeTrim(binding?.notes) } : {}),
    };
  });

  return {
    version: 1,
    sceneRefs: normalizeAssetRefs(assets?.sceneRefs),
    characters: resolvedCharacters,
    propRefs: normalizeAssetRefs(assets?.propRefs),
    layoutRefs: normalizeAssetRefs(assets?.layoutRefs),
    maskRefs: normalizeAssetRefs(assets?.maskRefs),
    ...(assets?.params ? { params: assets.params } : {}),
    ...(safeTrim(assets?.notes) ? { notes: safeTrim(assets?.notes) } : {}),
  };
}
