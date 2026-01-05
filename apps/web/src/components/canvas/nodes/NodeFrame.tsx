import type { PropsWithChildren, ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';

export function NodeFrame({
  title,
  description,
  headerRight,
  className,
  showSource = true,
  showTarget = true,
  children,
}: PropsWithChildren<{
  title: ReactNode;
  description?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
  showSource?: boolean;
  showTarget?: boolean;
}>) {
  return (
    <div
      className={cn(
        'min-w-[260px] rounded-xl border bg-background/90 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      ) : null}

      {showSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      ) : null}

      <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {description ? (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>

      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}
