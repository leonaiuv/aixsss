import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';

function parseSceneList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[).\s-]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function generateSceneList(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, protagonist: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      id: true,
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const prompt = `你是一位专业的分镜师。基于以下信息,将故事拆解为8-12个关键分镜节点:

**故事梗概**:
${project.summary}

**画风**: ${styleFullPrompt(project)}
**主角**: ${project.protagonist}

**要求**:
1. 每个分镜用1句话概括(15-30字)
2. 覆盖起承转合的关键节点
3. 包含情绪转折和视觉冲击点
4. 适合单幅图像表现

**输出格式**(纯文本,每行一个分镜):
1. [分镜描述]
2. [分镜描述]
...

请开始生成:`;

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成分镜列表...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 70, message: '解析与写入分镜...' });

  const summaries = parseSceneList(res.content);
  if (summaries.length < 6) {
    throw new Error('AI 返回分镜数量过少，请重试或调整梗概/画风/主角描述');
  }

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { projectId } }),
    prisma.scene.createMany({
      data: summaries.map((summary, idx) => ({
        projectId,
        order: idx + 1,
        summary,
        status: 'pending',
      })),
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { workflowState: 'SCENE_LIST_EDITING', currentSceneOrder: 0 },
    }),
  ]);

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneCount: summaries.length,
    scenes: summaries.map((summary, idx) => ({ order: idx + 1, summary })),
    tokenUsage: res.tokenUsage ?? null,
  };
}


