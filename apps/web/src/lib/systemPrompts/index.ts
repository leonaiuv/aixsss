import { SYSTEM_PROMPT_DEFINITION_BY_KEY, SYSTEM_PROMPT_DEFINITIONS } from '@aixsss/shared';
import { apiListSystemPrompts, apiUpdateSystemPrompt, type ApiSystemPrompt } from '@/lib/api/systemPrompts';
import { isApiMode } from '@/lib/runtime/mode';

const LOCAL_OVERRIDES_STORAGE_KEY = 'aixsss.system_prompts.overrides.v1';

type LocalOverride = {
  content: string;
  updatedAt: string;
};

type LocalOverrides = Record<string, LocalOverride>;

function nowIso(): string {
  return new Date().toISOString();
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readLocalOverrides(): LocalOverrides {
  if (typeof localStorage === 'undefined') return {};

  const parsed = safeParseJson<unknown>(localStorage.getItem(LOCAL_OVERRIDES_STORAGE_KEY));
  if (!parsed || typeof parsed !== 'object') return {};

  const record = parsed as Record<string, unknown>;
  const out: LocalOverrides = {};
  for (const [key, value] of Object.entries(record)) {
    if (!SYSTEM_PROMPT_DEFINITION_BY_KEY[key]) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const content = typeof v.content === 'string' ? v.content : '';
    const updatedAt = typeof v.updatedAt === 'string' ? v.updatedAt : '';
    if (!content.trim() || !updatedAt.trim()) continue;
    out[key] = { content, updatedAt };
  }
  return out;
}

function writeLocalOverrides(next: LocalOverrides): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(LOCAL_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore localStorage write errors
  }
}

let apiCache: Map<string, ApiSystemPrompt> | null = null;
let apiListPromise: Promise<ApiSystemPrompt[]> | null = null;

async function loadApiPrompts(): Promise<ApiSystemPrompt[]> {
  if (apiListPromise) return apiListPromise;

  apiListPromise = apiListSystemPrompts()
    .then((items) => {
      apiCache = new Map(items.map((it) => [it.key, it]));
      return items;
    })
    .finally(() => {
      apiListPromise = null;
    });

  return apiListPromise;
}

export function invalidateSystemPromptsCache(): void {
  apiCache = null;
  apiListPromise = null;
}

export async function listSystemPrompts(): Promise<ApiSystemPrompt[]> {
  if (isApiMode()) {
    return loadApiPrompts();
  }

  const overrides = readLocalOverrides();
  return SYSTEM_PROMPT_DEFINITIONS.map((def) => {
    const override = overrides[def.key];
    const content =
      typeof override?.content === 'string' && override.content.trim()
        ? override.content
        : def.defaultContent;
    return {
      key: def.key,
      title: def.title,
      description: def.description ?? null,
      category: def.category,
      content,
      defaultContent: def.defaultContent,
      createdAt: null,
      updatedAt: override?.updatedAt ?? null,
    };
  });
}

export async function getSystemPromptContent(key: string): Promise<string> {
  const def = SYSTEM_PROMPT_DEFINITION_BY_KEY[key];
  if (!def) throw new Error(`Unknown system prompt key: ${key}`);

  if (isApiMode()) {
    if (!apiCache) await loadApiPrompts();
    const content = apiCache?.get(key)?.content;
    if (typeof content === 'string' && content.trim()) return content;
    return def.defaultContent;
  }

  const overrides = readLocalOverrides();
  const content = overrides[key]?.content;
  if (typeof content === 'string' && content.trim()) return content;
  return def.defaultContent;
}

export async function saveSystemPromptContent(key: string, content: string): Promise<ApiSystemPrompt> {
  const def = SYSTEM_PROMPT_DEFINITION_BY_KEY[key];
  if (!def) throw new Error(`Unknown system prompt key: ${key}`);

  const trimmed = (content ?? '').trim();
  if (!trimmed) throw new Error('提示词不能为空');

  if (isApiMode()) {
    const updated = await apiUpdateSystemPrompt(key, { content: trimmed });
    apiCache?.set(key, updated);
    return updated;
  }

  const overrides = readLocalOverrides();
  overrides[key] = { content: trimmed, updatedAt: nowIso() };
  writeLocalOverrides(overrides);

  return {
    key: def.key,
    title: def.title,
    description: def.description ?? null,
    category: def.category,
    content: trimmed,
    defaultContent: def.defaultContent,
    createdAt: null,
    updatedAt: overrides[key].updatedAt,
  };
}

export async function resetSystemPromptContent(key: string): Promise<ApiSystemPrompt> {
  const def = SYSTEM_PROMPT_DEFINITION_BY_KEY[key];
  if (!def) throw new Error(`Unknown system prompt key: ${key}`);

  if (isApiMode()) {
    const updated = await apiUpdateSystemPrompt(key, { content: def.defaultContent });
    apiCache?.set(key, updated);
    return updated;
  }

  const overrides = readLocalOverrides();
  delete overrides[key];
  writeLocalOverrides(overrides);

  return {
    key: def.key,
    title: def.title,
    description: def.description ?? null,
    category: def.category,
    content: def.defaultContent,
    defaultContent: def.defaultContent,
    createdAt: null,
    updatedAt: null,
  };
}

