"use client";

import { useState, ReactNode } from "react";
import { Settings, Eye, EyeOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/stores/configStore";
import { cn } from "@/lib/utils";

interface ConfigPanelProps {
  trigger?: ReactNode;
}

/**
 * API 配置面板组件
 * 
 * 让用户配置自己的 DeepSeek API Key
 */
export function ConfigPanel({ trigger }: ConfigPanelProps) {
  const { config, isConfigured, setConfig } = useConfigStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);

  const handleSave = () => {
    setConfig(localConfig);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setLocalConfig(config);
    setIsOpen(false);
  };

  return (
    <>
      {/* 触发器 */}
      <div onClick={() => setIsOpen(true)} className="inline-block">
        {trigger || (
          <Button
            variant="ghost"
            size="default"
            className={cn(
              "w-full justify-start gap-2",
              isConfigured ? "text-green-600" : "text-muted-foreground"
            )}
            title={isConfigured ? "API 已配置" : "配置 API"}
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm">API 设置</span>
            {isConfigured && <div className="ml-auto h-2 w-2 rounded-full bg-green-500" />}
          </Button>
        )}
      </div>

      {/* 配置面板 (Modal) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleCancel}>
          <div 
            className="w-96 rounded-lg border bg-background p-6 shadow-xl" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">API 配置</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* API Key */}
            <div className="space-y-2 mb-4">
              <label className="text-sm font-medium">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={localConfig.apiKey}
                  onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-2 mb-4">
              <label className="text-sm font-medium">Base URL</label>
              <input
                type="text"
                value={localConfig.baseURL}
                onChange={(e) => setLocalConfig({ ...localConfig, baseURL: e.target.value })}
                placeholder="https://api.deepseek.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Model */}
            <div className="space-y-2 mb-6">
              <label className="text-sm font-medium">模型</label>
              <select
                value={localConfig.model}
                onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-coder">deepseek-coder</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
              </select>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button onClick={handleSave}>
                <Check className="h-4 w-4 mr-1" />
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
