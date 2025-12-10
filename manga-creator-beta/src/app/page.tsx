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
import { useConfigStore } from "@/stores/configStore";

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
  const { isConfigured } = useConfigStore();

  // 自定义 fetch 拦截 developer 角色，并动态注入最新的配置 headers
  const customFetch: typeof fetch = async (input, init) => {
    // 使用 getState() 动态获取最新配置（避免闭包问题）
    const currentConfig = useConfigStore.getState().config;
    const headers = {
      'X-API-Key': currentConfig.apiKey,
      'X-Base-URL': currentConfig.baseURL,
      'X-Model': currentConfig.model,
    };

    // 合并 headers
    const newInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...headers,
      },
    };

    if (newInit.body && typeof newInit.body === 'string') {
      try {
        const data = JSON.parse(newInit.body);
        if (data.messages) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.messages = data.messages.map((msg: any) => ({
            ...msg,
            role: msg.role === 'developer' ? 'system' : msg.role,
          }));
          newInit.body = JSON.stringify(data);
        }
      } catch {}
    }
    return fetch(input, newInit);
  };

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      fetch: customFetch,
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
        right={
          isConfigured ? (
            <Thread />
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-muted-foreground">
                <p className="text-sm mb-2">请先配置 API Key</p>
                <p className="text-xs">点击左下角的设置按钮</p>
              </div>
            </div>
          )
        }
      />
    </AssistantRuntimeProvider>
  );
}
