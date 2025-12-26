import type {
  AssetImageRefV1,
  PanelAssetBindingsV1,
  PanelCharacterAssetBindingV1,
  PanelScriptV1,
  Scene,
  SceneContextSummary,
} from '@/types';
import { computePanelMetrics } from './analysis';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((v) => normalizeString(v)).filter((v): v is string => Boolean(v));
  return items.length > 0 ? items : undefined;
}

function normalizeAssetImageRef(value: unknown, fallbackId: string): AssetImageRefV1 | null {
  if (typeof value === 'string') {
    const url = normalizeString(value);
    if (!url) return null;
    return { id: fallbackId, url };
  }
  if (!isRecord(value)) return null;
  const url = normalizeString(value.url);
  if (!url) return null;
  const id = normalizeString(value.id) ?? fallbackId;
  const label = normalizeString(value.label);
  const notes = normalizeString(value.notes);
  const weight = normalizeNumber(value.weight);
  return {
    id,
    url,
    ...(label ? { label } : {}),
    ...(notes ? { notes } : {}),
    ...(weight !== undefined ? { weight } : {}),
  };
}

function normalizeAssetImageRefArray(
  value: unknown,
  prefix: string,
): AssetImageRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((v, idx) => normalizeAssetImageRef(v, `${prefix}_${idx}`))
    .filter((v): v is AssetImageRefV1 => Boolean(v));
  return refs.length > 0 ? refs : undefined;
}

function normalizePanelCharacterBindings(
  value: unknown,
): PanelCharacterAssetBindingV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const bindings = value
    .map((raw) => (isRecord(raw) ? raw : null))
    .filter((v): v is Record<string, unknown> => Boolean(v))
    .map((v, idx) => {
      const characterId = normalizeString(v.characterId);
      if (!characterId) return null;

      const imageRefs =
        normalizeAssetImageRefArray(v.imageRefs, `char_${idx}`) ??
        normalizeAssetImageRefArray(v.urls, `char_${idx}`);
      const weight = normalizeNumber(v.weight);
      const expression = normalizeString(v.expression);
      const pose = normalizeString(v.pose);
      const costume = normalizeString(v.costume);
      const interaction = normalizeString(v.interaction);
      const notes = normalizeString(v.notes);

      if (
        !imageRefs &&
        weight === undefined &&
        !expression &&
        !pose &&
        !costume &&
        !interaction &&
        !notes
      ) {
        return null;
      }

      return {
        characterId,
        ...(imageRefs ? { imageRefs } : {}),
        ...(weight !== undefined ? { weight } : {}),
        ...(expression ? { expression } : {}),
        ...(pose ? { pose } : {}),
        ...(costume ? { costume } : {}),
        ...(interaction ? { interaction } : {}),
        ...(notes ? { notes } : {}),
      } satisfies PanelCharacterAssetBindingV1;
    })
    .filter((v): v is PanelCharacterAssetBindingV1 => Boolean(v));
  return bindings.length > 0 ? bindings : undefined;
}

