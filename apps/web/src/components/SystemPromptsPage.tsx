import { useCallback, useEffect, useMemo, useState } from 'react';
import { isApiMode } from '@/lib/runtime/mode';
import type { ApiSystemPrompt } from '@/lib/api/systemPrompts';
import { AIFactory } from '@/lib/ai/factory';
import {
  listSystemPrompts,
  resetSystemPromptContent,
  saveSystemPromptContent,
} from '@/lib/systemPrompts';
import { useConfigStore } from '@/stores/configStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, RefreshCw, Save, Wand2 } from 'lucide-react';

type SystemPromptViewItem = {
  key: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  defaultContent: string;
  createdAt: string | null;
  updatedAt: string | null;
};

function stripOuterCodeFence(text: string): string {
  const t = (text ?? '').trim();
  const m = t.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  return (m ? m[1] : t).trim();
}

const OPTIMIZER_SYSTEM_PROMPT = [
  '你是资深 Prompt Engineer。',
  '你的任务是优化“系统提示词”文本，使其更清晰、可执行、约束明确，减少歧义，提高输出格式稳定性。',
  '',
  '要求：',
  '1) 保留原意：不要改变任务目标与输出格式要求。',
  '2) 不要引入新的占位符或依赖外部上下文。',
  '3) 优先使用条目化结构，明确“必须/禁止/只输出”等强约束。',
  '4) 不要输出解释、不要 Markdown、不要代码块；只输出优化后的“系统提示词正文”。',
].join('\n');

const OPTIMIZER_SYSTEM_PROMPT_KEY = 'ui.system_prompts.optimizer.system';

function buildOptimizerUserPrompt(args: {
  key: string;
  title: string;
  description: string | null;
  category: string;
  currentContent: string;
}) {
  return [
    '系统提示词元信息：',
    `- key: ${args.key}`,
    `- title: ${args.title}`,
    `- category: ${args.category}`,
    args.description ? `- description: ${args.description}` : '',
    '',
    '当前系统提示词：',
    '<<<',
    args.currentContent.trim(),
    '>>>',
    '',
    '请输出优化后的系统提示词正文：',
  ]
    .filter(Boolean)
    .join('\n');
}

function toViewItemsFromApi(items: ApiSystemPrompt[]): SystemPromptViewItem[] {
  return items.map((it) => ({
    key: it.key,
    title: it.title,
    description: it.description ?? null,
    category: it.category,
    content: it.content,
    defaultContent: it.defaultContent,
    createdAt: it.createdAt ?? null,
    updatedAt: it.updatedAt ?? null,
  }));
}

