import { ReactNode, FC } from 'react';
import { cn } from '@/lib/utils';

export interface ThreeColumnLayoutProps {
  /** 左侧面板内容 - 项目列表 */
  left: ReactNode;
  /** 中间画布内容 - BlockNote 编辑器 */
  center: ReactNode;
  /** 右侧对话内容 - AI Thread */
  right: ReactNode;
  /** 自定义类名 */
  className?: string;
}

/**
 * 三栏布局组件
 *
 * 布局结构：
 * - 左侧：项目列表面板 (宽度固定 280px)
 * - 中间：主编辑画布 (弹性宽度)
 * - 右侧：AI 对话交互栏 (宽度固定 400px)
 */
export const ThreeColumnLayout: FC<ThreeColumnLayoutProps> = ({
  left,
  center,
  right,
  className,
}) => {
  return (
    <div className={cn('flex h-screen w-full overflow-hidden', className)}>
      {/* 左侧面板 - 项目列表 */}
      <aside className="flex h-full w-[280px] flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {left}
      </aside>

      {/* 中间画布 - BlockNote 编辑器 */}
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-gray-800">
        {center}
      </main>

      {/* 右侧对话栏 - AI Thread */}
      <aside className="flex h-full w-[400px] flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {right}
      </aside>
    </div>
  );
};
