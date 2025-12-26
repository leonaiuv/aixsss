import type { Character, Episode, Project, Scene, WorldViewElement } from '@/types';

export type WorkflowIssueLevel = 'error' | 'warn' | 'info';

export interface WorkflowIssue {
  id: string;
  level: WorkflowIssueLevel;
  title: string;
  detail?: string;
  scope: {
    projectId?: string;
    episodeId?: string;
    sceneId?: string;
  };
}

export interface PanelMetrics {
  dialogueLineCount: number;
  dialogueCharCount: number;
  estimatedSeconds: number;
}

export interface EpisodeMetrics {
  panelCount: number;
  totalDialogueChars: number;
  totalEstimatedSeconds: number;
  avgSecondsPerPanel: number;
}

export type WorkbenchTaskStatus = 'todo' | 'blocked' | 'done';

export interface WorkbenchTask {
  id: string;
  title: string;
  description: string;
  status: WorkbenchTaskStatus;
  level: WorkflowIssueLevel;
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countChineseLikeChars(text: string): number {
  // 粗略：去掉空白后按字符计数（含中英文/标点），用于“气泡承载”估算
  return text.replace(/\s+/gu, '').length;
}

function getDialogueLines(scene: Scene): Array<{ content: string; characterName?: string }> {
  const dialogues = Array.isArray(scene.dialogues) ? scene.dialogues : [];
  return dialogues
    .map((d) => ({
      content: safeTrim((d as { content?: unknown }).content),
      characterName: safeTrim((d as { characterName?: unknown }).characterName) || undefined,
    }))
    .filter((d) => d.content.length > 0);
}

export function computePanelMetrics(scene: Scene): PanelMetrics {
  const lines = getDialogueLines(scene);
  const charCount = lines.reduce((sum, line) => sum + countChineseLikeChars(line.content), 0);

  // 经验：无配音的“阅读节奏”不等同口播。这里给“图生视频”一个粗略时长建议：
  // - 基础展示时间 2.5s
  // - 阅读时间按 ~6 字/秒估算（偏保守）
  // - 气泡切换额外缓冲
  const base = 2.5;
  const reading = charCount > 0 ? charCount / 6 : 0;
  const bubbleBuffer = lines.length * 0.5;
  const estimatedSeconds = Math.max(base, Math.min(15, reading + bubbleBuffer));

  return {
    dialogueLineCount: lines.length,
    dialogueCharCount: charCount,
    estimatedSeconds: Number(estimatedSeconds.toFixed(1)),
  };
}

export function computeEpisodeMetrics(scenes: Scene[]): EpisodeMetrics {
  const metrics = scenes.map(computePanelMetrics);
  const totalEstimatedSeconds = metrics.reduce((sum, m) => sum + m.estimatedSeconds, 0);
  const totalDialogueChars = metrics.reduce((sum, m) => sum + m.dialogueCharCount, 0);
  const panelCount = scenes.length;
  return {
    panelCount,
    totalDialogueChars,
    totalEstimatedSeconds: Number(totalEstimatedSeconds.toFixed(1)),
    avgSecondsPerPanel:
      panelCount === 0 ? 0 : Number((totalEstimatedSeconds / panelCount).toFixed(1)),
  };
}

export function buildProjectIssues(input: {
  project: Project | null;
  styleFullPrompt: string;
  characters: Character[];
  worldViewElements: WorldViewElement[];
  episodes: Episode[];
}): WorkflowIssue[] {
  const { project, styleFullPrompt, characters, worldViewElements, episodes } = input;
  if (!project) {
    return [
      {
        id: 'project:missing',
        level: 'error',
        title: '未选择项目',
        scope: {},
      },
    ];
  }

  const issues: WorkflowIssue[] = [];
  const summaryLen = safeTrim(project.summary).length;
  const hasStyle = safeTrim(styleFullPrompt).length > 0;

  if (summaryLen < 80) {
    issues.push({
      id: 'project:summary:short',
      level: summaryLen === 0 ? 'error' : 'warn',
      title: '故事梗概偏短',
      detail: '建议 ≥ 80 字：包含世界观、主角目标、核心冲突、风格基调。',
      scope: { projectId: project.id },
    });
  }

  if (!hasStyle) {
    issues.push({
      id: 'project:style:missing',
      level: 'error',
      title: '缺少画风 Full Prompt',
      detail: '多集一致性强依赖“风格圣经”。建议先完善画风配置并尽早锁定。',
      scope: { projectId: project.id },
    });
  }

  if (characters.length === 0) {
    issues.push({
      id: 'project:characters:empty',
      level: 'warn',
      title: '角色库为空',
      detail: '多集创作建议至少建立主角/关键配角角色卡（外观锚点+口吻+动机）。',
      scope: { projectId: project.id },
    });
  }

  if (worldViewElements.length === 0) {
    issues.push({
      id: 'project:worldview:empty',
      level: 'info',
      title: '世界观条目为空',
      detail: '如果是现实题材可忽略；奇幻/科幻/长线剧情强烈建议建立世界规则与地点条目。',
      scope: { projectId: project.id },
    });
  }

  if (episodes.length === 0) {
    issues.push({
      id: 'project:episodes:empty',
      level: 'warn',
      title: '尚未规划剧集',
      detail: '多集产出建议先生成“集数规划/每集一句话功能”。',
      scope: { projectId: project.id },
    });
  }

  return issues;
}

export function buildEpisodeIssues(input: {
  project: Project;
  episode: Episode | null;
  scenes: Scene[];
  characters: Character[];
}): WorkflowIssue[] {
  const { project, episode, scenes, characters } = input;
  if (!episode) {
    return [
      {
        id: 'episode:missing',
        level: 'warn',
        title: '未选择剧集',
        detail: '请先在左侧选择/创建一个剧集。',
        scope: { projectId: project.id },
      },
    ];
  }

  const issues: WorkflowIssue[] = [];
  const episodeId = episode.id;

  if (!safeTrim(episode.summary)) {
    issues.push({
      id: `episode:${episodeId}:summary:missing`,
      level: 'info',
      title: '本集一句话概要为空',
      detail: '建议写清本集功能：推进/反转/情绪高点/铺垫/收尾钩子。',
      scope: { projectId: project.id, episodeId },
    });
  }

  if (!episode.coreExpression) {
    issues.push({
      id: `episode:${episodeId}:coreExpression:missing`,
      level: 'warn',
      title: '本集核心表达未生成',
      detail: '核心表达用于统一本集“主题/情绪/冲突方向”，建议优先生成并锁定后再批量产出分镜。',
      scope: { projectId: project.id, episodeId },
    });
  }

  if (!episode.outline) {
    issues.push({
      id: `episode:${episodeId}:outline:missing`,
      level: 'warn',
      title: '本集 Outline 未生成/未填写',
      detail: '建议用 beat sheet 方式拆 6-12 个节拍，并给每个节拍明确“信息点+情绪”。',
      scope: { projectId: project.id, episodeId },
    });
  }

  if (scenes.length === 0) {
    issues.push({
      id: `episode:${episodeId}:scenes:empty`,
      level: 'error',
      title: '本集分镜列表为空',
      detail: '需要先生成/录入 Panel 列表，才能继续生成提示词与对白。',
      scope: { projectId: project.id, episodeId },
    });
    return issues;
  }

  const episodeMetrics = computeEpisodeMetrics(scenes);
  const minutes = episodeMetrics.totalEstimatedSeconds / 60;
  if (Number.isFinite(minutes) && minutes > 0 && (minutes < 3 || minutes > 5)) {
    issues.push({
      id: `episode:${episodeId}:pacing:outOfRange`,
      level: 'info',
      title: `本集时长估算为 ${minutes.toFixed(1)} 分钟`,
      detail: '目标为 3–5 分钟/集（估算仅基于对白密度与气泡切换，建议结合实际镜头与转场调整）。',
      scope: { projectId: project.id, episodeId },
    });
  }

  const knownNames = new Set(characters.map((c) => c.name));
  const CAMERA_HINT_RE =
    /(近景|中景|远景|特写|俯拍|仰拍|侧面|背面|广角|长焦|低角度|高角度|镜头|构图|景别)/u;
  const BLOCKING_HINT_RE = /(左|右|前|后|靠近|远离|对视|背对|并排|角落|门口|走廊|窗边)/u;

  for (const scene of scenes) {
    const sceneId = scene.id;
    const order = scene.order;

    if (!safeTrim(scene.summary)) {
      issues.push({
        id: `scene:${sceneId}:summary:missing`,
        level: 'warn',
        title: `第 ${order} 格：概要为空`,
        detail: '建议用一句话描述“本格发生了什么/传递了什么信息”。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }

    if (!safeTrim(scene.sceneDescription)) {
      issues.push({
        id: `scene:${sceneId}:anchor:missing`,
        level: 'warn',
        title: `第 ${order} 格：场景锚点为空`,
        detail: '建议补齐环境一致性信息（地点/人物/关键道具/氛围），再生成关键帧提示词。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }

    if (!safeTrim(scene.shotPrompt)) {
      issues.push({
        id: `scene:${sceneId}:shotPrompt:missing`,
        level: 'warn',
        title: `第 ${order} 格：关键帧提示词为空`,
        detail: '该项目核心产物之一：建议输出可直接给生图工具的静态提示词（可中英/可分段）。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }

    const panel = computePanelMetrics(scene);
    if (panel.dialogueLineCount >= 5) {
      issues.push({
        id: `scene:${sceneId}:dialogue:bubbles`,
        level: panel.dialogueLineCount >= 7 ? 'error' : 'warn',
        title: `第 ${order} 格：气泡数量偏多（${panel.dialogueLineCount}）`,
        detail: '建议拆格/删字/改为动作叙事，避免读者负担过重。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }
    if (panel.dialogueCharCount >= 120) {
      issues.push({
        id: `scene:${sceneId}:dialogue:chars`,
        level: panel.dialogueCharCount >= 180 ? 'error' : 'warn',
        title: `第 ${order} 格：对白字数偏多（约 ${panel.dialogueCharCount} 字）`,
        detail: '建议拆格或将部分信息转为画面叙事/旁白。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }

    const lines = getDialogueLines(scene);
    const unknownCharacters = Array.from(
      new Set(lines.map((l) => l.characterName).filter((n): n is string => Boolean(n))),
    ).filter((name) => !knownNames.has(name));
    if (unknownCharacters.length > 0) {
      issues.push({
        id: `scene:${sceneId}:dialogue:unknownCharacter`,
        level: 'info',
        title: `第 ${order} 格：对白出现未建档角色`,
        detail: `未在角色库中找到：${unknownCharacters.join('、')}（建议补角色卡或统一命名）。`,
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }

    // 空间/镜头信息缺失（启发式提醒）
    const anchorText = safeTrim(scene.sceneDescription);
    const shotText = safeTrim(scene.shotPrompt);
    const hasCameraHint = CAMERA_HINT_RE.test(anchorText) || CAMERA_HINT_RE.test(shotText);
    const hasBlockingHint = BLOCKING_HINT_RE.test(anchorText) || BLOCKING_HINT_RE.test(shotText);
    if (!hasCameraHint || !hasBlockingHint) {
      issues.push({
        id: `scene:${sceneId}:visual:missingHints`,
        level: 'info',
        title: `第 ${order} 格：镜头/站位信息可能不足`,
        detail:
          '为提高“空间匹配度”，建议补充：景别/机位/构图 + 人物左右前后/视线/道具位置（至少其一）。',
        scope: { projectId: project.id, episodeId, sceneId },
      });
    }
  }

  return issues;
}

export function buildWorkbenchTasks(input: {
  aiProfileId: string | null;
  project: Project | null;
  styleFullPrompt: string;
  hasNarrativeCausalChain: boolean;
  characters: Character[];
  worldViewElements: WorldViewElement[];
  episodes: Episode[];
  currentEpisode: Episode | null;
  currentEpisodeScenes: Scene[];
}): WorkbenchTask[] {
  const {
    aiProfileId,
    project,
    styleFullPrompt,
    hasNarrativeCausalChain,
    characters,
    worldViewElements,
    episodes,
  } = input;
  const tasks: WorkbenchTask[] = [];

  const canRunAI = Boolean(aiProfileId);
  const blockedAI: WorkbenchTaskStatus = canRunAI ? 'todo' : 'blocked';

  const bibleReady = safeTrim(styleFullPrompt).length > 0 && characters.length > 0;
  tasks.push({
    id: 'task:bible',
    title: '完善并锁定项目圣经',
    description: '画风 Full Prompt + 角色卡 + 世界观/地点空间卡（多集一致性的根）。',
    status: bibleReady ? 'done' : 'todo',
    level: bibleReady ? 'info' : safeTrim(styleFullPrompt) ? 'warn' : 'error',
  });

  tasks.push({
    id: 'task:causalChain',
    title: '构建叙事因果链（可选但推荐）',
    description: '多集强一致性：冲突引擎/信息层/节拍/自洽校验。',
    status: hasNarrativeCausalChain ? 'done' : blockedAI,
    level: hasNarrativeCausalChain ? 'info' : canRunAI ? 'warn' : 'warn',
  });

  tasks.push({
    id: 'task:planEpisodes',
    title: '规划剧集',
    description: '生成/整理每集功能与一句话概要（建议先定集数与节奏）。',
    status: episodes.length > 0 ? 'done' : blockedAI,
    level: episodes.length > 0 ? 'info' : canRunAI ? 'warn' : 'warn',
  });

  if (worldViewElements.length === 0) {
    tasks.push({
      id: 'task:worldView',
      title: '补充世界观/地点条目（建议）',
      description: '提升空间一致性：为常用地点建立“空间卡”（布局/可用机位/关键道具位置）。',
      status: 'todo',
      level: 'info',
    });
  }

  const { currentEpisode, currentEpisodeScenes } = input;
  if (project && currentEpisode) {
    tasks.push({
      id: 'task:episode:coreExpression',
      title: '生成本集核心表达',
      description: '统一本集主题/情绪/冲突方向，作为分镜与对白的上游锚点。',
      status: currentEpisode.coreExpression ? 'done' : blockedAI,
      level: currentEpisode.coreExpression ? 'info' : canRunAI ? 'warn' : 'warn',
    });

    tasks.push({
      id: 'task:episode:sceneList',
      title: '生成/整理本集分镜列表（Panel）',
      description: '先有节拍与分镜，再做提示词/对白批量生成。',
      status: currentEpisodeScenes.length > 0 ? 'done' : blockedAI,
      level: currentEpisodeScenes.length > 0 ? 'info' : canRunAI ? 'error' : 'error',
    });

    const missingShot = currentEpisodeScenes.filter((s) => !safeTrim(s.shotPrompt)).length;
    tasks.push({
      id: 'task:episode:shotPrompt',
      title: '补全关键帧提示词（生图用）',
      description: '输出可直接给外部生图工具的提示词（建议分段：风格/场景/角色/镜头/动作/负面）。',
      status:
        currentEpisodeScenes.length === 0 ? 'blocked' : missingShot === 0 ? 'done' : blockedAI,
      level: missingShot === 0 ? 'info' : missingShot <= 2 ? 'warn' : 'warn',
    });

    const missingDialogue = currentEpisodeScenes.filter((s) => !Array.isArray(s.dialogues)).length;
    tasks.push({
      id: 'task:episode:dialogue',
      title: '补全对白（无需配音）',
      description: '关注“信息点密度 + 气泡承载 + 空间匹配（站位/视线/道具）”。',
      status:
        currentEpisodeScenes.length === 0 ? 'blocked' : missingDialogue === 0 ? 'done' : blockedAI,
      level: missingDialogue === 0 ? 'info' : missingDialogue <= 2 ? 'warn' : 'warn',
    });
  }

  // 若未选择项目/剧集，任务仍可显示但不做 AI
  if (!project) {
    return tasks.map((t) =>
      t.id.startsWith('task:episode:') ? { ...t, status: 'blocked', level: 'info' } : { ...t },
    );
  }
  return tasks;
}
