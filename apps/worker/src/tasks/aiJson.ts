export type ExtractJsonResult =
  | { ok: true; jsonText: string; kind: 'object' | 'array' }
  | { ok: false; reason: 'empty' | 'no-json-start' | 'unterminated' | 'mismatched' };

function findJsonStartIndex(text: string): number {
  const obj = text.indexOf('{');
  const arr = text.indexOf('[');
  if (obj < 0) return arr;
  if (arr < 0) return obj;
  return Math.min(obj, arr);
}

/**
 * 从 LLM 输出中提取第一段完整 JSON（支持 object/array），并使用括号栈匹配：
 * - 能处理前后夹杂解释文字/Markdown
 * - 会忽略字符串中的括号（"{" / "}" 等）
 */
export function extractFirstJson(text: string): ExtractJsonResult {
  const raw = (text ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };

  const start = findJsonStartIndex(raw);
  if (start < 0) return { ok: false, reason: 'no-json-start' };

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escaping = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === '\\') {
        escaping = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack.pop();
      if (!last) return { ok: false, reason: 'mismatched' };
      const ok = (ch === '}' && last === '{') || (ch === ']' && last === '[');
      if (!ok) return { ok: false, reason: 'mismatched' };
      if (stack.length === 0) {
        const jsonText = raw.slice(start, i + 1);
        return { ok: true, jsonText, kind: raw[start] === '{' ? 'object' : 'array' };
      }
    }
  }

  return { ok: false, reason: 'unterminated' };
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function repairCommonJsonIssues(text: string): string {
  let s = stripBom(text.trim());

  // 智能引号 -> 标准引号（常见于模型输出/复制粘贴）
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // 去掉对象/数组中的 trailing comma
  // e.g. { "a": 1, } 或 [1,2,]
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s;
}

export type ParseJsonFromTextOptions = {
  expectedKind?: 'object' | 'array';
};

export function parseJsonFromText(
  text: string,
  options?: ParseJsonFromTextOptions,
): { json: unknown; extractedJson: string } {
  const raw = (text ?? '').trim();
  if (!raw) throw new Error('AI 返回空内容（content 为空），无法解析 JSON');

  // 1) 直接 parse（输出纯 JSON 时最快）
  try {
    const normalized = repairCommonJsonIssues(raw);
    return { json: JSON.parse(normalized) as unknown, extractedJson: normalized };
  } catch {
    // continue
  }

  // 2) 提取第一段完整 JSON 再 parse
  const extracted = extractFirstJson(raw);
  if (!extracted.ok) {
    if (extracted.reason === 'unterminated') {
      throw new Error('AI 输出看起来被截断（JSON 未闭合）。请提高 AI Profile 的 maxTokens，或减少目标集数后重试。');
    }
    if (extracted.reason === 'no-json-start') {
      throw new Error('AI 输出中未找到 JSON 起始符号（{ 或 [）。请检查模型是否按要求输出 JSON。');
    }
    if (extracted.reason === 'empty') {
      throw new Error('AI 返回空内容（content 为空），无法解析 JSON');
    }
    throw new Error('AI 输出包含无法匹配的括号，无法提取完整 JSON');
  }

  if (options?.expectedKind && extracted.kind !== options.expectedKind) {
    throw new Error(`AI 输出 JSON 类型不匹配：期望 ${options.expectedKind}，但提取到 ${extracted.kind}`);
  }

  const repaired = repairCommonJsonIssues(extracted.jsonText);
  try {
    return { json: JSON.parse(repaired) as unknown, extractedJson: repaired };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`AI 输出 JSON.parse 失败：${message}`);
  }
}

