import { useEffect, useMemo, useState } from 'react';
import type { SceneScriptBlock } from '@/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

function toEditorText(value: SceneScriptBlock[] | null | undefined): string {
  return JSON.stringify(value ?? [], null, 2);
}

function parseEditorText(value: string): SceneScriptBlock[] {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('分场脚本必须是数组');
  return parsed
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      beat: typeof item.beat === 'string' ? item.beat : '',
      ...(typeof item.objective === 'string' ? { objective: item.objective } : {}),
      ...(typeof item.conflict === 'string' ? { conflict: item.conflict } : {}),
      ...(typeof item.turn === 'string' ? { turn: item.turn } : {}),
      ...(typeof item.notes === 'string' ? { notes: item.notes } : {}),
    }))
    .filter((item) => item.beat.trim().length > 0);
}

export function SceneScriptEditor(props: {
  value: SceneScriptBlock[] | null | undefined;
  onSave: (next: SceneScriptBlock[]) => void;
  disabled?: boolean;
}) {
  const { value, onSave, disabled = false } = props;
  const [text, setText] = useState(() => toEditorText(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(toEditorText(value));
    setError(null);
  }, [value]);

  const itemCount = useMemo(() => {
    try {
      return parseEditorText(text).length;
    } catch {
      return 0;
    }
  }, [text]);

  const handleSave = () => {
    try {
      const parsed = parseEditorText(text);
      onSave(parsed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">当前分场数量：{itemCount}</span>
        <Button size="sm" onClick={handleSave} disabled={disabled}>
          保存分场脚本
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[220px] font-mono text-xs"
        placeholder='[{"beat":"开场","objective":"..."},{"beat":"冲突升级"}]'
        disabled={disabled}
      />
      {error ? <p className="text-xs text-destructive">JSON 解析失败：{error}</p> : null}
    </div>
  );
}
