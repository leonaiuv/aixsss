import { tool } from "ai";
import { 
  generateScenesSchema, 
  refineSceneSchema, 
  batchRefineScenesSchema, 
  exportPromptsSchema,
  type GenerateScenesInput,
  type RefineSceneInput,
  type BatchRefineScenesInput,
  type ExportPromptsInput
} from "./schemas";
import { generateScenesWithAI, refineSceneWithAI, batchRefineWithAI, formatExportData } from "../services/ai-service";

export const generateScenesTool = tool({
  description: "Generate a list of manga scenes based on story summary",
  inputSchema: generateScenesSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (input: any) => {
    console.log("Executing generateScenesTool", input);
    const result = await generateScenesWithAI(input);
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to generate scenes");
    }
    return result.data;
  },
});

export const refineSceneTool = tool({
  description: "Refine a single scene to generate detailed description and prompts",
  inputSchema: refineSceneSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (input: any) => {
    console.log("Executing refineSceneTool", input.sceneId);
    const result = await refineSceneWithAI(input);
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to refine scene");
    }
    return result.data;
  },
});

export const batchRefineScenesTool = tool({
  description: "Refine multiple scenes in batch",
  inputSchema: batchRefineScenesSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (input: any) => {
    console.log("Executing batchRefineScenesTool", input.scenes.length);
    const { scenes, ...context } = input;
    const result = await batchRefineWithAI(scenes, context);
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to batch refine scenes");
    }
    return result.data;
  },
});

export const exportPromptsTool = tool({
  description: "Export the generated prompts in a specific format",
  inputSchema: exportPromptsSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (input: any) => {
    console.log("Executing exportPromptsTool", input.format);
    const formattedData = formatExportData({
      projectTitle: input.projectData.title,
      artStyle: input.projectData.artStyle,
      scenes: input.projectData.scenes,
      exportedAt: new Date().toISOString()
    }, input.format);
    return { content: formattedData, format: input.format };
  },
});

export const tools = {
  generateScenes: generateScenesTool,
  refineScene: refineSceneTool,
  batchRefineScenes: batchRefineScenesTool,
  exportPrompts: exportPromptsTool,
};
