type AssetImageRefV1 = {
  id: string;
  url: string;
  label?: string;
  weight?: number;
  notes?: string;
};

type PanelCharacterAssetBindingV1 = {
  characterId: string;
  imageRefs?: AssetImageRefV1[];
  weight?: number;
  expression?: string;
  pose?: string;
  costume?: string;
  interaction?: string;
  notes?: string;
};

type PanelAssetBindingsV1 = {
  version: 1;
  sceneRefs?: AssetImageRefV1[];
  characters?: PanelCharacterAssetBindingV1[];
  propRefs?: AssetImageRefV1[];
  maskRefs?: AssetImageRefV1[];
  layoutRefs?: AssetImageRefV1[];
  params?: {
    denoiseStrength?: number;
    cfgScale?: number;
    steps?: number;
    seed?: number;
    notes?: string;
  };
  notes?: string;
};

export type PanelScriptV1 = {
  version: 1;
  location?: {
    worldViewElementId?: string;
    label?: string;
    notes?: string;
  };
  timeOfDay?: string;
  camera?: string;
  blocking?: string;
  bubbleLayoutNotes?: string;
  charactersPresentIds?: string[];
  props?: string[];
  assets?: PanelAssetBindingsV1;
  prompts?: {
    sceneAnchor?: string;
    keyframes?: string;
    motion?: string;
  };
  metrics?: {
    dialogueLineCount?: number;
    dialogueCharCount?: number;
    estimatedSeconds?: number;
  };
  createdAt?: string;
  updatedAt?: string;
  source?: 'ai' | 'manual' | 'import';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getExistingPanelScript(contextSummary: unknown): PanelScriptV1 | null {
  if (!isRecord(contextSummary)) return null;
  const ps = (contextSummary as { panelScript?: unknown }).panelScript;
  if (!isRecord(ps)) return null;
  if ((ps as { version?: unknown }).version !== 1) return null;
  return ps as PanelScriptV1;
}

function formatAssetImageCount(refs: unknown): number {
  if (!Array.isArray(refs)) return 0;
  return refs.filter((r) => {
    if (typeof r === 'string') return Boolean(safeTrim(r));
    if (isRecord(r)) return Boolean(safeTrim(r.url));
    return false;
  }).length;
}

function countImageRefs(refs: AssetImageRefV1[] | undefined): number {
  return (refs ?? []).filter((r) => Boolean(safeTrim(r.url))).length;
}

export function formatPanelScriptHints(
  panelScript: PanelScriptV1 | null,
  opts?: { characterNameById?: Map<string, string>; includeAssets?: boolean },
): string {
  if (!panelScript) return '';

  const lines: string[] = [];
  const assetLines: string[] = [];
  const includeAssets = opts?.includeAssets !== false;

  const location =
    safeTrim(panelScript.location?.label) || safeTrim(panelScript.location?.worldViewElementId);
  if (location) lines.push(`- 地点：${location}`);

  const timeOfDay = safeTrim(panelScript.timeOfDay);
  if (timeOfDay) lines.push(`- 时间/天气：${timeOfDay}`);

  const camera = safeTrim(panelScript.camera);
  if (camera) lines.push(`- 镜头：${camera}`);

  const blocking = safeTrim(panelScript.blocking);
  if (blocking) lines.push(`- 站位/视线：${blocking}`);

  const bubble = safeTrim(panelScript.bubbleLayoutNotes);
  if (bubble) lines.push(`- 气泡/版面：${bubble}`);

  const props = Array.isArray(panelScript.props)
    ? panelScript.props.map((p) => safeTrim(p)).filter(Boolean)
    : [];
  if (props.length > 0) lines.push(`- 关键道具：${props.join('、')}`);

  const assets = panelScript.assets;
  const sceneRefCount = formatAssetImageCount(assets?.sceneRefs);
  if (sceneRefCount > 0) assetLines.push(`- 场景参考图：${sceneRefCount} 张（背景/基底）`);

  const characterBindings = assets?.characters ?? [];
  const named = (id: string) => opts?.characterNameById?.get(id) || id;
  characterBindings.forEach((b) => {
    const id = safeTrim(b.characterId);
    if (!id) return;
    const directives = [
      safeTrim(b.expression) ? `表情=${safeTrim(b.expression)}` : null,
      safeTrim(b.pose) ? `姿势=${safeTrim(b.pose)}` : null,
      safeTrim(b.costume) ? `服装=${safeTrim(b.costume)}` : null,
      safeTrim(b.interaction) ? `交互=${safeTrim(b.interaction)}` : null,
    ].filter(Boolean);
    const refCount = countImageRefs(b.imageRefs);
    const refInfo = refCount > 0 ? `${refCount} 张参考图` : '参考图未填写（可用角色库默认）';
    assetLines.push(
      `- 角色资产：${named(id)}（${directives.length ? directives.join('；') : '无差量指令'}；${refInfo}）`,
    );
  });

  const params = assets?.params;
  if (params) {
    const parts = [
      typeof params.denoiseStrength === 'number' ? `denoise=${params.denoiseStrength}` : null,
      typeof params.cfgScale === 'number' ? `cfg=${params.cfgScale}` : null,
      typeof params.steps === 'number' ? `steps=${params.steps}` : null,
      typeof params.seed === 'number' ? `seed=${params.seed}` : null,
    ].filter(Boolean);
    if (parts.length > 0) assetLines.push(`- 参数建议：${parts.join(', ')}`);
    const notes = safeTrim(params.notes);
    if (notes) assetLines.push(`- 参数备注：${notes}`);
  }

  if (lines.length === 0 && assetLines.length === 0) return '';

  const chunks: string[] = [];
  if (lines.length > 0) {
    chunks.push(`## 用户分镜脚本约束（尽量遵守）\n${lines.join('\n')}`);
  }
  if (includeAssets && assetLines.length > 0) {
    chunks.push(
      `## 资产引用（图生图输入，必须遵守）\n- 角色一致性由参考图资产保证：不要重复外观描述，只写差量（位置/姿势/表情/交互/遮挡/留白）。\n${assetLines.join('\n')}`,
    );
  }

  return `\n\n${chunks.join('\n\n')}\n`;
}
