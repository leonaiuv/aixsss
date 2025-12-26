import type { Character, Episode, Project, Scene } from '@/types';
import { buildFinalPromptPack } from './finalPrompts';
import { resolvePanelAssetManifest } from './assets';
import { buildPromptLayers } from './promptLayers';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatAssetLine(ref: {
  url: string;
  weight?: number;
  label?: string;
  notes?: string;
}): string {
  const parts = [safeTrim(ref.url)].filter(Boolean);
  if (typeof ref.weight === 'number') parts.push(`w=${ref.weight}`);
  if (safeTrim(ref.label)) parts.push(`label=${safeTrim(ref.label)}`);
  if (safeTrim(ref.notes)) parts.push(`note=${safeTrim(ref.notes)}`);
  return `- ${parts.join(' | ')}`;
}

export function buildImg2ImgPackCopyText(args: {
  project: Project;
  episode: Episode;
  scene: Scene;
  styleFullPrompt: string;
  characters: Character[];
}): string {
  const { project, episode, scene, styleFullPrompt, characters } = args;
  const finalPrompts = buildFinalPromptPack(scene, styleFullPrompt);
  const layers = buildPromptLayers({ project, episode, scene, styleFullPrompt, characters });
  const assets = resolvePanelAssetManifest(scene, characters);

  const lines: string[] = [];
  lines.push(`# IMG2IMG / I2V Prompt Pack`);
  lines.push(`项目：${safeTrim(project.title) || project.id}`);
  lines.push(
    `分镜：第 ${episode.order} 集 · 第 ${scene.order} 格${safeTrim(scene.summary) ? ` · ${safeTrim(scene.summary)}` : ''}`,
  );

  lines.push(``);
  lines.push(`## 输入图片（建议）`);
  if (assets.sceneRefs.length > 0) {
    lines.push(`场景参考图（背景/基底）：`);
    assets.sceneRefs.forEach((r) => lines.push(formatAssetLine(r)));
  } else {
    lines.push(`场景参考图：- （未填写）`);
  }

  lines.push(``);
  lines.push(`角色参考图：`);
  if (assets.characters.length === 0) {
    lines.push(`- （未勾选出场角色）`);
  } else {
    assets.characters.forEach((c) => {
      const name = c.name || c.characterId;
      const directiveParts = [
        safeTrim(c.expression) ? `表情=${safeTrim(c.expression)}` : null,
        safeTrim(c.pose) ? `姿势=${safeTrim(c.pose)}` : null,
        safeTrim(c.costume) ? `服装=${safeTrim(c.costume)}` : null,
        safeTrim(c.interaction) ? `交互=${safeTrim(c.interaction)}` : null,
      ].filter(Boolean);
      const headerSuffix = [
        ...(typeof c.weight === 'number' ? [`w=${c.weight}`] : []),
        ...(directiveParts.length ? directiveParts : []),
        ...(c.source === 'none' ? ['缺参考图'] : []),
      ];
      lines.push(`- ${name}${headerSuffix.length ? ` | ${headerSuffix.join(' | ')}` : ''}`);
      if (c.imageRefs.length > 0) {
        c.imageRefs.forEach((r) => lines.push(`  ${formatAssetLine(r)}`));
      } else {
        lines.push(`  - （未填写）`);
      }
    });
  }

  if (assets.layoutRefs.length > 0) {
    lines.push(``);
    lines.push(`布局草图：`);
    assets.layoutRefs.forEach((r) => lines.push(formatAssetLine(r)));
  }
  if (assets.maskRefs.length > 0) {
    lines.push(``);
    lines.push(`Mask/Inpaint：`);
    assets.maskRefs.forEach((r) => lines.push(formatAssetLine(r)));
  }
  if (assets.params) {
    lines.push(``);
    lines.push(`## 参数建议（可选）`);
    const params = assets.params;
    const paramsLine = [
      typeof params.denoiseStrength === 'number' ? `denoise=${params.denoiseStrength}` : null,
      typeof params.cfgScale === 'number' ? `cfg=${params.cfgScale}` : null,
      typeof params.steps === 'number' ? `steps=${params.steps}` : null,
      typeof params.seed === 'number' ? `seed=${params.seed}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(paramsLine ? `- ${paramsLine}` : `- （空）`);
    if (safeTrim(params.notes)) lines.push(`- notes=${safeTrim(params.notes)}`);
  }

  lines.push(``);
  lines.push(`## 分层（Base / Episode / Delta）`);
  if (safeTrim(layers.base.zh)) {
    lines.push(`BASE:`);
    lines.push(layers.base.zh);
  }
  if (safeTrim(layers.episode.zh)) {
    lines.push(``);
    lines.push(`EPISODE:`);
    lines.push(layers.episode.zh);
  }
  if (safeTrim(layers.panelDelta.zh)) {
    lines.push(``);
    lines.push(`PANEL_DELTA:`);
    lines.push(layers.panelDelta.zh);
  }

  lines.push(``);
  lines.push(`## 最终提示词（可直接喂模型）`);
  lines.push(`IMAGE_PROMPT_KF0_ZH:`);
  lines.push(finalPrompts.imagePrompt.zh[0]);
  lines.push(``);
  lines.push(`IMAGE_PROMPT_KF1_ZH:`);
  lines.push(finalPrompts.imagePrompt.zh[1]);
  lines.push(``);
  lines.push(`IMAGE_PROMPT_KF2_ZH:`);
  lines.push(finalPrompts.imagePrompt.zh[2]);
  lines.push(``);
  lines.push(`NEGATIVE_ZH:`);
  lines.push(finalPrompts.negativePrompt.zh || '-');
  lines.push(``);
  lines.push(`I2V_PROMPT_ZH:`);
  lines.push(finalPrompts.i2vPrompt.zh || '-');

  return lines.join('\n');
}
