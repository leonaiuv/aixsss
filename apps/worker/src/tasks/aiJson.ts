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
      throw new Error(
        'AI 输出被截断（JSON 未闭合）。\n' +
        '【可能原因】\n' +
        '  1. maxTokens 设置过低，AI 输出在中途被截断\n' +
        '  2. 请求的内容过于复杂，超出模型单次输出能力\n' +
        '【解决方案】\n' +
        '  → 在「设置 → AI 配置档案」中提高 maxTokens（建议 ≥ 8000）\n' +
        '  → 或减少目标集数 / 简化故事复杂度后重试'
      );
    }
    if (extracted.reason === 'no-json-start') {
      throw new Error(
        'AI 输出中未找到 JSON 起始符号。\n' +
        '【可能原因】\n' +
        '  1. 模型未按要求输出 JSON 格式\n' +
        '  2. 模型输出了解释性文字而非结构化数据\n' +
        '【解决方案】\n' +
        '  → 检查模型是否支持 JSON 输出模式\n' +
        '  → 尝试更换为更稳定的模型（如 gpt-4o / claude-3.5-sonnet）'
      );
    }
    if (extracted.reason === 'empty') {
      throw new Error(
        'AI 返回空内容。\n' +
        '【可能原因】\n' +
        '  1. API 请求被拒绝或超时\n' +
        '  2. 模型触发了内容安全过滤\n' +
        '  3. API Key 额度不足或已过期\n' +
        '【解决方案】\n' +
        '  → 检查 AI 配置档案中的 API Key 是否有效\n' +
        '  → 查看供应商控制台确认额度状态'
      );
    }
    throw new Error(
      'AI 输出格式异常（括号不匹配）。\n' +
      '【可能原因】模型输出的 JSON 存在语法错误（如多余逗号、缺少引号）\n' +
      '【解决方案】尝试重新生成，或切换到更稳定的模型'
    );
  }

  if (options?.expectedKind && extracted.kind !== options.expectedKind) {
    throw new Error(
      `AI 输出 JSON 类型不匹配。\n` +
      `【详情】期望 ${options.expectedKind === 'object' ? '对象 {}' : '数组 []'}，但实际输出为 ${extracted.kind === 'object' ? '对象 {}' : '数组 []'}\n` +
      `【解决方案】重新生成，或检查 Prompt 是否明确要求输出格式`
    );
  }

  const repaired = repairCommonJsonIssues(extracted.jsonText);
  try {
    return { json: JSON.parse(repaired) as unknown, extractedJson: repaired };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `AI 输出 JSON 解析失败。\n` +
      `【错误详情】${message}\n` +
      `【可能原因】\n` +
      `  1. JSON 中存在未转义的特殊字符（如换行符、引号）\n` +
      `  2. 数字/布尔值格式错误（如 "true" 应为 true）\n` +
      `  3. 尾部多余逗号等语法问题\n` +
      `【解决方案】尝试重新生成`
    );
  }
}

