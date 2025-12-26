import { useEffect, useMemo, useState } from 'react';
import type { Character, Scene, WorldViewElement } from '@/types';
import { buildPanelScriptPatch, computePanelMetrics, getPanelScript } from '@/lib/workflowV2';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

const NO_LOCATION = '__none__';

function splitTags(text: string): string[] {
  return text
    .split(/[,\n，、]/gu)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PanelScriptEditor(props: {
  scene: Scene;
  characters: Character[];
  worldViewElements: WorldViewElement[];
  onUpdateScene: (updates: Partial<Scene>) => void;
}) {
  const { scene, characters, worldViewElements, onUpdateScene } = props;

  const panelScript = useMemo(() => getPanelScript(scene), [scene]);
  const metrics = useMemo(() => computePanelMetrics(scene), [scene]);

  const locationId = panelScript.location?.worldViewElementId ?? '';
  const selectedLocation = useMemo(
    () => worldViewElements.find((w) => w.id === locationId) ?? null,
    [worldViewElements, locationId],
  );

  const charactersById = useMemo(() => {
    const map = new Map<string, Character>();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, [characters]);

  const selectedCharacterIds = useMemo(
    () => new Set(panelScript.charactersPresentIds ?? []),
    [panelScript.charactersPresentIds],
  );

  const [propsDraft, setPropsDraft] = useState(panelScript.props?.join(', ') ?? '');

  useEffect(() => {
    setPropsDraft(panelScript.props?.join(', ') ?? '');
  }, [scene.id, panelScript.props]);

  const applyPatch = (patch: Parameters<typeof buildPanelScriptPatch>[1]) => {
    onUpdateScene(buildPanelScriptPatch(scene, patch));
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">分镜脚本（Panel Script）</div>
          <div className="text-xs text-muted-foreground">
            记录“地点/镜头/站位/气泡节奏”等静态漫画关键约束，用于跨集一致性与导出。
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">v1</Badge>
          <Badge variant="secondary">
            气泡 {metrics.dialogueLineCount} · 字 {metrics.dialogueCharCount} ·{' '}
            {metrics.estimatedSeconds}s
          </Badge>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>地点（建议绑定世界观条目）</Label>
          <Select
            value={locationId || NO_LOCATION}
            onValueChange={(value) => {
              if (value === NO_LOCATION) {
                applyPatch({ location: { worldViewElementId: undefined } });
                return;
              }
              const title = worldViewElements.find((w) => w.id === value)?.title;
              applyPatch({
                location: {
                  worldViewElementId: value,
                  ...(title && !panelScript.location?.label ? { label: title } : {}),
                },
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="未绑定地点" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOCATION}>（未绑定）</SelectItem>
              {worldViewElements
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">地点名（手写兜底）</Label>
              <Input
                value={panelScript.location?.label ?? ''}
                placeholder={selectedLocation?.title ?? '例如：旧城巷口'}
                onChange={(e) => applyPatch({ location: { label: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">时间/天气</Label>
              <Input
                value={panelScript.timeOfDay ?? ''}
                placeholder="例如：黄昏、雨夜、清晨"
                onChange={(e) => applyPatch({ timeOfDay: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">地点备注（空间卡/可用机位/动线）</Label>
            <Textarea
              value={panelScript.location?.notes ?? ''}
              placeholder="例如：门口右侧是公告栏，走廊尽头有窗；可用机位：门外逆光/走廊长焦…"
              onChange={(e) => applyPatch({ location: { notes: e.target.value } })}
              className="min-h-[90px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>出场角色（用于连续性统计）</Label>
          {characters.length === 0 ? (
            <div className="text-xs text-muted-foreground">（角色库为空）</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {characters
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
                .map((c) => {
                  const checked = selectedCharacterIds.has(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 rounded border p-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(panelScript.charactersPresentIds ?? []);
                          if (v === true) next.add(c.id);
                          else next.delete(c.id);
                          applyPatch({ charactersPresentIds: Array.from(next) });
                        }}
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  );
                })}
            </div>
          )}
          {panelScript.charactersPresentIds?.some((id) => !charactersById.has(id)) ? (
            <div className="text-xs text-amber-700">
              提示：当前分镜包含已删除/不存在的角色 ID，建议重新勾选一次。
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>镜头（景别/机位/构图）</Label>
          <Textarea
            value={panelScript.camera ?? ''}
            placeholder="例如：中景，低角度，人物在画面左三分之一，背景虚化"
            onChange={(e) => applyPatch({ camera: e.target.value })}
            className="min-h-[120px]"
          />
        </div>
        <div className="space-y-2">
          <Label>站位/视线/道具位置（空间匹配）</Label>
          <Textarea
            value={panelScript.blocking ?? ''}
            placeholder="例如：主角靠窗站右侧，配角在左前景背对；桌面上有文件夹"
            onChange={(e) => applyPatch({ blocking: e.target.value })}
            className="min-h-[120px]"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label>气泡/版面说明（阅读节奏与留白）</Label>
          <Textarea
            value={panelScript.bubbleLayoutNotes ?? ''}
            placeholder="例如：气泡放上方留足头部空间；最后一句断行；右下角留出转场留白"
            onChange={(e) => applyPatch({ bubbleLayoutNotes: e.target.value })}
            className="min-h-[120px]"
          />
        </div>
        <div className="space-y-2">
          <Label>关键道具/物件标签（逗号分隔）</Label>
          <Input
            value={propsDraft}
            placeholder="例如：钥匙、红伞、校徽"
            onChange={(e) => setPropsDraft(e.target.value)}
            onBlur={() => applyPatch({ props: splitTags(propsDraft) })}
          />
          <div className="text-xs text-muted-foreground">
            用于跨集连续性检查（同一物件在多格/多集出现时，方便追踪）。
          </div>
        </div>
      </div>
    </Card>
  );
}
