import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

type ExpandState = 'default' | 'all' | 'none';

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function getTypeLabel(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  const t = typeof value;
  if (t === 'object') return `object(${Object.keys(value as Record<string, unknown>).length})`;
  return t;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isExpandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isPlainObject(value);
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return formatJson(value);
}

function valueClassName(value: unknown): string {
  if (typeof value === 'string') return 'text-emerald-700 dark:text-emerald-300';
  if (typeof value === 'number') return 'text-indigo-700 dark:text-indigo-300';
  if (typeof value === 'boolean') return 'text-amber-700 dark:text-amber-300';
  if (value === null) return 'text-muted-foreground';
  if (value === undefined) return 'text-muted-foreground';
  return 'text-foreground';
}

function keyClassName(): string {
  return 'text-sky-700 dark:text-sky-300';
}

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
  expandState: ExpandState;
  expandVersion: number;
}

function JsonNode({
  name,
  value,
  depth,
  defaultExpandDepth,
  expandState,
  expandVersion,
}: JsonNodeProps) {
  const expandable = isExpandable(value);
  const initialOpen =
    expandState === 'all' ? true : expandState === 'none' ? false : depth < defaultExpandDepth;

  const [open, setOpen] = React.useState<boolean>(initialOpen);

  React.useEffect(() => {
    if (expandState === 'all') setOpen(true);
    else if (expandState === 'none') setOpen(false);
    else setOpen(depth < defaultExpandDepth);
  }, [expandVersion, expandState, depth, defaultExpandDepth]);

  const indentStyle = React.useMemo(() => ({ paddingLeft: depth * 12 }), [depth]);

  if (!expandable) {
    return (
      <div className="flex items-start gap-2" style={indentStyle}>
        {name ? (
          <span className={cn('text-xs font-mono', keyClassName())}>{JSON.stringify(name)}</span>
        ) : null}
        {name ? <span className="text-xs text-muted-foreground">:</span> : null}
        <span
          className={cn('text-xs font-mono whitespace-pre-wrap break-words', valueClassName(value))}
        >
          {valueText(value)}
        </span>
      </div>
    );
  }

  const isArrayValue = Array.isArray(value);
  const childEntries: Array<[string, unknown]> = isArrayValue
    ? (value as unknown[]).map((v, idx) => [String(idx), v])
    : Object.entries(value as Record<string, unknown>);

  const summary = isArrayValue ? `[${childEntries.length}]` : `{${childEntries.length}}`;

  return (
    <div>
      <button type="button" className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start gap-2" style={indentStyle}>
          <span className="mt-[1px] text-xs text-muted-foreground select-none">
            {open ? '▾' : '▸'}
          </span>
          {name ? (
            <span className={cn('text-xs font-mono', keyClassName())}>
              {isArrayValue ? `[${name}]` : JSON.stringify(name)}
            </span>
          ) : (
            <span className="text-xs font-mono text-muted-foreground">root</span>
          )}
          {name ? <span className="text-xs text-muted-foreground">:</span> : null}
          <span className="text-xs font-mono text-muted-foreground">{summary}</span>
        </div>
      </button>

      {open ? (
        <div className="mt-1 space-y-1">
          {childEntries.map(([k, v]) => (
            <JsonNode
              key={k}
              name={k}
              value={v}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              expandState={expandState}
              expandVersion={expandVersion}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface JsonViewerProps {
  value: unknown;
  className?: string;
  defaultExpandDepth?: number;
  maxHeightClassName?: string;
}

export function JsonViewer({
  value,
  className,
  defaultExpandDepth = 2,
  maxHeightClassName = 'max-h-[60vh]',
}: JsonViewerProps) {
  const [mode, setMode] = React.useState<'tree' | 'raw'>('tree');
  const [expandState, setExpandState] = React.useState<ExpandState>('default');
  const [expandVersion, setExpandVersion] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const jsonText = React.useMemo(() => formatJson(value), [value]);
  const canExpand = isExpandable(value);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默失败：避免在 UI 组件中强耦合 toast
    }
  };

  const handleExpandAll = () => {
    setExpandState('all');
    setExpandVersion((v) => v + 1);
  };

  const handleCollapseAll = () => {
    setExpandState('none');
    setExpandVersion((v) => v + 1);
  };

  return (
    <div className={cn('rounded-lg border bg-muted/30', className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-muted-foreground">JSON</span>
          <span className="text-xs text-muted-foreground truncate">{getTypeLabel(value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode((m) => (m === 'tree' ? 'raw' : 'tree'))}
          >
            {mode === 'tree' ? '原文' : '树形'}
          </Button>
          {mode === 'tree' && canExpand ? (
            <>
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                展开
              </Button>
              <Button variant="outline" size="sm" onClick={handleCollapseAll}>
                折叠
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void handleCopy()} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </Button>
        </div>
      </div>

      <div className={cn('p-3 overflow-auto', maxHeightClassName)}>
        {mode === 'raw' ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
            {jsonText}
          </pre>
        ) : (
          <div className="space-y-1">
            <JsonNode
              value={value}
              depth={0}
              defaultExpandDepth={defaultExpandDepth}
              expandState={expandState}
              expandVersion={expandVersion}
            />
          </div>
        )}
      </div>
    </div>
  );
}

