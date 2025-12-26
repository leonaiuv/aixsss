import type { Character, Episode, Project, Scene } from '@/types';
import { getPanelScript } from './panelScript';
import { resolvePanelAssetManifest } from './assets';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joinBlocks(blocks: Array<string | null | undefined>): string {
  const parts = blocks.map((b) => safeTrim(b)).filter(Boolean);
  return parts.join('\n');
}

export interface PromptLayersV1 {
  version: 1;
  base: { zh: string; en: string };
  episode: { zh: string; en: string };
  panelDelta: { zh: string; en: string };
}

export function buildPromptLayers(args: {
  project: Project;
  episode: Episode;
  scene: Scene;
  styleFullPrompt: string;
  characters: Character[];
}): PromptLayersV1 {
  const { project, episode, scene, styleFullPrompt, characters } = args;

  const base = safeTrim(styleFullPrompt);

  const episodeLine = joinBlocks([
    `项目：${safeTrim(project.title) || project.id}`,
    `单集：第 ${episode.order} 集${safeTrim(episode.title) ? `《${safeTrim(episode.title)}》` : ''}`,
    safeTrim(episode.summary) ? `单集概要：${safeTrim(episode.summary)}` : null,
  ]);

  const ps = getPanelScript(scene);
  const location = safeTrim(ps.location?.label) || safeTrim(ps.location?.worldViewElementId) || '';
  const timeOfDay = safeTrim(ps.timeOfDay);
  const camera = safeTrim(ps.camera);
  const blocking = safeTrim(ps.blocking);
  const bubble = safeTrim(ps.bubbleLayoutNotes);
  const props = (ps.props ?? []).map((p) => safeTrim(p)).filter(Boolean);

  const assets = resolvePanelAssetManifest(scene, characters);
  const characterLines = assets.characters
    .map((c) => {
      const name = c.name || c.characterId;
      const directives = [
        safeTrim(c.expression) ? `表情=${safeTrim(c.expression)}` : null,
        safeTrim(c.pose) ? `姿势=${safeTrim(c.pose)}` : null,
        safeTrim(c.costume) ? `服装=${safeTrim(c.costume)}` : null,
        safeTrim(c.interaction) ? `交互=${safeTrim(c.interaction)}` : null,
      ].filter(Boolean);
      const refInfo = c.imageRefs.length > 0 ? `${c.imageRefs.length} 张参考图` : '（缺参考图）';
      return `- ${name}：${directives.length ? directives.join('；') : '（无差量指令）'}；${refInfo}`;
    })
    .filter(Boolean);

  const panelDelta = joinBlocks([
    safeTrim(scene.summary) ? `分镜概要：${safeTrim(scene.summary)}` : null,
    location ? `地点：${location}` : null,
    timeOfDay ? `时间/天气：${timeOfDay}` : null,
    camera ? `镜头：${camera}` : null,
    blocking ? `站位/视线：${blocking}` : null,
    bubble ? `气泡/版面：${bubble}` : null,
    props.length ? `关键道具：${props.join('、')}` : null,
    characterLines.length ? `角色资产差量：\n${characterLines.join('\n')}` : null,
    '约束：保持背景参考图锚点不变；不要新增无关物体；为气泡留白区域预留干净背景。',
  ]);

  const same = (text: string) => ({ zh: text, en: text });

  return {
    version: 1,
    base: same(base),
    episode: same(episodeLine),
    panelDelta: same(panelDelta),
  };
}
