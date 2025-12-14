export type JSONObject = Record<string, unknown>;

export type ParseFirstJSONObjectResult =
  | { ok: true; raw: string; value: JSONObject }
  | {
      ok: false;
      reason: 'no_json_object' | 'invalid_json' | 'not_object';
      error?: unknown;
      candidates?: string[];
    };

function isJSONObject(value: unknown): value is JSONObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function extractTopLevelJsonObjects(text: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function extractFencedCodeBlocks(text: string): string[] {
  const results: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(re)) {
    results.push((match[1] ?? '').trim());
  }
  return results;
}

function collectCandidates(text: string): string[] {
  const fencedBlocks = extractFencedCodeBlocks(text);
  const fromFences: string[] = [];

  for (const block of fencedBlocks) {
    fromFences.push(block);
    fromFences.push(...extractTopLevelJsonObjects(block));
  }

  const fromFullText = extractTopLevelJsonObjects(text);
  return uniqueStrings([...fromFences, ...fromFullText]);
}

export function parseFirstJSONObject(text: string): ParseFirstJSONObjectResult {
  const candidates = collectCandidates(text);
  if (candidates.length === 0) {
    return { ok: false, reason: 'no_json_object' };
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!isJSONObject(parsed)) {
        lastError = new Error('Parsed JSON is not an object');
        continue;
      }
      return { ok: true, raw: candidate, value: parsed };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  return {
    ok: false,
    reason: lastError instanceof Error && lastError.message.includes('not an object') ? 'not_object' : 'invalid_json',
    error: lastError,
    candidates: candidates.slice(0, 3),
  };
}

