import { useMemo } from 'react';
import type { DurationEstimate, Scene } from '@/types';
import { Progress } from '@/components/ui/progress';
import { Timer } from 'lucide-react';

function parseDuration(value: unknown): DurationEstimate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.totalSeconds !== 'number') return null;
  return {
    totalSeconds: raw.totalSeconds,
    ...(Array.isArray(raw.shotSeconds)
      ? { shotSeconds: raw.shotSeconds.filter((x): x is number => typeof x === 'number') }
      : {}),
    ...(typeof raw.confidence === 'number' ? { confidence: raw.confidence } : {}),
    ...(typeof raw.rationale === 'string' ? { rationale: raw.rationale } : {}),
  };
}

export function DurationEstimateBar(props: { scene: Scene; targetSeconds?: number }) {
  const { scene, targetSeconds = 12 } = props;

  const estimate = useMemo(
    () => parseDuration(scene.durationEstimateJson),
    [scene.durationEstimateJson],
  );

  if (!estimate) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        暂无时长估算结果。
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, (estimate.totalSeconds / targetSeconds) * 100));
  const minutes = estimate.totalSeconds / 60;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4" />
          <span>时长估算</span>
        </div>
        <span className="font-medium">
          {estimate.totalSeconds.toFixed(1)}s ({minutes.toFixed(2)}min)
        </span>
      </div>
      <Progress value={progress} />
      {estimate.rationale ? <p className="text-xs text-muted-foreground">{estimate.rationale}</p> : null}
    </div>
  );
}
