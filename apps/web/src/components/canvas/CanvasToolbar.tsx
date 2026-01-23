/**
 * 画布工具栏组件
 * 提供撤销/重做、自动布局、框选、删除、缩放等操作
 */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Undo2,
  Redo2,
  LayoutGrid,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer2,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useCanvasStore,
  selectCanUndo,
  selectCanRedo,
  selectSelectedNodes,
} from '@/stores/canvasStore';
import { applyLayout } from '@/lib/canvas/layout';
import { alignNodesHorizontally, alignNodesVertically } from '@/lib/canvas/layout';

// ==========================================
// 工具栏按钮
// ==========================================

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
}

function ToolbarButton({ icon, label, onClick, disabled, shortcut }: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{label}</p>
          {shortcut && <p className="text-xs text-muted-foreground">{shortcut}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ==========================================
// CanvasToolbar 组件
// ==========================================

export function CanvasToolbar() {
  const reactFlowInstance = useReactFlow();

  // Store 状态
  const canUndo = useCanvasStore(selectCanUndo);
  const canRedo = useCanvasStore(selectCanRedo);
  const selectedNodes = useCanvasStore(selectSelectedNodes);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const deleteSelectedNodes = useCanvasStore((s) => s.deleteSelectedNodes);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const pushHistory = useCanvasStore((s) => s.pushHistory);

  // 撤销
  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  // 重做
  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  // 自动布局
  const handleAutoLayout = useCallback(() => {
    pushHistory('自动布局');
    const layoutedNodes = applyLayout(nodes, edges, { direction: 'LR' });
    setNodes(layoutedNodes);

    // 适应视图
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [nodes, edges, setNodes, pushHistory, reactFlowInstance]);

  // 删除选中
  const handleDelete = useCallback(() => {
    if (selectedNodes.length > 0) {
      deleteSelectedNodes();
    }
  }, [selectedNodes, deleteSelectedNodes]);

  // 放大
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn({ duration: 200 });
  }, [reactFlowInstance]);

  // 缩小
  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut({ duration: 200 });
  }, [reactFlowInstance]);

  // 适应视图
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
  }, [reactFlowInstance]);

  // 水平对齐
  const handleAlignHorizontal = useCallback(() => {
    if (selectedNodes.length < 2) return;
    pushHistory('水平对齐');
    const alignedNodes = alignNodesHorizontally(selectedNodes);
    const alignedIds = new Set(alignedNodes.map((n) => n.id));
    const updatedNodes = nodes.map((n) => {
      if (alignedIds.has(n.id)) {
        const aligned = alignedNodes.find((an) => an.id === n.id);
        return aligned ?? n;
      }
      return n;
    });
    setNodes(updatedNodes);
  }, [selectedNodes, nodes, setNodes, pushHistory]);

  // 垂直对齐
  const handleAlignVertical = useCallback(() => {
    if (selectedNodes.length < 2) return;
    pushHistory('垂直对齐');
    const alignedNodes = alignNodesVertically(selectedNodes);
    const alignedIds = new Set(alignedNodes.map((n) => n.id));
    const updatedNodes = nodes.map((n) => {
      if (alignedIds.has(n.id)) {
        const aligned = alignedNodes.find((an) => an.id === n.id);
        return aligned ?? n;
      }
      return n;
    });
    setNodes(updatedNodes);
  }, [selectedNodes, nodes, setNodes, pushHistory]);

  const hasSelection = selectedNodes.length > 0;
  const hasMultiSelection = selectedNodes.length >= 2;

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 px-2 py-1 shadow-sm backdrop-blur-sm">
      {/* 撤销/重做 */}
      <ToolbarButton
        icon={<Undo2 className="h-4 w-4" />}
        label="撤销"
        shortcut="⌘Z"
        onClick={handleUndo}
        disabled={!canUndo}
      />
      <ToolbarButton
        icon={<Redo2 className="h-4 w-4" />}
        label="重做"
        shortcut="⌘⇧Z"
        onClick={handleRedo}
        disabled={!canRedo}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* 布局 */}
      <ToolbarButton
        icon={<LayoutGrid className="h-4 w-4" />}
        label="自动布局"
        onClick={handleAutoLayout}
        disabled={nodes.length === 0}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* 对齐 */}
      <ToolbarButton
        icon={<AlignHorizontalJustifyCenter className="h-4 w-4" />}
        label="水平对齐"
        onClick={handleAlignHorizontal}
        disabled={!hasMultiSelection}
      />
      <ToolbarButton
        icon={<AlignVerticalJustifyCenter className="h-4 w-4" />}
        label="垂直对齐"
        onClick={handleAlignVertical}
        disabled={!hasMultiSelection}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* 删除 */}
      <ToolbarButton
        icon={<Trash2 className="h-4 w-4" />}
        label="删除选中"
        shortcut="Delete"
        onClick={handleDelete}
        disabled={!hasSelection}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* 缩放 */}
      <ToolbarButton
        icon={<ZoomOut className="h-4 w-4" />}
        label="缩小"
        shortcut="⌘-"
        onClick={handleZoomOut}
      />
      <ToolbarButton
        icon={<ZoomIn className="h-4 w-4" />}
        label="放大"
        shortcut="⌘+"
        onClick={handleZoomIn}
      />
      <ToolbarButton
        icon={<Maximize2 className="h-4 w-4" />}
        label="适应视图"
        onClick={handleFitView}
      />

      {/* 选择信息 */}
      {hasSelection && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
            <MousePointer2 className="h-3 w-3" />
            已选 {selectedNodes.length}
          </span>
        </>
      )}
    </div>
  );
}
