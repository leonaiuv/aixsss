import type { Character, Episode, Scene, WorldViewElement } from '@/types';
import type { WorkflowIssue, WorkflowIssueLevel } from './analysis';
import { getPanelScript } from './panelScript';
import { resolvePanelAssetManifest } from './assets';

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
  missingSceneRefCount: number;
  missingCharacterRefCount: number;
  timeOfDayJumpCount: number;
  uniquePropCount: number;
}

export interface ContinuityCharacterStat {
  characterId: string;
  name: string;
  totalPanelCount: number;
  totalDialogueLineCount: number;
  byEpisode: Array<{
    episodeId: string;
    order: number;
    title: string;
    panelCount: number;
    dialogueLineCount: number;
  }>;
}

export interface ContinuityPropStat {
  prop: string;
  totalPanelCount: number;
  byEpisode: Array<{
    episodeId: string;
    order: number;
    title: string;
    panelCount: number;
  }>;
}

export interface ContinuityReport {
  generatedAt: string;
  episodeCount: number;
  panelCount: number;
  issueCounts: Record<WorkflowIssueLevel, number>;
  issues: WorkflowIssue[];
  byEpisode: ContinuityEpisodeSummary[];
  characterStats: ContinuityCharacterStat[];
  propStats: ContinuityPropStat[];
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

  const characterPanelCounts = new Map<string, { total: number; byEpisode: Map<string, number> }>();
  const characterDialogueLineCounts = new Map<
    string,
    { total: number; byEpisode: Map<string, number> }
  >();
  const propPanelCounts = new Map<string, { total: number; byEpisode: Map<string, number> }>();

  const incCounter = (
    counter: Map<string, { total: number; byEpisode: Map<string, number> }>,
    key: string,
    episodeId: string,
  ) => {
    const prev = counter.get(key) ?? { total: 0, byEpisode: new Map<string, number>() };
    prev.total += 1;
    prev.byEpisode.set(episodeId, (prev.byEpisode.get(episodeId) ?? 0) + 1);
    counter.set(key, prev);
  };

