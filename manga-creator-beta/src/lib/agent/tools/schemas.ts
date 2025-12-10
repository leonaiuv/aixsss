import { z } from 'zod';

/**
 * 生成分镜工具的输入 Schema
 */
export const generateScenesInputSchema = z.object({
  count: z
    .number()
    .min(6, '至少需要6个分镜')
    .max(15, '最多15个分镜')
    .default(8)
    .describe('期望生成的分镜数量'),
});

export type GenerateScenesInput = z.infer<typeof generateScenesInputSchema>;

/**
 * 细化分镜工具的输入 Schema
 */
export const refineSceneInputSchema = z.object({
  sceneId: z
    .string()
    .min(1, '分镜ID不能为空')
    .describe('要细化的分镜ID'),
});

export type RefineSceneInput = z.infer<typeof refineSceneInputSchema>;

/**
 * 批量细化分镜工具的输入 Schema
 */
export const batchRefineInputSchema = z.object({
  sceneIds: z
    .array(z.string().min(1))
    .min(1, '至少选择一个分镜')
    .describe('要批量细化的分镜ID列表'),
});

export type BatchRefineInput = z.infer<typeof batchRefineInputSchema>;

/**
 * 设置项目信息工具的输入 Schema
 */
export const setProjectInfoInputSchema = z.object({
  title: z
    .string()
    .min(1, '标题不能为空')
    .max(100, '标题最多100个字符')
    .optional()
    .describe('项目标题'),
  summary: z
    .string()
    .max(2000, '简介最多2000个字符')
    .optional()
    .describe('故事简介/梗概'),
  artStyle: z
    .string()
    .max(200, '画风描述最多200个字符')
    .optional()
    .describe('画风风格'),
  protagonist: z
    .string()
    .max(500, '主角描述最多500个字符')
    .optional()
    .describe('主角信息'),
});

export type SetProjectInfoInput = z.infer<typeof setProjectInfoInputSchema>;

/**
 * 导出提示词工具的输入 Schema
 */
export const exportPromptsInputSchema = z.object({
  format: z
    .enum(['json', 'txt', 'csv'])
    .default('json')
    .describe('导出格式'),
  includeMetadata: z
    .boolean()
    .default(true)
    .describe('是否包含元数据'),
});

export type ExportPromptsInput = z.infer<typeof exportPromptsInputSchema>;

/**
 * 创建项目工具的输入 Schema
 */
export const createProjectInputSchema = z.object({
  title: z
    .string()
    .min(1, '标题不能为空')
    .max(100, '标题最多100个字符')
    .describe('项目标题'),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

/**
 * 获取项目状态工具的输入 Schema
 */
export const getProjectStateInputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .optional()
    .describe('项目ID，不传则获取当前项目'),
});

export type GetProjectStateInput = z.infer<typeof getProjectStateInputSchema>;
