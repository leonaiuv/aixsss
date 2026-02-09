import { useMemo } from 'react';
import type { Scene, SoundDesign } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Volume2 } from 'lucide-react';

function parseSoundDesign(value: unknown): SoundDesign | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const cues = Array.isArray(raw.cues)
    ? raw.cues
        .map((item) =>
          item && typeof item === 'object' ? (item as Record<string, unknown>) : null,
        )
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          type: typeof item.type === 'string' ? item.type : 'sfx',
          cue: typeof item.cue === 'string' ? item.cue : '',
          ...(typeof item.timing === 'string' ? { timing: item.timing } : {}),
          ...(typeof item.intensity === 'number' ? { intensity: item.intensity } : {}),
          ...(typeof item.note === 'string' ? { note: item.note } : {}),
        }))
        .filter((item) => item.cue.trim().length > 0)
    : [];
  return {
    ...(typeof raw.ambience === 'string' ? { ambience: raw.ambience } : {}),
    ...(typeof raw.musicTheme === 'string' ? { musicTheme: raw.musicTheme } : {}),
    cues,
    ...(typeof raw.mixNotes === 'string' ? { mixNotes: raw.mixNotes } : {}),
  };
}

export function SoundDesignPanel(props: {
  scene: Scene;
  onGenerate?: (sceneId: string) => void;
  isGenerating?: boolean;
  canGenerate?: boolean;
}) {
  const { scene, onGenerate, isGenerating = false, canGenerate = true } = props;

  const soundDesign = useMemo(
    () => parseSoundDesign(scene.soundDesignJson),
    [scene.soundDesignJson],
  );

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            声音设计
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            为该分镜生成环境音、音乐与关键音效建议。
          </p>
        </div>
        {onGenerate ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onGenerate(scene.id)}
            disabled={isGenerating || !canGenerate}
          >
            {isGenerating ? '生成中...' : 'AI 生成'}
          </Button>
        ) : null}
      </div>

      {soundDesign ? (
        <div className="space-y-3">
          {soundDesign.ambience ? (
            <div className="text-sm">
              <span className="text-muted-foreground">环境基调：</span>
              <span>{soundDesign.ambience}</span>
            </div>
          ) : null}
          {soundDesign.musicTheme ? (
            <div className="text-sm">
              <span className="text-muted-foreground">音乐主题：</span>
              <span>{soundDesign.musicTheme}</span>
            </div>
          ) : null}
          <Separator />
          <div className="space-y-2">
            {soundDesign.cues.length > 0 ? (
              soundDesign.cues.map((cue, index) => (
                <div
                  key={`${cue.type}-${index}`}
                  className="rounded border bg-muted/20 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline">{cue.type}</Badge>
                    {cue.timing ? (
                      <span className="text-muted-foreground">{cue.timing}</span>
                    ) : null}
                  </div>
                  <p>{cue.cue}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">暂无声音 cue。</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未生成声音设计。</p>
      )}
    </div>
  );
}
