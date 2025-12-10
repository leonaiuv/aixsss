import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * 项目表
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  title: text('title').notNull().default(''),
  summary: text('summary').notNull().default(''),
  artStyle: text('art_style').notNull().default(''),
  protagonist: text('protagonist').notNull().default(''),
  workflowState: text('workflow_state').notNull().default('IDLE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 分镜表
 */
export const scenes = sqliteTable('scenes', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  summary: text('summary').notNull().default(''),
  status: text('status').notNull().default('pending'),
  sceneDescription: text('scene_description'),
  keyframePrompt: text('keyframe_prompt'),
  spatialPrompt: text('spatial_prompt'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * 角色表
 */
export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  portraitPrompt: text('portrait_prompt'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// 类型推断
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