function normalizeAssetParams(value: unknown): PanelAssetBindingsV1['params'] | undefined {
  if (!isRecord(value)) return undefined;
  const denoiseStrength = normalizeNumber(value.denoiseStrength);
  const cfgScale = normalizeNumber(value.cfgScale);
  const steps = normalizeNumber(value.steps);
  const seed = normalizeNumber(value.seed);
  const notes = normalizeString(value.notes);
  if (
    denoiseStrength === undefined &&
    cfgScale === undefined &&
    steps === undefined &&
    seed === undefined &&
    !notes
  )
    return undefined;
  return {
    ...(denoiseStrength !== undefined ? { denoiseStrength } : {}),
    ...(cfgScale !== undefined ? { cfgScale } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(notes ? { notes } : {}),
  };
}

function normalizeAssets(value: unknown): PanelAssetBindingsV1 | undefined {
  if (!isRecord(value)) return undefined;
  const version = (value as { version?: unknown }).version;
  if (version !== undefined && version !== 1) return undefined;

  const sceneRefs = normalizeAssetImageRefArray(value.sceneRefs, 'scene');
  const characters = normalizePanelCharacterBindings(value.characters);
  const propRefs = normalizeAssetImageRefArray(value.propRefs, 'prop');
  const maskRefs = normalizeAssetImageRefArray(value.maskRefs, 'mask');
  const layoutRefs = normalizeAssetImageRefArray(value.layoutRefs, 'layout');
  const params = normalizeAssetParams(value.params);
  const notes = normalizeString(value.notes);

  if (!sceneRefs && !characters && !propRefs && !maskRefs && !layoutRefs && !params && !notes)
    return undefined;

  return {
    version: 1,
    ...(sceneRefs ? { sceneRefs } : {}),
    ...(characters ? { characters } : {}),
    ...(propRefs ? { propRefs } : {}),
    ...(maskRefs ? { maskRefs } : {}),
    ...(layoutRefs ? { layoutRefs } : {}),
    ...(params ? { params } : {}),
    ...(notes ? { notes } : {}),
  };
}

function normalizePrompts(value: unknown): PanelScriptV1['prompts'] | undefined {
  if (!isRecord(value)) return undefined;
  const sceneAnchor = normalizeString(value.sceneAnchor);
  const keyframes = normalizeString(value.keyframes);
  const motion = normalizeString(value.motion);
  if (!sceneAnchor && !keyframes && !motion) return undefined;
  return {
    ...(sceneAnchor ? { sceneAnchor } : {}),
    ...(keyframes ? { keyframes } : {}),
    ...(motion ? { motion } : {}),
  };
}

function normalizeMetrics(value: unknown): PanelScriptV1['metrics'] | undefined {
  if (!isRecord(value)) return undefined;
  const dialogueLineCount =
    typeof value.dialogueLineCount === 'number' ? value.dialogueLineCount : undefined;
  const dialogueCharCount =
    typeof value.dialogueCharCount === 'number' ? value.dialogueCharCount : undefined;
  const estimatedSeconds =
    typeof value.estimatedSeconds === 'number' ? value.estimatedSeconds : undefined;
  if (
    dialogueLineCount === undefined &&
    dialogueCharCount === undefined &&
    estimatedSeconds === undefined
  )
    return undefined;
  return { dialogueLineCount, dialogueCharCount, estimatedSeconds };
}

function normalizeLocation(value: unknown): PanelScriptV1['location'] | undefined {
  if (!isRecord(value)) return undefined;
  const worldViewElementId = normalizeString(value.worldViewElementId);
  const label = normalizeString(value.label);
  const notes = normalizeString(value.notes);
  if (!worldViewElementId && !label && !notes) return undefined;
  return {
    ...(worldViewElementId ? { worldViewElementId } : {}),
    ...(label ? { label } : {}),
    ...(notes ? { notes } : {}),
  };
}

function normalizePanelScript(value: unknown): PanelScriptV1 | null {
  if (!isRecord(value)) return null;
  const version = (value as { version?: unknown }).version;
  if (version !== 1) return null;

  const location = normalizeLocation(value.location);
  const timeOfDay = normalizeString(value.timeOfDay);
  const camera = normalizeString(value.camera);
  const blocking = normalizeString(value.blocking);
  const bubbleLayoutNotes = normalizeString(value.bubbleLayoutNotes);
  const charactersPresentIds = normalizeStringArray(value.charactersPresentIds);
  const props = normalizeStringArray(value.props);
  const assets = normalizeAssets(value.assets);
  const prompts = normalizePrompts(value.prompts);
  const metrics = normalizeMetrics(value.metrics);
  const createdAt = normalizeString(value.createdAt);
  const updatedAt = normalizeString(value.updatedAt);
  const source =
    value.source === 'ai' || value.source === 'manual' || value.source === 'import'
      ? value.source
      : undefined;

  return {
    version: 1,
    ...(location ? { location } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(camera ? { camera } : {}),
    ...(blocking ? { blocking } : {}),
    ...(bubbleLayoutNotes ? { bubbleLayoutNotes } : {}),
    ...(charactersPresentIds ? { charactersPresentIds } : {}),
    ...(props ? { props } : {}),
    ...(assets ? { assets } : {}),
    ...(prompts ? { prompts } : {}),
    ...(metrics ? { metrics } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(source ? { source } : {}),
  };
}

export function getSceneContextSummary(scene: Scene): SceneContextSummary {
  const raw = scene.contextSummary;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as SceneContextSummary;
  }
  return {};
}

export function getPanelScript(scene: Scene): PanelScriptV1 {
  const summary = getSceneContextSummary(scene);
  const raw = summary.panelScript;
  return normalizePanelScript(raw) ?? { version: 1 };
}

export function resolvePanelScript(scene: Scene): PanelScriptV1 {
  const base = getPanelScript(scene);
  const panelMetrics = computePanelMetrics(scene);

  return {
    ...base,
    version: 1,
    prompts: {
      ...base.prompts,
      ...(normalizeString(scene.sceneDescription) ? { sceneAnchor: scene.sceneDescription } : {}),
      ...(normalizeString(scene.shotPrompt) ? { keyframes: scene.shotPrompt } : {}),
      ...(normalizeString(scene.motionPrompt) ? { motion: scene.motionPrompt } : {}),
    },
    metrics: {
      ...base.metrics,
      dialogueLineCount: panelMetrics.dialogueLineCount,
      dialogueCharCount: panelMetrics.dialogueCharCount,
      estimatedSeconds: panelMetrics.estimatedSeconds,
    },
  };
}

export function buildPanelScriptPatch(
  scene: Scene,
  patch: Partial<Omit<PanelScriptV1, 'version'>>,
  nowIso = new Date().toISOString(),
): Pick<Scene, 'contextSummary'> {
  const contextSummary = getSceneContextSummary(scene);
  const prev = getPanelScript(scene);

  const mergeAssets = (
    base: PanelAssetBindingsV1 | undefined,
    delta: PanelAssetBindingsV1 | Partial<PanelAssetBindingsV1> | undefined,
  ): PanelAssetBindingsV1 | undefined => {
    if (delta === undefined) return base;
    const d = delta as Partial<PanelAssetBindingsV1>;
    const baseWithoutVersion = base ? (({ version: _v, ...rest }) => rest)(base) : {};
    const merged: PanelAssetBindingsV1 = {
      version: 1,
      ...baseWithoutVersion,
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.sceneRefs !== undefined ? { sceneRefs: d.sceneRefs } : {}),
      ...(d.characters !== undefined ? { characters: d.characters } : {}),
      ...(d.propRefs !== undefined ? { propRefs: d.propRefs } : {}),
      ...(d.maskRefs !== undefined ? { maskRefs: d.maskRefs } : {}),
      ...(d.layoutRefs !== undefined ? { layoutRefs: d.layoutRefs } : {}),
      ...(d.params !== undefined
        ? { params: { ...(base?.params ?? {}), ...(d.params ?? {}) } }
        : {}),
    };
    return normalizeAssets(merged);
  };

  const next: PanelScriptV1 = {
    ...prev,
    ...patch,
    version: 1,
    ...(patch.location !== undefined ? { location: { ...prev.location, ...patch.location } } : {}),
    ...(patch.assets !== undefined
      ? {
          assets: mergeAssets(
            prev.assets,
            patch.assets as unknown as Partial<PanelAssetBindingsV1>,
          ),
        }
      : {}),
    ...(patch.prompts !== undefined ? { prompts: { ...prev.prompts, ...patch.prompts } } : {}),
    ...(patch.metrics !== undefined ? { metrics: { ...prev.metrics, ...patch.metrics } } : {}),
    ...(patch.charactersPresentIds !== undefined
      ? { charactersPresentIds: patch.charactersPresentIds }
      : {}),
    ...(patch.props !== undefined ? { props: patch.props } : {}),
    createdAt: prev.createdAt ?? nowIso,
    updatedAt: nowIso,
    source: patch.source ?? prev.source ?? 'manual',
  };

  return {
    contextSummary: {
      ...contextSummary,
      panelScript: next,
    },
  };
}
