import { describe, expect, it } from 'vitest';
import { extractFirstJson, parseJsonFromText } from './aiJson.js';

describe('aiJson', () => {
  it('extractFirstJson 可从混合文本中提取对象', () => {
    const raw = [
      '当然可以，下面是结果：',
      '```json',
      '{ "a": 1, "b": {"c": 2} }',
      '```',
      '（完）',
    ].join('\n');

    const res = extractFirstJson(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kind).toBe('object');
      expect(JSON.parse(res.jsonText)).toEqual({ a: 1, b: { c: 2 } });
    }
  });

  it('extractFirstJson 会忽略字符串中的括号', () => {
    const raw = `前缀 {"text":"} not end","arr":[1,2,3]} 后缀`;
    const res = extractFirstJson(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(JSON.parse(res.jsonText)).toEqual({ text: '} not end', arr: [1, 2, 3] });
    }
  });

  it('parseJsonFromText 会修复 trailing comma', () => {
    const raw = `{"a": 1, "b": [1,2,],}`;
    const parsed = parseJsonFromText(raw, { expectedKind: 'object' });
    expect(parsed.json).toEqual({ a: 1, b: [1, 2] });
  });

  it('parseJsonFromText 会修复字符串中未转义的换行/制表符', () => {
    const raw = `{"a":"hello
world\t!"}`;
    const parsed = parseJsonFromText(raw, { expectedKind: 'object' });
    expect(parsed.json).toEqual({ a: 'hello\nworld\t!' });
  });

  it('parseJsonFromText 在 JSON 未闭合时给出可操作提示', () => {
    const raw = `{"a": 1, "b": [1,2,3]`;
    expect(() => parseJsonFromText(raw, { expectedKind: 'object' })).toThrow(/被截断/);
  });
});

