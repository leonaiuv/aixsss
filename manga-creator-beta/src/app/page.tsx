"use client";

import dynamic from "next/dynamic";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";
import {
  CreateProjectToolUI,
  SceneListToolUI,
  SceneDetailToolUI,
  BasicInfoToolUI,
  ExportToolUI,
  BatchRefineToolUI,
  ProjectStateToolUI,
} from "@/components/assistant-ui/tool-uis";

// 动态导入 BlockNote 编辑器，禁用 SSR
const Editor = dynamic(
  () => import("@/components/canvas/Editor").then((mod) => mod.Editor),
  { ssr: false, loading: () => <EditorLoading /> }
);

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm">加载编辑器中...</p>
      </div>
    </div>
  );
}

export default function Home() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* 注册所有工具 UI 组件 */}
      <CreateProjectToolUI />
      <SceneListToolUI />
      <SceneDetailToolUI />
      <BasicInfoToolUI />
      <ExportToolUI />
      <BatchRefineToolUI />
      <ProjectStateToolUI />
      
      <ThreeColumnLayout
        left={<ThreadList />}
        center={<Editor />}
        right={<Thread />}
      />
    </AssistantRuntimeProvider>
  );
}
