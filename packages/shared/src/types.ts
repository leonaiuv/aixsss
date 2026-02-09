// 共享领域类型：供 web/api/worker 共用

export const PROVIDER_TYPES = ['deepseek', 'kimi', 'gemini', 'openai-compatible', 'doubao-ark'] as const;
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
  'SCRIPT_WRITING',
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
  'sound_design_generating',
  'sound_design_confirmed',
  'completed',
  'needs_update',
] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];

export const SOUND_CUE_TYPES = ['sfx', 'bgm', 'ambience', 'foley', 'voice_over', 'silence'] as const;
export type SoundCueType = (typeof SOUND_CUE_TYPES)[number];

export const SHOT_SIZES = [
  'ECU',
  'CU',
  'MCU',
  'MS',
  'MLS',
  'LS',
  'ELS',
  'XLS',
  'OTS',
  'POV',
  'INSERT',
  'TWO_SHOT',
  'GROUP',
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

export const CAMERA_ANGLES = [
  'eye_level',
  'low_angle',
  'high_angle',
  'birds_eye',
  'worms_eye',
  'dutch_angle',
  'overhead',
] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];

export const CAMERA_MOTIONS = [
  'static',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'dolly_in',
  'dolly_out',
  'truck_left',
  'truck_right',
  'crane_up',
  'crane_down',
  'zoom_in',
  'zoom_out',
  'handheld',
  'steadicam',
  'whip_pan',
  'rack_focus',
] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];

export const TRANSITION_TYPES = [
  'cut',
  'dissolve',
  'fade_in',
  'fade_out',
  'fade_to_black',
  'wipe',
  'iris',
  'match_cut',
  'jump_cut',
  'smash_cut',
  'cross_dissolve',
  'dip_to_black',
  'L_cut',
  'J_cut',
] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

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
