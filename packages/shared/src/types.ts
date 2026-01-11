// 共享领域类型：供 web/api/worker 共用

export const PROVIDER_TYPES = ['deepseek', 'kimi', 'gemini', 'openai-compatible'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const WORKFLOW_STATES = [
  'IDLE',
  'DATA_COLLECTING',
  'DATA_COLLECTED',
  'WORLD_VIEW_BUILDING',
  'CHARACTER_MANAGING',
  'EPISODE_PLANNING',
  'EPISODE_PLAN_EDITING',
  'EPISODE_CREATING',
  'SCENE_LIST_GENERATING',
  'SCENE_LIST_EDITING',
  'SCENE_LIST_CONFIRMED',
  'SCENE_PROCESSING',
  'ALL_SCENES_COMPLETE',
  'ALL_EPISODES_COMPLETE',
  'EXPORTING',
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const EPISODE_WORKFLOW_STATES = [
  'IDLE',
  'CORE_EXPRESSION_READY',
  'SCENE_LIST_EDITING',
  'SCENE_PROCESSING',
  'COMPLETE',
] as const;
export type EpisodeWorkflowState = (typeof EPISODE_WORKFLOW_STATES)[number];

export const SCENE_STEPS = ['scene_description', 'keyframe_prompt', 'motion_prompt', 'dialogue'] as const;
export type SceneStep = (typeof SCENE_STEPS)[number];

export const SCENE_STATUSES = [
  'pending',
  'scene_generating',
  'scene_confirmed',
  'keyframe_generating',
  'keyframe_confirmed',
  'motion_generating',
  'completed',
  'needs_update',
] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];

export type SceneCastCharacterIds = string[];

export const GENERATED_IMAGE_KEYFRAMES = [
  'KF0',
  'KF1',
  'KF2',
  'KF3',
  'KF4',
  'KF5',
  'KF6',
  'KF7',
  'KF8',
] as const;
export type GeneratedImageKeyframe = (typeof GENERATED_IMAGE_KEYFRAMES)[number];

export type GeneratedImage = {
  keyframe: GeneratedImageKeyframe;
  url: string;
  prompt?: string;
  revisedPrompt?: string;
  provider?: string;
  model?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export const TEAM_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
