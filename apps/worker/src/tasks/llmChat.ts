import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { toProviderChatConfig } from './common.js';

function isChatRole(value: unknown): value is ChatMessage['role'] {
  return value === 'system' || value === 'user' || value === 'assistant';
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role;
    const content = rec.content;
    if (!isChatRole(role)) continue;
    if (typeof content !== 'string' || !content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

export async function llmChat(args: {
  prisma: PrismaClient;
  teamId: string;
  aiProfileId: string;
  messages: unknown;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, aiProfileId, messages, apiKeySecret, updateProgress } = args;

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const normalized = normalizeMessages(messages);
  if (normalized.length === 0) throw new Error('Invalid messages');

  await updateProgress({ pct: 5, message: '调用 AI...' });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const res = await chatWithProvider(providerConfig, normalized);

  await updateProgress({ pct: 100, message: '完成' });

  return {
    content: res.content,
    tokenUsage: res.tokenUsage ?? null,
  };
}



