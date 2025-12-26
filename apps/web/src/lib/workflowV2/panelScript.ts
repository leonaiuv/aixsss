import type { PanelScriptV1, Scene, SceneContextSummary } from '@/types';
import { computePanelMetrics } from './analysis';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((v) => normalizeString(v)).filter((v): v is string => Boolean(v));
  return items.length > 0 ? items : undefined;
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

  const next: PanelScriptV1 = {
    ...prev,
    ...patch,
    version: 1,
    ...(patch.location !== undefined ? { location: { ...prev.location, ...patch.location } } : {}),
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
