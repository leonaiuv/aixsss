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
