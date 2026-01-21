import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import AjvModule, { type ErrorObject, type AnySchema } from 'ajv';
const Ajv = AjvModule.default ?? AjvModule;
import type { ChatMessage, GenerationParams, ResponseFormat } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, toProviderChatConfig } from './common.js';

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

function normalizeResponseFormat(input: unknown): ResponseFormat | null {
  if (!isRecord(input)) return null;
  const type = input.type;
  if (type === 'json_object') return { type: 'json_object' };
  if (type !== 'json_schema') return null;

  const jsonSchemaRaw = input.json_schema;
  if (!isRecord(jsonSchemaRaw)) return null;
  const name = typeof jsonSchemaRaw.name === 'string' && jsonSchemaRaw.name.trim() ? jsonSchemaRaw.name.trim() : null;
  const strict = typeof jsonSchemaRaw.strict === 'boolean' ? jsonSchemaRaw.strict : null;
  const schema = isRecord(jsonSchemaRaw.schema) ? (jsonSchemaRaw.schema as Record<string, unknown>) : null;
  if (!name || strict === null || !schema) return null;

  return { type: 'json_schema', json_schema: { name, strict, schema } };
}

function normalizeOverrideParams(input: unknown): GenerationParams | undefined {
  if (!isRecord(input)) return undefined;
  const out: GenerationParams = {};
  if (typeof input.temperature === 'number') out.temperature = input.temperature;
  if (typeof input.topP === 'number') out.topP = input.topP;
  if (typeof input.maxTokens === 'number') out.maxTokens = input.maxTokens;
  if (typeof input.presencePenalty === 'number') out.presencePenalty = input.presencePenalty;
  if (typeof input.frequencyPenalty === 'number') out.frequencyPenalty = input.frequencyPenalty;
  const re = input.reasoningEffort;
  if (re === 'none' || re === 'minimal' || re === 'low' || re === 'medium' || re === 'high' || re === 'xhigh') {
    out.reasoningEffort = re;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function llmStructuredTest(args: {
  prisma: PrismaClient;
  teamId: string;
  aiProfileId: string;
  messages: unknown;
  responseFormat: unknown;
  overrideParams?: unknown;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, aiProfileId, messages, responseFormat, overrideParams, apiKeySecret, updateProgress } = args;

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const normalizedMessages = normalizeMessages(messages);
  if (normalizedMessages.length === 0) throw new Error('Invalid messages');

  const rf = normalizeResponseFormat(responseFormat);
  if (!rf) throw new Error('Invalid responseFormat');

  const overrides = normalizeOverrideParams(overrideParams);

  await updateProgress({ pct: 5, message: '调用 AI（结构化输出）...' });

  const startedAt = Date.now();
  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);

  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;
  providerConfig.responseFormat = rf;
  if (overrides) {
    providerConfig.params = { ...(providerConfig.params ?? {}), ...overrides };
  }

  const res = await chatWithProvider(providerConfig, normalizedMessages);
  const durationMs = Math.max(0, Date.now() - startedAt);

  let jsonOk = false;
  let jsonError: string | null = null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.content);
    jsonOk = true;
  } catch (err) {
    jsonOk = false;
    jsonError = err instanceof Error ? err.message : String(err);
  }

  let schema: { ok: boolean; errors?: string[]; compileError?: string } | null = null;
  if (rf.type === 'json_schema') {
    schema = { ok: false };
    if (!jsonOk) {
      schema = { ok: false, errors: ['JSON 解析失败，无法进行 Schema 校验'] };
    } else {
      try {
        const ajv = new Ajv({ allErrors: true, strict: false });
        const validate = ajv.compile(rf.json_schema.schema as AnySchema);
        const ok = Boolean(validate(parsed));
        if (ok) {
          schema = { ok: true };
        } else {
          const errs = Array.isArray(validate.errors)
            ? validate.errors.map((e: ErrorObject) => {
                const path = e.instancePath || '/';
                const msg = e.message ? ` ${e.message}` : '';
                return `${path}${msg}`.trim();
              })
            : [];
          schema = { ok: false, errors: errs.length ? errs : ['Schema 校验失败（无详细错误）'] };
        }
      } catch (err) {
        schema = { ok: false, compileError: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    content: res.content,
    tokenUsage: res.tokenUsage ?? null,
    durationMs,
    json: { ok: jsonOk, ...(jsonError ? { error: jsonError } : {}) },
    schema,
  };
}
