import { z } from "zod";
import { jsonSchema } from "ai";

// 使用 jsonSchema 直接定义，避免 zod 转换问题
export const generateScenesSchema = jsonSchema<{
  title: string;
  summary: string;
  artStyle: string;
  protagonist: string;
  count: number;
}>({
  type: "object",
  properties: {
    title: { type: "string", description: "Project title" },
    summary: { type: "string", description: "Story summary" },
    artStyle: { type: "string", description: "Art style description" },
    protagonist: { type: "string", description: "Protagonist description" },
    count: { type: "number", description: "Number of scenes to generate, recommended 8", minimum: 1, maximum: 20 },
  },
  required: ["title", "summary", "artStyle", "protagonist", "count"],
});

export const refineSceneSchema = jsonSchema<{
  sceneId: string;
  sceneSummary: string;
  artStyle: string;
  protagonist: string;
  projectTitle: string;
}>({
  type: "object",
  properties: {
    sceneId: { type: "string", description: "Unique identifier for the scene" },
    sceneSummary: { type: "string", description: "Summary of the scene content" },
    artStyle: { type: "string", description: "Art style to apply" },
    protagonist: { type: "string", description: "Protagonist details" },
    projectTitle: { type: "string", description: "Title of the project" },
  },
  required: ["sceneId", "sceneSummary", "artStyle", "protagonist", "projectTitle"],
});

export const batchRefineScenesSchema = jsonSchema<{
  scenes: Array<{ sceneId: string; sceneSummary: string }>;
  artStyle: string;
  protagonist: string;
  projectTitle: string;
}>({
  type: "object",
  properties: {
    scenes: {
      type: "array",
      description: "List of scenes to refine",
      items: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "ID of the scene to refine" },
          sceneSummary: { type: "string", description: "Summary of the scene" },
        },
        required: ["sceneId", "sceneSummary"],
      },
    },
    artStyle: { type: "string", description: "Art style to apply" },
    protagonist: { type: "string", description: "Protagonist details" },
    projectTitle: { type: "string", description: "Title of the project" },
  },
  required: ["scenes", "artStyle", "protagonist", "projectTitle"],
});

export const exportPromptsSchema = jsonSchema<{
  format: "json" | "txt" | "csv";
  projectData: {
    title: string;
    artStyle: string;
    scenes: Array<{
      order: number;
      summary: string;
      sceneDescription?: string;
      keyframePrompt?: string;
      spatialPrompt?: string;
      fullPrompt?: string;
    }>;
  };
}>({
  type: "object",
  properties: {
    format: { type: "string", enum: ["json", "txt", "csv"], description: "Format to export the prompts in" },
    projectData: {
      type: "object",
      description: "Project data to export",
      properties: {
        title: { type: "string" },
        artStyle: { type: "string" },
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number" },
              summary: { type: "string" },
              sceneDescription: { type: "string" },
              keyframePrompt: { type: "string" },
              spatialPrompt: { type: "string" },
              fullPrompt: { type: "string" },
            },
            required: ["order", "summary"],
          },
        },
      },
      required: ["title", "artStyle", "scenes"],
    },
  },
  required: ["format", "projectData"],
});

// 类型定义
export type GenerateScenesInput = {
  title: string;
  summary: string;
  artStyle: string;
  protagonist: string;
  count: number;
};

export type RefineSceneInput = {
  sceneId: string;
  sceneSummary: string;
  artStyle: string;
  protagonist: string;
  projectTitle: string;
};

export type BatchRefineScenesInput = {
  scenes: Array<{ sceneId: string; sceneSummary: string }>;
  artStyle: string;
  protagonist: string;
  projectTitle: string;
};

export type ExportPromptsInput = {
  format: "json" | "txt" | "csv";
  projectData: {
    title: string;
    artStyle: string;
    scenes: Array<{
      order: number;
      summary: string;
      sceneDescription?: string;
      keyframePrompt?: string;
      spatialPrompt?: string;
      fullPrompt?: string;
    }>;
  };
};