  for (const ep of sortedEpisodes) {
    const epScenes = (scenesByEpisode.get(ep.id) ?? []).slice().sort((a, b) => a.order - b.order);
    panelCount += epScenes.length;

    let missingLocationCount = 0;
    let unknownLocationRefCount = 0;
    let missingCharactersPresentCount = 0;
    let unknownCharacterIdCount = 0;
    let unknownDialogueCharacterNameCount = 0;
    let missingSceneRefCount = 0;
    let missingCharacterRefCount = 0;
    let timeOfDayJumpCount = 0;
    const seenProps = new Set<string>();

    let prevScene: Scene | null = null;
    let prevTimeOfDay = '';

    for (const scene of epScenes) {
      const ps = getPanelScript(scene);
      const sceneId = scene.id;
      const assetManifest = resolvePanelAssetManifest(scene, characters);

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
      presentIds.forEach((id) => {
        if (safeTrim(id)) incCounter(characterPanelCounts, id, ep.id);
      });
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

      // 对白角色与“出场角色”不一致（缺口提示）
      const knownDialogueIds = dialogueNames
        .map((name) => characterByName.get(name)?.id)
        .filter((id): id is string => Boolean(id));
      const missingPresentForDialogue = Array.from(new Set(knownDialogueIds)).filter(
        (id) => !presentIds.includes(id),
      );
      if (presentIds.length > 0 && missingPresentForDialogue.length > 0) {
        const names = missingPresentForDialogue
          .map((id) => characterById.get(id)?.name ?? id)
          .filter(Boolean);
        issues.push({
          id: `continuity:${sceneId}:characters:dialogueMismatch`,
          level: 'warn',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：对白角色未包含在出场角色中`,
          detail: `缺少勾选：${names.join('、')}（建议补勾选，便于跨集统计与一致性检查）。`,
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }

      // 对白出场统计（按“台词行”计数）
      const dialogues = Array.isArray(scene.dialogues) ? scene.dialogues : [];
      dialogues.forEach((d) => {
        const name = safeTrim((d as { characterName?: unknown }).characterName);
        const id = name ? characterByName.get(name)?.id : undefined;
        if (id) incCounter(characterDialogueLineCounts, id, ep.id);
      });

      // 道具统计（按“出现的格”计数）
      const props = (ps.props ?? []).map((p) => safeTrim(p)).filter(Boolean);
      props.forEach((p) => {
        seenProps.add(p);
        incCounter(propPanelCounts, p, ep.id);
      });

      // 资产引用检查（图生图输入）
      if (assetManifest.sceneRefs.length === 0) {
        missingSceneRefCount += 1;
        issues.push({
          id: `continuity:${sceneId}:assets:missingSceneRef`,
          level: 'info',
          title: `第 ${ep.order} 集 · 第 ${scene.order} 格：未绑定场景参考图`,
          detail:
            '如果你的工作流是“场景参考图 + 角色参考图”图生图拼装，建议在分镜脚本里绑定背景/基底图 URL，便于一键复制与导出。',
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }

      if (presentIds.length > 0) {
        const missingNames = presentIds
          .filter((id) => {
            const resolved = assetManifest.characters.find((c) => c.characterId === id);
            return !resolved || resolved.source === 'none' || resolved.imageRefs.length === 0;
          })
          .map((id) => characterById.get(id)?.name ?? id)
          .filter(Boolean);
        if (missingNames.length > 0) {
          missingCharacterRefCount += missingNames.length;
          issues.push({
            id: `continuity:${sceneId}:assets:missingCharacterRefs`,
            level: 'info',
            title: `第 ${ep.order} 集 · 第 ${scene.order} 格：出场角色缺少参考图资产`,
            detail: `缺少：${Array.from(new Set(missingNames)).join('、')}（建议在“角色管理”里补参考图，或在该格资产绑定里覆盖填写）。`,
            scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
          });
        }
      }

      // 时间/天气跳变（启发式：相邻两格都有值且不同）
      const timeOfDay = safeTrim(ps.timeOfDay);
      if (prevScene && prevTimeOfDay && timeOfDay && prevTimeOfDay !== timeOfDay) {
        timeOfDayJumpCount += 1;
        issues.push({
          id: `continuity:${prevScene.id}:${sceneId}:timeOfDayJump`,
          level: 'info',
          title: `第 ${ep.order} 集 · 时间/天气跳变：第 ${prevScene.order} 格 → 第 ${scene.order} 格`,
          detail: `${prevTimeOfDay} → ${timeOfDay}（如为转场/蒙太奇可忽略；否则建议补一句转场说明或在分镜脚本注明）。`,
          scope: { ...(projectId ? { projectId } : {}), episodeId: ep.id, sceneId },
        });
      }
      prevScene = scene;
      prevTimeOfDay = timeOfDay;
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
      missingSceneRefCount,
      missingCharacterRefCount,
      timeOfDayJumpCount,
      uniquePropCount: seenProps.size,
    });
  }

  const episodeMetaById = new Map(sortedEpisodes.map((e) => [e.id, e] as const));

  const characterIds = new Set<string>([
    ...characterPanelCounts.keys(),
    ...characterDialogueLineCounts.keys(),
  ]);
  const characterStats: ContinuityCharacterStat[] = Array.from(characterIds).map((id) => {
    const c = characterById.get(id);
    const panel = characterPanelCounts.get(id);
    const dlg = characterDialogueLineCounts.get(id);
    const byEpisodeIds = new Set<string>([
      ...(panel?.byEpisode.keys() ?? []),
      ...(dlg?.byEpisode.keys() ?? []),
    ]);
    const byEpisode = Array.from(byEpisodeIds)
      .map((episodeId) => {
        const ep = episodeMetaById.get(episodeId);
        return {
          episodeId,
          order: ep?.order ?? 0,
          title: ep?.title ?? '',
          panelCount: panel?.byEpisode.get(episodeId) ?? 0,
          dialogueLineCount: dlg?.byEpisode.get(episodeId) ?? 0,
        };
      })
      .sort((a, b) => a.order - b.order);
    return {
      characterId: id,
      name: c?.name ?? id,
      totalPanelCount: panel?.total ?? 0,
      totalDialogueLineCount: dlg?.total ?? 0,
      byEpisode,
    };
  });

  characterStats.sort((a, b) => b.totalPanelCount - a.totalPanelCount);

  characterStats.forEach((s) => {
    if (s.totalDialogueLineCount > 0 && s.totalPanelCount === 0) {
      issues.push({
        id: `continuity:character:${s.characterId}:dialogueOnly`,
        level: 'warn',
        title: `角色「${s.name}」在对白中出现，但从未标记出场角色`,
        detail: '建议在相关分镜脚本里勾选出场角色，确保跨集统计与一致性检查有效。',
        scope: { ...(projectId ? { projectId } : {}) },
      });
    }
  });

  const propStats: ContinuityPropStat[] = Array.from(propPanelCounts.entries())
    .map(([prop, info]) => {
      const byEpisode = Array.from(info.byEpisode.entries())
        .map(([episodeId, count]) => {
          const ep = episodeMetaById.get(episodeId);
          return {
            episodeId,
            order: ep?.order ?? 0,
            title: ep?.title ?? '',
            panelCount: count,
          };
        })
        .sort((a, b) => a.order - b.order);
      return { prop, totalPanelCount: info.total, byEpisode };
    })
    .sort((a, b) => b.totalPanelCount - a.totalPanelCount);

  return {
    generatedAt: new Date().toISOString(),
    episodeCount: episodes.length,
    panelCount,
    issueCounts: issueCounts(issues),
    issues,
    byEpisode,
    characterStats,
    propStats,
  };
}
