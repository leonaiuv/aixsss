import { useCallback, useRef, useState } from 'react';
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

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * 用 AlertDialog 替代 window.confirm 的统一确认弹窗（Promise 版）
 */
export function useConfirm() {
  const resolverRef = useRef<((result: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '确认操作',
    description: '',
    confirmText: '确认',
    cancelText: '取消',
    destructive: false,
  });

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions({
      title: nextOptions.title,
      description: nextOptions.description,
      confirmText: nextOptions.confirmText ?? '确认',
      cancelText: nextOptions.cancelText ?? '取消',
      destructive: nextOptions.destructive ?? false,
    });
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const closeWithResult = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const ConfirmDialog = useCallback(() => {
    const actionClassName = options.destructive
      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      : undefined;

    return (
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && open) closeWithResult(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeWithResult(false)}>
              {options.cancelText ?? '取消'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => closeWithResult(true)} className={actionClassName}>
              {options.confirmText ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [
    closeWithResult,
    open,
    options.cancelText,
    options.confirmText,
    options.description,
    options.destructive,
    options.title,
  ]);

  return { confirm, ConfirmDialog };
}
