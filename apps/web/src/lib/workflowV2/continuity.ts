import type { Character, Episode, Scene, WorldViewElement } from '@/types';
import type { WorkflowIssue, WorkflowIssueLevel } from './analysis';
import { getPanelScript } from './panelScript';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function issueCounts(issues: WorkflowIssue[]) {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.level] += 1;
      return acc;
    },
    { error: 0, warn: 0, info: 0 } as Record<WorkflowIssueLevel, number>,
  );
}

function getDialogueCharacterNames(scene: Scene): string[] {
  const dialogues = Array.isArray(scene.dialogues) ? scene.dialogues : [];
  const names = dialogues
    .map((d) => safeTrim((d as { characterName?: unknown }).characterName))
    .filter(Boolean);
  return Array.from(new Set(names));
}

export interface ContinuityEpisodeSummary {
  episodeId: string;
  order: number;
  title: string;
  panelCount: number;
  missingLocationCount: number;
  unknownLocationRefCount: number;
  missingCharactersPresentCount: number;
  unknownCharacterIdCount: number;
  unknownDialogueCharacterNameCount: number;
}

export interface ContinuityReport {
  generatedAt: string;
  episodeCount: number;
  panelCount: number;
  issueCounts: Record<WorkflowIssueLevel, number>;
  issues: WorkflowIssue[];
  byEpisode: ContinuityEpisodeSummary[];
}

export function buildContinuityReport(input: {
  projectId?: string;
  episodes: Episode[];
  scenesByEpisode: Map<string, Scene[]>;
  characters: Character[];
  worldViewElements: WorldViewElement[];
}): ContinuityReport {
  const { projectId, episodes, scenesByEpisode, characters, worldViewElements } = input;

  const worldViewById = new Map(worldViewElements.map((w) => [w.id, w]));
  const characterById = new Map(characters.map((c) => [c.id, c]));
  const characterByName = new Map(characters.map((c) => [c.name, c]));

  const sortedEpisodes = episodes.slice().sort((a, b) => a.order - b.order);

  const issues: WorkflowIssue[] = [];
  const byEpisode: ContinuityEpisodeSummary[] = [];
  let panelCount = 0;

  for (const ep of sortedEpisodes) {
    const epScenes = (scenesByEpisode.get(ep.id) ?? []).slice().sort((a, b) => a.order - b.order);
    panelCount += epScenes.length;

    let missingLocationCount = 0;
    let unknownLocationRefCount = 0;
    let missingCharactersPresentCount = 0;
    let unknownCharacterIdCount = 0;
    let unknownDialogueCharacterNameCount = 0;

    for (const scene of epScenes) {
      const ps = getPanelScript(scene);
      const sceneId = scene.id;

      const locId = safeTrim(ps.location?.worldViewElementId);
      const locLabel = safeTrim(ps.location?.label);
      if (!locId && !locLabel) {
        missingLocationCount += 1;
        issues.push({
          id: `continuity:${sceneId}:location:missing`,
          level: 'info',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：未填写地点`,
          detail: '建议至少绑定一个世界观地点条目，或手写地点名（便于跨集空间一致性）。',
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      } else if (locId && !worldViewById.has(locId)) {
        unknownLocationRefCount += 1;
        issues.push({
          id: `continuity:${sceneId}:location:unknownRef`,
          level: 'warn',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：地点引用不存在`,
          detail: `worldViewElementId=${locId} 未在世界观条目中找到（可能已删除/未同步）。`,
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }

      const presentIds = ps.charactersPresentIds ?? [];
      if (presentIds.length === 0) {
        missingCharactersPresentCount += 1;
        const dialogueNames = getDialogueCharacterNames(scene);
        if (dialogueNames.length > 0) {
          issues.push({
            id: `continuity:${sceneId}:characters:missingPresent`,
            level: 'info',
            title: `第 ${ep.order} 集 · 第 ${scene.order} 格：对白出现角色但未勾选出场角色`,
            detail: `对白角色：${dialogueNames.join('、')}（建议在分镜脚本中勾选出场角色，用于连续性统计）。`,
            scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
          });
        } else {
          issues.push({
            id: `continuity:${sceneId}:characters:missingPresent`,
            level: 'info',
            title: `第 ${ep.order} 集 · 第 ${scene.order} 格：未勾选出场角色`,
            detail: '建议勾选出场角色（哪怕只有 1 人），便于跨集统计与一致性检查。',
            scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
          });
        }
      }

      const unknownIds = presentIds.filter((id) => !characterById.has(id));
      if (unknownIds.length > 0) {
        unknownCharacterIdCount += unknownIds.length;
        issues.push({
          id: `continuity:${sceneId}:characters:unknownIds`,
          level: 'warn',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：出场角色包含未知 ID`,
          detail: `未找到：${unknownIds.join('、')}（可能已删除/导入数据不一致）。`,
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }

      const dialogueNames = getDialogueCharacterNames(scene);
      const unknownNames = dialogueNames.filter((n) => !characterByName.has(n));
      if (unknownNames.length > 0) {
        unknownDialogueCharacterNameCount += unknownNames.length;
        issues.push({
          id: `continuity:${sceneId}:dialogue:unknownNames`,
          level: 'info',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：对白出现未建档角色名`,
          detail: `未在角色库中找到：${unknownNames.join('、')}（建议补角色卡或统一命名）。`,
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }
    }

    byEpisode.push({
      episodeId: ep.id,
      order: ep.order,
      title: ep.title,
      panelCount: epScenes.length,
      missingLocationCount,
      unknownLocationRefCount,
      missingCharactersPresentCount,
      unknownCharacterIdCount,
      unknownDialogueCharacterNameCount,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    episodeCount: episodes.length,
    panelCount,
    issueCounts: issueCounts(issues),
    issues,
    byEpisode,
  };
}

