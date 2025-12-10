"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  Square,
} from "lucide-react";

import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";

import type { FC } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="relative flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto px-4">
        <ThreadPrimitive.If empty>
          <ThreadWelcome />
        </ThreadPrimitive.If>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.If empty={false}>
          <div className="min-h-8 flex-shrink-0" />
        </ThreadPrimitive.If>
      </ThreadPrimitive.Viewport>

      <ThreadScrollToBottom />
      <Composer />
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="滚动到底部"
        variant="outline"
        className="absolute bottom-20 right-4 z-10"
      >
        <ArrowDownIcon className="h-4 w-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-bold mb-2">你好！</h2>
        <p className="text-muted-foreground mb-6">
          我是你的漫剧创作助手，告诉我你想创作的故事吧！
        </p>
        <ThreadSuggestions />
      </div>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  const suggestions = [
    {
      title: "创建新项目",
      prompt: "帮我创建一个新的漫剧项目，主题是赛博朋克风格的都市爱情故事",
    },
    {
      title: "生成分镜",
      prompt: "根据我的故事梗概生成8个分镜",
    },
    {
      title: "细化分镜",
      prompt: "帮我细化第一个分镜，生成详细的场景描述和关键帧提示词",
    },
  ];

  return (
    <div className="grid gap-2">
      {suggestions.map((suggestion, index) => (
        <ThreadPrimitive.Suggestion
          key={index}
          prompt={suggestion.prompt}
          send
          asChild
        >
          <Button variant="outline" className="justify-start text-left h-auto py-3">
            <span className="font-medium">{suggestion.title}</span>
          </Button>
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
};

const Composer: FC = () => {
  return (
    <div className="flex-shrink-0 border-t bg-background px-4 pb-4 pt-2">
      <ComposerPrimitive.Root className="flex gap-2 rounded-lg border bg-background p-2 shadow-sm">
        <ComposerPrimitive.Input
          placeholder="输入消息..."
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          rows={1}
          autoFocus
        />
        <ComposerAction />
      </ComposerPrimitive.Root>
    </div>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="flex items-end gap-1">
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="发送消息"
            side="top"
            type="submit"
            variant="default"
            size="icon"
            className="h-8 w-8"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>

      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="h-8 w-8"
          >
            <Square className="h-4 w-4" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </div>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="py-4">
      <div className="max-w-[85%]">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-1">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="复制">
          <MessagePrimitive.If copied>
            <CheckIcon className="h-4 w-4" />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon className="h-4 w-4" />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="重新生成">
          <RefreshCwIcon className="h-4 w-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="flex justify-end py-4">
      <div className="max-w-[85%] rounded-lg bg-primary px-4 py-2 text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
      <div className="ml-2 flex flex-col items-center gap-1">
        <UserActionBar />
        <BranchPicker />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="编辑">
          <PencilIcon className="h-4 w-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <div className="py-4">
      <ComposerPrimitive.Root className="rounded-lg border bg-muted p-2">
        <ComposerPrimitive.Input
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          autoFocus
        />

        <div className="mt-2 flex justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              取消
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">更新</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const BranchPicker: FC<{ className?: string }> = ({ className }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="上一个" className="h-6 w-6">
          <ChevronLeftIcon className="h-3 w-3" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="下一个" className="h-6 w-6">
          <ChevronRightIcon className="h-3 w-3" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
