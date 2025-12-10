import { eq } from 'drizzle-orm';
import { db, projects, scenes, initializeDatabase } from '../db';
import type { CheckpointStore, ProjectCheckpoint, Scene as CheckpointScene } from './store';
import type { WorkflowState, SceneStatus } from '@/types';

/**
 * 创建 SQLite 检查点存储
 * 
 * 使用 better-sqlite3 + drizzle-orm 实现持久化存储
 */
export function createSQLiteCheckpointStore(): CheckpointStore {
  // 确保表已创建
  initializeDatabase();

  return {
    async save(checkpoint: ProjectCheckpoint): Promise<string> {
      const { projectId } = checkpoint;
      const now = new Date().toISOString();

      // 检查项目是否存在
      const existing = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();

      if (existing) {
        // 更新项目
        await db.update(projects)
          .set({
            threadId: checkpoint.threadId,
            title: checkpoint.title,
            summary: checkpoint.summary,
            artStyle: checkpoint.artStyle,
            protagonist: checkpoint.protagonist,
            workflowState: checkpoint.workflowState,
            updatedAt: now,
          })
          .where(eq(projects.id, projectId));
      } else {
        // 创建新项目
        await db.insert(projects).values({
          id: projectId,
          threadId: checkpoint.threadId,
          title: checkpoint.title,
          summary: checkpoint.summary,
          artStyle: checkpoint.artStyle,
          protagonist: checkpoint.protagonist,
          workflowState: checkpoint.workflowState,
          createdAt: checkpoint.createdAt ?? now,
          updatedAt: now,
        });
      }

      // 同步分镜数据
      // 先获取现有分镜
      const existingScenes = await db.select()
        .from(scenes)
        .where(eq(scenes.projectId, projectId))
        .all();

      const existingSceneIds = new Set(existingScenes.map(s => s.id));
      const newSceneIds = new Set(checkpoint.scenes.map(s => s.id));

      // 删除不再存在的分镜
      for (const scene of existingScenes) {
        if (!newSceneIds.has(scene.id)) {
          await db.delete(scenes).where(eq(scenes.id, scene.id));
        }
      }

      // 更新或插入分镜
      for (const scene of checkpoint.scenes) {
        if (existingSceneIds.has(scene.id)) {
          // 更新
          await db.update(scenes)
            .set({
              order: scene.order,
              summary: scene.summary,
              status: scene.status,
              sceneDescription: scene.sceneDescription ?? null,
              keyframePrompt: scene.keyframePrompt ?? null,
              spatialPrompt: scene.spatialPrompt ?? null,
              error: scene.error ?? null,
              updatedAt: now,
            })
            .where(eq(scenes.id, scene.id));
        } else {
          // 插入
          await db.insert(scenes).values({
            id: scene.id,
            projectId: projectId,
            order: scene.order,
            summary: scene.summary,
            status: scene.status,
            sceneDescription: scene.sceneDescription ?? null,
            keyframePrompt: scene.keyframePrompt ?? null,
            spatialPrompt: scene.spatialPrompt ?? null,
            error: scene.error ?? null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      return projectId;
    },

    async load(projectId: string): Promise<ProjectCheckpoint | null> {
      const project = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();

      if (!project) {
        return null;
      }

      const projectScenes = await db.select()
        .from(scenes)
        .where(eq(scenes.projectId, projectId))
        .orderBy(scenes.order)
        .all();

      return {
        projectId: project.id,
        threadId: project.threadId,
        workflowState: project.workflowState as WorkflowState,
        title: project.title,
        summary: project.summary,
        artStyle: project.artStyle,
        protagonist: project.protagonist,
        scenes: projectScenes.map(s => ({
          id: s.id,
          order: s.order,
          summary: s.summary,
          status: s.status as SceneStatus,
          sceneDescription: s.sceneDescription ?? undefined,
          keyframePrompt: s.keyframePrompt ?? undefined,
          spatialPrompt: s.spatialPrompt ?? undefined,
          error: s.error ?? undefined,
        })),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    },

    async list(): Promise<ProjectCheckpoint[]> {
      const allProjects = await db.select().from(projects).all();
      
      const result: ProjectCheckpoint[] = [];
      
      for (const project of allProjects) {
        const projectScenes = await db.select()
          .from(scenes)
          .where(eq(scenes.projectId, project.id))
          .orderBy(scenes.order)
          .all();

        result.push({
          projectId: project.id,
          threadId: project.threadId,
          workflowState: project.workflowState as WorkflowState,
          title: project.title,
          summary: project.summary,
          artStyle: project.artStyle,
          protagonist: project.protagonist,
          scenes: projectScenes.map(s => ({
            id: s.id,
            order: s.order,
            summary: s.summary,
            status: s.status as SceneStatus,
            sceneDescription: s.sceneDescription ?? undefined,
            keyframePrompt: s.keyframePrompt ?? undefined,
            spatialPrompt: s.spatialPrompt ?? undefined,
            error: s.error ?? undefined,
          })),
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
      }

      return result;
    },

    async delete(projectId: string): Promise<void> {
      // 级联删除会自动删除关联的分镜和角色
      await db.delete(projects).where(eq(projects.id, projectId));
    },
  };
}

// 单例 SQLite 存储
let sqliteStore: CheckpointStore | null = null;

export function getSQLiteCheckpointStore(): CheckpointStore {
  if (!sqliteStore) {
    sqliteStore = createSQLiteCheckpointStore();
  }
  return sqliteStore;
}
