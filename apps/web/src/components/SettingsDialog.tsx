import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Construction, Palette, Bell, Globe, Shield, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SETTINGS_SECTIONS = [
  { id: 'general', label: '通用', icon: Globe, available: false },
  { id: 'appearance', label: '外观', icon: Palette, available: false },
  { id: 'notifications', label: '通知', icon: Bell, available: false },
  { id: 'privacy', label: '隐私', icon: Shield, available: false },
  { id: 'shortcuts', label: '快捷键', icon: Keyboard, available: false },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState('general');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl min-h-[400px] p-0 gap-0 overflow-hidden">
        <div className="flex h-full">
          {/* 左侧导航 */}
          <div className="w-48 shrink-0 border-r bg-muted/30 p-3">
            <DialogHeader className="px-3 pb-4">
              <DialogTitle className="text-base">设置</DialogTitle>
            </DialogHeader>
            <nav className="space-y-1">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-muted',
                    activeSection === section.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Construction className="h-8 w-8 text-amber-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">功能开发中</h3>
                  <p className="text-sm text-muted-foreground max-w-[280px]">
                    设置功能正在紧锣密鼓地开发中，敬请期待！
                  </p>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    💡 提示：如需配置 AI 服务，请使用侧边栏的「AI 设置」
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
