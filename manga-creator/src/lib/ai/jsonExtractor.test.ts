import { describe, expect, it } from 'vitest';
import { parseFirstJSONObject } from '@/lib/ai/jsonExtractor';

describe('jsonExtractor', () => {
  it('应解析纯 JSON 对象', () => {
    const res = parseFirstJSONObject('{"a":1,"b":"x"}');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.a).toBe(1);
    expect(res.value.b).toBe('x');
  });

  it('应从 Markdown code fence 中解析 JSON', () => {
    const text = '这里是结果：\n```json\n{\n  "name": "A",\n  "x": 1\n}\n```\n谢谢';
    const res = parseFirstJSONObject(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.name).toBe('A');
    expect(res.value.x).toBe(1);
  });

  it('应选择第一个可解析的 JSON 对象（避免贪婪匹配）', () => {
    const text = 'A={"a":1}\nB={"b":2}';
    const res = parseFirstJSONObject(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({ a: 1 });
  });

  it('应忽略字符串中的大括号并正确提取对象', () => {
    const text = 'prefix {"a":"{not-json}","b":2} suffix';
    const res = parseFirstJSONObject(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.a).toBe('{not-json}');
    expect(res.value.b).toBe(2);
  });

  it('无 JSON 时应返回 no_json_object', () => {
    const res = parseFirstJSONObject('no json here');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no_json_object');
  });
});

