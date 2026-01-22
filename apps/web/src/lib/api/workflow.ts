import { apiRequest } from './http';
import type { ApiAIJob } from './aiJobs';

export async function apiWorkflowPlanEpisodes(input: {
  projectId: string;
  aiProfileId: string;
  targetEpisodeCount?: number;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/episode-plan`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(typeof input.targetEpisodeCount === 'number'
          ? { targetEpisodeCount: input.targetEpisodeCount }
          : {}),
      },
    },
  );
}

export async function apiWorkflowBuildNarrativeCausalChain(input: {
  projectId: string;
  aiProfileId: string;
  phase?: number; // 1-4，不传则自动续接下一阶段
  /**
   * 显式“重新生成”：忽略已有缓存/达标判断，强制重跑对应阶段
   * （用于 UI 的 rerun 按钮）
   */
  force?: boolean;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/narrative-causal-chain`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(typeof input.phase === 'number' ? { phase: input.phase } : {}),
        ...(input.force ? { force: true } : {}),
      },
    },
  );
}

export async function apiWorkflowGenerateEpisodeCoreExpression(input: {
  projectId: string;
  episodeId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/episodes/${encodeURIComponent(
      input.episodeId,
    )}/core-expression`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateEpisodeCoreExpressionBatch(input: {
  projectId: string;
  aiProfileId: string;
  episodeIds?: string[];
  force?: boolean;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/episodes/core-expression/batch`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(Array.isArray(input.episodeIds) && input.episodeIds.length > 0 ? { episodeIds: input.episodeIds } : {}),
        ...(input.force ? { force: true } : {}),
      },
    },
  );
}

export async function apiWorkflowGenerateEpisodeSceneList(input: {
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  sceneCountHint?: number;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/episodes/${encodeURIComponent(
      input.episodeId,
    )}/scene-list`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(typeof input.sceneCountHint === 'number'
          ? { sceneCountHint: input.sceneCountHint }
          : {}),
      },
    },
  );
}

export async function apiWorkflowGenerateSceneList(input: {
  projectId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scene-list`,
    {
      method: 'POST',
      body: { aiProfileId: input.aiProfileId },
    },
  );
}

export async function apiWorkflowGenerateSceneAnchor(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/scene-anchor`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateKeyframePrompt(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/keyframe-prompt`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateStoryboardSceneBible(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/storyboard/scene-bible`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateStoryboardPlan(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  cameraMode?: 'A' | 'B';
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/storyboard/plan`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(input.cameraMode ? { cameraMode: input.cameraMode } : {}),
      },
    },
  );
}

export async function apiWorkflowGenerateStoryboardGroup(input: {
  projectId: string;
  sceneId: string;
  groupId: string;
  aiProfileId: string;
  cameraMode?: 'A' | 'B';
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/storyboard/groups/${encodeURIComponent(input.groupId)}`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(input.cameraMode ? { cameraMode: input.cameraMode } : {}),
      },
    },
  );
}

export async function apiWorkflowTranslateStoryboardPanels(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/storyboard/translate`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowBackTranslateStoryboardPanels(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/storyboard/back-translate`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateKeyframeImages(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/generate-images`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateSceneVideo(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/generate-video`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateMotionPrompt(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/motion-prompt`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowGenerateDialogue(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/dialogue`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowRefineSceneAll(input: {
  projectId: string;
  sceneId: string;
  aiProfileId: string;
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/${encodeURIComponent(
      input.sceneId,
    )}/refine-all`,
    { method: 'POST', body: { aiProfileId: input.aiProfileId } },
  );
}

export async function apiWorkflowRefineAllScenes(input: {
  projectId: string;
  aiProfileId: string;
  sceneIds?: string[];
}) {
  return apiRequest<ApiAIJob>(
    `/workflow/projects/${encodeURIComponent(input.projectId)}/scenes/refine-all`,
    {
      method: 'POST',
      body: {
        aiProfileId: input.aiProfileId,
        ...(input.sceneIds && input.sceneIds.length > 0 ? { sceneIds: input.sceneIds } : {}),
      },
    },
  );
}
