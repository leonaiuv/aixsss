import { z } from 'zod';
import { GENERATED_IMAGE_KEYFRAMES } from '../types.js';

export const StoryboardGroupIdSchema = z.enum(GENERATED_IMAGE_KEYFRAMES);
export type StoryboardGroupId = z.infer<typeof StoryboardGroupIdSchema>;

export const StoryboardCameraModeSchema = z.enum(['A', 'B']);
export type StoryboardCameraMode = z.infer<typeof StoryboardCameraModeSchema>;

export const StoryboardGroupStatusSchema = z.enum(['pending', 'generating', 'ready', 'needs_fix']);
export type StoryboardGroupStatus = z.infer<typeof StoryboardGroupStatusSchema>;

export const StoryboardPanelCameraSchema = z
  .object({
    shot_size: z.string().min(1),
    angle: z.string().min(1),
    lens: z.string().min(1),
    motion: z.string().min(1),
  })
  .passthrough();
export type StoryboardPanelCamera = z.infer<typeof StoryboardPanelCameraSchema>;

export const StoryboardPanelSchema = z
  .object({
    index: z.number().int().min(1).max(9),
    en: z.string().min(1),
    zh: z.string().min(0).optional(),
    camera: StoryboardPanelCameraSchema.optional(),
    dirtyZh: z.boolean().optional(),
  })
  .passthrough();
export type StoryboardPanel = z.infer<typeof StoryboardPanelSchema>;

export const ContinuityCharacterStateSchema = z
  .object({
    name: z.string().min(1),
    location: z.string().min(0),
    stance: z.string().min(0),
    facing: z.string().min(0),
    emotion: z.string().min(0),
    props_in_hand: z
      .object({
        left: z.string().min(0).nullable(),
        right: z.string().min(0).nullable(),
      })
      .passthrough(),
  })
  .passthrough();
export type ContinuityCharacterState = z.infer<typeof ContinuityCharacterStateSchema>;

export const ContinuityPropStateSchema = z
  .object({
    name: z.string().min(1),
    state: z.string().min(0),
    holder: z.string().min(0).nullable(),
  })
  .passthrough();
export type ContinuityPropState = z.infer<typeof ContinuityPropStateSchema>;

export const ContinuityStateSchema = z
  .object({
    characters: z.array(ContinuityCharacterStateSchema).default([]),
    props: z.array(ContinuityPropStateSchema).default([]),
    next_intent_hint: z.string().min(0).default(''),
  })
  .passthrough();
export type ContinuityState = z.infer<typeof ContinuityStateSchema>;

export const SceneBibleSchema = z
  .object({
    scene_premise: z.string().min(1),
    characters: z
      .array(
        z
          .object({
            name: z.string().min(1),
            identity: z.string().min(0).optional(),
            relation: z.string().min(0).optional(),
          })
          .passthrough(),
      )
      .default([]),
    setting_lock: z.string().min(0).default(''),
    props_list: z.array(z.string().min(1)).default([]),
    must_happen_beats: z.array(z.string().min(1)).min(1),
  })
  .passthrough();
export type SceneBible = z.infer<typeof SceneBibleSchema>;

const ContinuityStateLiteSchema = ContinuityStateSchema.partial().passthrough();

export const StoryboardPlanGroupSchema = z
  .object({
    group_id: StoryboardGroupIdSchema,
    shot_range: z.string().min(1),
    goal_en: z.string().min(1),
    start_state: ContinuityStateLiteSchema.optional(),
    end_state: ContinuityStateLiteSchema.optional(),
  })
  .passthrough();
export type StoryboardPlanGroup = z.infer<typeof StoryboardPlanGroupSchema>;

export const StoryboardPlanSchema = z
  .object({
    groups: z.array(StoryboardPlanGroupSchema).length(9),
  })
  .passthrough();
export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>;

export const StoryboardGroupDraftSchema = z
  .object({
    group_id: StoryboardGroupIdSchema,
    shot_range: z.string().min(1),
    panels: z.array(StoryboardPanelSchema).length(9),
    continuity: z
      .object({
        end_state: ContinuityStateSchema,
      })
      .passthrough(),
  })
  .passthrough();
export type StoryboardGroupDraft = z.infer<typeof StoryboardGroupDraftSchema>;

export const StoryboardGroupRenderSchema = z
  .object({
    template_version: z.number().int().nonnegative(),
    prompt_en: z.string().min(1),
    render_json: z.unknown(),
  })
  .passthrough();
export type StoryboardGroupRender = z.infer<typeof StoryboardGroupRenderSchema>;

export const StoryboardGroupSchema = StoryboardGroupDraftSchema.extend({
  render: StoryboardGroupRenderSchema,
  meta: z
    .object({
      camera_mode: StoryboardCameraModeSchema.optional(),
      createdAt: z.string().min(1).optional(),
      updatedAt: z.string().min(1).optional(),
    })
    .passthrough()
    .optional(),
});
export type StoryboardGroup = z.infer<typeof StoryboardGroupSchema>;

export const StoryboardGroupsJsonSchema = z
  .object({
    version: z.literal(1),
    settings: z
      .object({
        camera_mode: StoryboardCameraModeSchema.default('B'),
      })
      .passthrough()
      .default({ camera_mode: 'B' }),
    groups: z
      .array(
        z
          .object({
            group_id: StoryboardGroupIdSchema,
            shot_range: z.string().min(1),
            status: StoryboardGroupStatusSchema,
            group: StoryboardGroupSchema.optional(),
            last_error: z.string().min(1).optional(),
          })
          .passthrough(),
      )
      .length(9),
    running_summary: z.string().min(0).optional(),
    translation: z
      .object({
        status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
        last_error: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type StoryboardGroupsJson = z.infer<typeof StoryboardGroupsJsonSchema>;

