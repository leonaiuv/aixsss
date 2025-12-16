import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { CoreExpressionSchema, type CoreExpression } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';

function parseCoreExpression(raw: string): { parsed: CoreExpression; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: CoreExpressionSchema.parse(json), extractedJson };
}

function formatWorldView(items: Array<{ type: string; title: string; content: string; order: number }>): string {
  if (items.length === 0) return '-';
  return items
    .map((it) => `- (${it.order}) [${it.type}] ${it.title}: ${String(it.content ?? '').slice(0, 400)}`)
    .join('\n');
}

function formatCharacters(items: Array<{ name: string; appearance: string; personality: string; background: string }>): string {
  if (items.length === 0) return '-';
  return items
    .map((c) => {
      const parts = [
        c.appearance ? `外观: ${c.appearance}` : '',
        c.personality ? `性格: ${c.personality}` : '',
        c.background ? `背景: ${c.background}` : '',
      ].filter(Boolean);
      return `- ${c.name}${parts.length ? `（${parts.join('；').slice(0, 600)}）` : ''}`;
    })
    .join('\n');
}

function formatNarrativeCausalChain(contextCache: unknown): string {
  if (!contextCache || !isRecord(contextCache)) return '-';
  const chain = contextCache['narrativeCausalChain'];
  if (!chain) return '-';
  try {
    const json = JSON.stringify(chain, null, 2);
    return json.length > 12000 ? json.slice(0, 12000) + '\n...TRUNCATED...' : json;
  } catch {
    return String(chain);
  }
}

function buildPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  episode: { order: number; title: string; summary: string; outline: unknown };
}): string {
  return `你是专业编剧/分镜总监。请基于“全局设定 + 本集概要”，生成该集的「核心表达 Core Expression」。

必须严格输出 **一个 JSON 对象**，不要输出任何 Markdown、代码块、解释文字或多余字符。

全局设定：
- 故事梗概：
${args.storySynopsis}

- 画风（完整提示词）：
${args.artStyle}

- 世界观要素：
${args.worldView}

- 角色库：
${args.characters}

- 叙事因果链（结构化叙事骨架；若提供，请与其保持一致）：
${args.narrativeCausalChain ?? '-'}

本集信息：
- 集数：第 ${args.episode.order} 集
- 标题：${args.episode.title || '-'}
- 一句话概要：${args.episode.summary || '-'}
- Outline（可能是结构化 JSON）：
${JSON.stringify(args.episode.outline ?? null)}

输出 JSON Schema（示意）：
{
  "theme": "一句话主题",
  "emotionalArc": ["起", "承", "转", "合"],
  "coreConflict": "核心冲突描述",
  "payoff": ["爽点/泪点/笑点/信息揭示"],
  "visualMotifs": ["母题1", "母题2"],
  "endingBeat": "结尾落点",
  "nextHook": "下一集钩子（可空）"
}`;
}

function buildJsonFixPrompt(raw: string): string {
  return `你刚才的输出无法被解析为符合要求的 JSON。请只输出一个 JSON 对象，不要输出 Markdown/代码块/解释/多余文字。

要求：
1) 必须是 JSON 对象，且可被 JSON.parse 直接解析
2) emotionalArc 必须是长度为 4 的数组

原始输出：
<<<
${raw?.trim() ?? ''}
>>>

请只输出 JSON：`;
}

export async function generateEpisodeCoreExpression(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, episodeId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: { id: true, order: true, title: true, summary: true, outline: true },
  });
  if (!episode) throw new Error('Episode not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const worldViewElements = await prisma.worldViewElement.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { type: true, title: true, content: true, order: true },
  });

  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { name: true, appearance: true, personality: true, background: true },
  });

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const prompt = buildPrompt({
    storySynopsis: project.summary,
    artStyle: styleFullPrompt(project),
    worldView: formatWorldView(worldViewElements),
    characters: formatCharacters(characters),
    narrativeCausalChain: formatNarrativeCausalChain(project.contextCache),
    episode: { order: episode.order, title: episode.title, summary: episode.summary, outline: episode.outline },
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成核心表达...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);
  let tokenUsage = res.tokenUsage;

  await updateProgress({ pct: 55, message: '解析输出...' });

  let parsed: CoreExpression;
  let extractedJson: string;
  let fixed = false;
  try {
    ({ parsed, extractedJson } = parseCoreExpression(res.content));
  } catch {
    await updateProgress({ pct: 60, message: '尝试修复 JSON 输出...' });
    const fixMessages: ChatMessage[] = [{ role: 'user', content: buildJsonFixPrompt(res.content) }];
    const fixedRes = await chatWithProvider(providerConfig, fixMessages);
    tokenUsage = mergeTokenUsage(tokenUsage, fixedRes.tokenUsage);
    ({ parsed, extractedJson } = parseCoreExpression(fixedRes.content));
    fixed = true;
  }

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      coreExpression: parsed,
      workflowState: 'CORE_EXPRESSION_READY',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeId,
    parsed,
    raw: res.content,
    extractedJson,
    fixed,
    tokenUsage: tokenUsage ?? null,
  };
}