export function SystemPromptsPage() {
  const { toast } = useToast();
  const apiMode = isApiMode();

  const config = useConfigStore((s) => s.config);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SystemPromptViewItem[]>([]);
  const [draftByKey, setDraftByKey] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [optimizingKey, setOptimizingKey] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSystemPrompts();
      const next = toViewItemsFromApi(data);
      setItems(next);
      setDraftByKey(Object.fromEntries(next.map((it) => [it.key, it.content])));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: '加载失败', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.key}\n${it.title}\n${it.description ?? ''}\n${it.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, SystemPromptViewItem[]>();
    for (const it of filtered) {
      const key = it.category || 'other';
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => a.key.localeCompare(b.key));
      map.set(k, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleChangeDraft = useCallback((key: string, value: string) => {
    setDraftByKey((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(
    async (key: string) => {
      const draft = (draftByKey[key] ?? '').trim();
      if (!draft) {
        toast({ title: '提示词不能为空', variant: 'destructive' });
        return;
      }

      setSavingKey(key);
      try {
        const updated = await saveSystemPromptContent(key, draft);
        setItems((prev) =>
          prev.map((it) => (it.key === key ? { ...it, ...toViewItemsFromApi([updated])[0] } : it)),
        );
        toast({ title: apiMode ? '已保存到后端' : '已保存到本地', description: key });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: '保存失败', description: message, variant: 'destructive' });
      } finally {
        setSavingKey(null);
      }
    },
    [apiMode, draftByKey, toast],
  );

  const handleResetToDefault = useCallback(
    async (key: string) => {
      const target = items.find((it) => it.key === key);
      if (!target) return;

      const nextDraft = target.defaultContent;
      setDraftByKey((prev) => ({ ...prev, [key]: nextDraft }));

      setSavingKey(key);
      try {
        const updated = await resetSystemPromptContent(key);
        setItems((prev) =>
          prev.map((it) => (it.key === key ? { ...it, ...toViewItemsFromApi([updated])[0] } : it)),
        );
        toast({ title: apiMode ? '已重置为默认并保存到后端' : '已重置为默认（本地）', description: key });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: '重置失败', description: message, variant: 'destructive' });
      } finally {
        setSavingKey(null);
      }
    },
    [apiMode, items, toast],
  );

  const handleOptimize = useCallback(
    async (key: string) => {
      if (!config) {
        toast({
          title: '请先配置 AI',
          description: '在侧边栏的“AI 设置”中选择可用配置。',
          variant: 'destructive',
        });
        return;
      }

      const item = items.find((it) => it.key === key);
      if (!item) return;

      const currentContent = (draftByKey[key] ?? item.content ?? '').trim();
      if (!currentContent) {
        toast({ title: '提示词不能为空', variant: 'destructive' });
        return;
      }

      setOptimizingKey(key);
      try {
        const client = AIFactory.createClient(config);
        const optimizerItem = items.find((it) => it.key === OPTIMIZER_SYSTEM_PROMPT_KEY);
        const optimizerSystemPrompt = (
          draftByKey[OPTIMIZER_SYSTEM_PROMPT_KEY] ?? optimizerItem?.content ?? OPTIMIZER_SYSTEM_PROMPT
        ).trim();

        const res = await client.chat([
          { role: 'system', content: optimizerSystemPrompt },
          {
            role: 'user',
            content: buildOptimizerUserPrompt({
              key: item.key,
              title: item.title,
              description: item.description,
              category: item.category,
              currentContent,
            }),
          },
        ]);
        const improved = stripOuterCodeFence(res.content);
        if (!improved.trim()) throw new Error('AI 返回空内容');
        setDraftByKey((prev) => ({ ...prev, [key]: improved }));
        toast({ title: '已生成优化版本', description: '请检查后再保存。' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({ title: 'AI 优化失败', description: message, variant: 'destructive' });
      } finally {
        setOptimizingKey(null);
      }
    },
    [config, draftByKey, items, toast],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">系统提示词</h1>
          <p className="text-sm text-muted-foreground">
            管理系统内置提示词（system/user）。{apiMode ? '保存到后端，影响后端链路。' : '保存到浏览器本地，影响本地链路。'}每条提示词下方会标注影响产物与下游链路。
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">刷新</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">搜索</CardTitle>
          <CardDescription>按 key / 标题 / 分类过滤</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="例如：scene_anchor / action_beats"
          />
        </CardContent>
      </Card>

      {grouped.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">暂无结果</CardTitle>
            <CardDescription>请尝试更换关键词。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, list]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{category}</CardTitle>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Accordion type="multiple" className="w-full">
                  {list.map((it) => {
                    const draft = draftByKey[it.key] ?? it.content;
                    const isModified = (draft ?? '').trim() !== (it.defaultContent ?? '').trim();
                    const busy = savingKey === it.key || optimizingKey === it.key;

                    return (
                      <AccordionItem key={it.key} value={it.key}>
                        <AccordionTrigger>
                          <div className="flex w-full items-center gap-2 pr-2">
                            <span className="truncate">{it.title}</span>
                            {isModified && <Badge variant="outline">已改动</Badge>}
                            <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                              {it.key}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {it.description ? (
                              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                {it.description}
                              </p>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{it.key}</span>
                              <span>·</span>
                              <span>{it.category}</span>
                              {it.updatedAt ? (
                                <>
                                  <span>·</span>
                                  <span>updated: {it.updatedAt}</span>
                                </>
                              ) : null}
                            </div>

                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">当前（可编辑）</span>
                                </div>
                                <Textarea
                                  value={draft}
                                  onChange={(e) => handleChangeDraft(it.key, e.target.value)}
                                  rows={14}
                                  className="font-mono text-xs leading-5"
                                  disabled={busy}
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">默认（只读）</span>
                                </div>
                                <ScrollArea className="h-[336px] rounded-md border bg-muted/30 p-3">
                                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                                    {it.defaultContent}
                                  </pre>
                                </ScrollArea>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => void handleSave(it.key)}
                                disabled={busy}
                              >
                                {savingKey === it.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                                <span className="ml-2">保存</span>
                              </Button>

                              <Button
                                variant="outline"
                                onClick={() => void handleOptimize(it.key)}
                                disabled={busy}
                              >
                                {optimizingKey === it.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Wand2 className="h-4 w-4" />
                                )}
                                <span className="ml-2">AI 优化</span>
                              </Button>

                              <Button
                                variant="outline"
                                onClick={() => handleChangeDraft(it.key, it.defaultContent)}
                                disabled={busy}
                              >
                                填充默认
                              </Button>

                              <Button
                                variant="destructive"
                                onClick={() => setResetKey(it.key)}
                                disabled={busy}
                              >
                                重置并保存
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={resetKey !== null}
        onOpenChange={(open) => setResetKey(open ? resetKey : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置为默认？</AlertDialogTitle>
            <AlertDialogDescription>
              将把该条提示词恢复为默认内容，并立即
              {apiMode ? '保存到后端（下一次后端调用起生效）' : '保存到本地（浏览器）'}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetKey(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const key = resetKey;
                setResetKey(null);
                if (key) void handleResetToDefault(key);
              }}
            >
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
