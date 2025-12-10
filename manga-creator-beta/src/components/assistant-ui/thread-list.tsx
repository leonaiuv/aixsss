"use client";

import type { FC } from "react";
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";
import { ArchiveIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const ThreadList: FC = () => {
  return (
    <ThreadListPrimitive.Root className="flex h-full flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-3">项目列表</h2>
        <ThreadListNew />
      </div>
      <div className="flex-1 overflow-y-auto">
        <ThreadListItems />
      </div>
    </ThreadListPrimitive.Root>
  );
};

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button className="w-full" variant="outline">
        <PlusIcon className="h-4 w-4 mr-2" />
        新建项目
      </Button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListItems: FC = () => {
  return <ThreadListPrimitive.Items components={{ ThreadListItem }} />;
};

const ThreadListItem: FC = () => {
  return (
    <ThreadListItemPrimitive.Root className="group flex items-center gap-2 p-3 hover:bg-accent cursor-pointer border-b">
      <ThreadListItemPrimitive.Trigger className="flex-1 text-left truncate">
        <ThreadListItemTitle />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemArchive />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemTitle: FC = () => {
  return (
    <span className="text-sm">
      <ThreadListItemPrimitive.Title fallback="新对话" />
    </span>
  );
};

const ThreadListItemArchive: FC = () => {
  return (
    <ThreadListItemPrimitive.Archive asChild>
      <TooltipIconButton
        className="opacity-0 group-hover:opacity-100 h-7 w-7"
        variant="ghost"
        tooltip="归档"
      >
        <ArchiveIcon className="h-4 w-4" />
      </TooltipIconButton>
    </ThreadListItemPrimitive.Archive>
  );
};
