import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Wand2 } from 'lucide-react';
import type { ChatMessage } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type AgentChatMode = 'build' | 'chat';

export function AgentChatPanel(props: {
  mode: AgentChatMode;
  onModeChange: (mode: AgentChatMode) => void;
  messages: ChatMessage[];
  isRunning: boolean;
  onSend: (text: string) => Promise<void> | void;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => !props.isRunning && input.trim().length > 0,
    [props.isRunning, input],
  );

  useEffect(() => {
    // 新消息自动滚到底（best-effort）
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [props.messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await props.onSend(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">自然语言</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {props.mode === 'build'
                ? '让 Agent 把你的话翻译成“节点/连线”操作'
                : '普通对话（不改动画布）'}
            </div>
          </div>
          <Tabs value={props.mode} onValueChange={(v) => props.onModeChange(v as AgentChatMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="build" className="text-xs">
                <Wand2 className="mr-1 h-3.5 w-3.5" />
                构建
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-xs">
                Chat
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="space-y-3 p-4">
          {props.messages.length === 0 ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              示例：
              <div className="mt-2 space-y-1">
                <div>1) “帮我加一个 LLM 节点，用来把故事梗概润色成 300 字。”</div>
                <div>2) “把世界观节点连接到剧集规划节点。”</div>
                <div>3) “新增一个‘分镜生成’节点并连接到第1集节点。”</div>
              </div>
            </div>
          ) : null}

          {props.messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-background' : 'bg-muted/40',
              )}
            >
              <div className="text-[11px] text-muted-foreground">
                {m.role === 'user' ? '你' : m.role === 'assistant' ? 'Agent' : 'System'}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={props.mode === 'build' ? '描述你想要的节点与连接...' : '和 AI 聊点什么...'}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              // Ctrl/Cmd + Enter 发送
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button onClick={send} disabled={!canSend} className="h-[44px]">
            <Send className="mr-1 h-4 w-4" />
            发送
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">快捷键：Ctrl/Cmd + Enter 发送</div>
      </div>
    </div>
  );
}
