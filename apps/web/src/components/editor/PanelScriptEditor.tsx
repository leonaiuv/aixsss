import { useEffect, useMemo, useState } from 'react';
import type {
  AssetImageRefV1,
  Character,
  PanelCharacterAssetBindingV1,
  Scene,
  WorldViewElement,
} from '@/types';
import { buildPanelScriptPatch, computePanelMetrics, getPanelScript } from '@/lib/workflowV2';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
import { Link2, Plus, Trash2 } from 'lucide-react';

const NO_LOCATION = '__none__';

function splitTags(text: string): string[] {
  return text
    .split(/[,\n，、]/gu)
    .map((s) => s.trim())
    .filter(Boolean);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildDefaultCharacterImageRefs(character: Character): AssetImageRefV1[] {
  const refs: AssetImageRefV1[] = [];
  if (character.avatar?.trim()) {
    refs.push({ id: `char_${character.id}_avatar`, url: character.avatar.trim(), label: 'avatar' });
  }
  (character.portraitPrompts?.referenceImages ?? []).forEach((r) => {
    if (r?.url?.trim()) refs.push({ ...r, url: r.url.trim() });
  });

  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
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
  const assets = panelScript.assets ?? { version: 1 as const };

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

  const assetCharactersById = useMemo(() => {
    const map = new Map<string, PanelCharacterAssetBindingV1>();
    (assets.characters ?? []).forEach((b) => map.set(b.characterId, b));
    return map;
  }, [assets.characters]);

  const [propsDraft, setPropsDraft] = useState(panelScript.props?.join(', ') ?? '');

  useEffect(() => {
    setPropsDraft(panelScript.props?.join(', ') ?? '');
  }, [scene.id, panelScript.props]);

  const applyPatch = (patch: Parameters<typeof buildPanelScriptPatch>[1]) => {
    onUpdateScene(buildPanelScriptPatch(scene, patch));
  };

  const updateSceneRefs = (updater: (prev: AssetImageRefV1[]) => AssetImageRefV1[]) => {
    const prev = assets.sceneRefs ?? [];
    const next = updater(prev);
    applyPatch({
      assets: {
        version: 1,
        sceneRefs: next,
      },
    });
  };

  const updateLayoutRefs = (updater: (prev: AssetImageRefV1[]) => AssetImageRefV1[]) => {
    const prev = assets.layoutRefs ?? [];
    const next = updater(prev);
    applyPatch({
      assets: {
        version: 1,
        layoutRefs: next,
      },
    });
  };

  const updateMaskRefs = (updater: (prev: AssetImageRefV1[]) => AssetImageRefV1[]) => {
    const prev = assets.maskRefs ?? [];
    const next = updater(prev);
    applyPatch({
      assets: {
        version: 1,
        maskRefs: next,
      },
    });
  };

  const updateCharacterBinding = (
    characterId: string,
    updater: (
      prev: PanelCharacterAssetBindingV1 | undefined,
    ) => PanelCharacterAssetBindingV1 | null,
  ) => {
    const prevList = assets.characters ?? [];
    const prev = assetCharactersById.get(characterId);
    const nextBinding = updater(prev);
    const nextList = [
      ...prevList.filter((b) => b.characterId !== characterId),
      ...(nextBinding ? [nextBinding] : []),
    ];
    applyPatch({
      assets: {
        version: 1,
        characters: nextList,
      },
    });
  };

  const updateParams = (patch: NonNullable<(typeof assets)['params']>) => {
    applyPatch({
      assets: {
        version: 1,
        params: patch,
      },
    });
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
            <Label className="text-xs text-muted-foreground">
              地点备注（空间卡/可用机位/动线）
            </Label>
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

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">资产绑定（图生图输入清单）</div>
            <div className="text-xs text-muted-foreground">
              角色一致性由参考图资产保证：提示词只写差量（表情/姿势/服装变化/交互），避免重复外观描述。
            </div>
          </div>
          <Badge variant="outline" className="h-5">
            v1
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              场景参考图（背景/基底）
            </Label>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() =>
                updateSceneRefs((prev) => [
                  ...prev,
                  { id: createId('sceneRef'), url: '', weight: 0.7 },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              添加
            </Button>
          </div>

          {(assets.sceneRefs ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">（建议至少绑定 1 张背景参考图）</div>
          ) : (
            <div className="space-y-2">
              {(assets.sceneRefs ?? []).map((ref, idx) => (
                <div key={ref.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-6">
                  <div className="md:col-span-4 space-y-1">
                    <Label className="text-xs text-muted-foreground">URL</Label>
                    <Input
                      value={ref.url}
                      placeholder="粘贴场景参考图 URL / 文件名"
                      onChange={(e) =>
                        updateSceneRefs((prev) =>
                          prev.map((r) => (r.id === ref.id ? { ...r, url: e.target.value } : r)),
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">权重</Label>
                    <Input
                      value={ref.weight ?? ''}
                      placeholder="0-1"
                      inputMode="decimal"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const weight = raw ? clamp01(Number(raw)) : undefined;
                        updateSceneRefs((prev) =>
                          prev.map((r) => (r.id === ref.id ? { ...r, weight } : r)),
                        );
                      }}
                    />
                  </div>
                  <div className="md:col-span-1 flex items-end justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateSceneRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="md:col-span-6 grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">标签</Label>
                      <Input
                        value={ref.label ?? ''}
                        placeholder={idx === 0 ? '例如：bg_base' : '可选'}
                        onChange={(e) =>
                          updateSceneRefs((prev) =>
                            prev.map((r) =>
                              r.id === ref.id ? { ...r, label: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">备注</Label>
                      <Input
                        value={ref.notes ?? ''}
                        placeholder="可选：用于下游工具/团队协作说明"
                        onChange={(e) =>
                          updateSceneRefs((prev) =>
                            prev.map((r) =>
                              r.id === ref.id ? { ...r, notes: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>出场角色：参考图 + 差量指令</Label>
          {panelScript.charactersPresentIds?.length ? (
            <div className="space-y-3">
              {panelScript.charactersPresentIds.map((characterId) => {
                const character = charactersById.get(characterId);
                const binding = assetCharactersById.get(characterId);
                const defaultRefs = character ? buildDefaultCharacterImageRefs(character) : [];
                const imageRefs = binding?.imageRefs ?? [];

                return (
                  <div key={characterId} className="rounded-md border p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{character?.name ?? characterId}</div>
                        {defaultRefs.length > 0 ? (
                          <div className="text-xs text-muted-foreground mt-1">
                            角色库默认参考图：{defaultRefs.length} 张
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1">
                            （角色库未配置参考图：可在此格单独粘贴 URL）
                          </div>
                        )}
                      </div>

                      {defaultRefs.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              imageRefs: defaultRefs,
                            }))
                          }
                        >
                          使用角色库参考图
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">表情</Label>
                        <Input
                          value={binding?.expression ?? ''}
                          placeholder="例如：惊讶、冷笑、强忍"
                          onChange={(e) =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              expression: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">姿势</Label>
                        <Input
                          value={binding?.pose ?? ''}
                          placeholder="例如：半蹲、伸手、侧身回头"
                          onChange={(e) =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              pose: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">服装变化</Label>
                        <Input
                          value={binding?.costume ?? ''}
                          placeholder="例如：外套脱下、领带松开"
                          onChange={(e) =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              costume: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">交互/道具</Label>
                        <Input
                          value={binding?.interaction ?? ''}
                          placeholder="例如：手抓门把、递出钥匙"
                          onChange={(e) =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              interaction: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-xs text-muted-foreground">参考图（可多张）</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() =>
                          updateCharacterBinding(characterId, (prev) => {
                            const next = [...(prev?.imageRefs ?? [])];
                            next.push({ id: createId('charRef'), url: '', weight: 0.85 });
                            return { characterId, ...prev, imageRefs: next };
                          })
                        }
                      >
                        <Plus className="h-4 w-4" />
                        添加
                      </Button>
                    </div>

                    {imageRefs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        （留空表示使用角色库默认参考图）
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {imageRefs.map((ref) => (
                          <div key={ref.id} className="grid gap-2 md:grid-cols-6">
                            <div className="md:col-span-4">
                              <Input
                                value={ref.url}
                                placeholder="粘贴角色参考图 URL / 文件名"
                                onChange={(e) =>
                                  updateCharacterBinding(characterId, (prev) => {
                                    const next = (prev?.imageRefs ?? []).map((r) =>
                                      r.id === ref.id ? { ...r, url: e.target.value } : r,
                                    );
                                    return { characterId, ...prev, imageRefs: next };
                                  })
                                }
                              />
                            </div>
                            <div className="md:col-span-1">
                              <Input
                                value={ref.weight ?? ''}
                                placeholder="权重"
                                inputMode="decimal"
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  const weight = raw ? clamp01(Number(raw)) : undefined;
                                  updateCharacterBinding(characterId, (prev) => {
                                    const next = (prev?.imageRefs ?? []).map((r) =>
                                      r.id === ref.id ? { ...r, weight } : r,
                                    );
                                    return { characterId, ...prev, imageRefs: next };
                                  });
                                }}
                              />
                            </div>
                            <div className="md:col-span-1 flex justify-end">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  updateCharacterBinding(characterId, (prev) => {
                                    const next = (prev?.imageRefs ?? []).filter(
                                      (r) => r.id !== ref.id,
                                    );
                                    return { characterId, ...prev, imageRefs: next };
                                  })
                                }
                                title="删除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1 md:col-span-1">
                        <Label className="text-xs text-muted-foreground">建议权重</Label>
                        <Input
                          value={binding?.weight ?? ''}
                          placeholder="0-1"
                          inputMode="decimal"
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const weight = raw ? clamp01(Number(raw)) : undefined;
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              weight,
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1 md:col-span-3">
                        <Label className="text-xs text-muted-foreground">备注</Label>
                        <Input
                          value={binding?.notes ?? ''}
                          placeholder="可选：例如 ip-adapter 强度/姿态参考说明"
                          onChange={(e) =>
                            updateCharacterBinding(characterId, (prev) => ({
                              characterId,
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              （先在上方勾选“出场角色”，这里会自动出现每个角色的资产引用与差量字段）
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                布局草图（可选）
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  updateLayoutRefs((prev) => [...prev, { id: createId('layoutRef'), url: '' }])
                }
              >
                <Plus className="h-4 w-4" />
                添加
              </Button>
            </div>
            {(assets.layoutRefs ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">
                （可留空：仅在需要空间/气泡布局时使用）
              </div>
            ) : (
              <div className="space-y-2">
                {(assets.layoutRefs ?? []).map((ref) => (
                  <div key={ref.id} className="grid gap-2 md:grid-cols-6">
                    <div className="md:col-span-5">
                      <Input
                        value={ref.url}
                        placeholder="粘贴布局草图 URL / 文件名"
                        onChange={(e) =>
                          updateLayoutRefs((prev) =>
                            prev.map((r) => (r.id === ref.id ? { ...r, url: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updateLayoutRefs((prev) => prev.filter((r) => r.id !== ref.id))
                        }
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Mask/Inpaint（可选）
              </Label>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  updateMaskRefs((prev) => [...prev, { id: createId('maskRef'), url: '' }])
                }
              >
                <Plus className="h-4 w-4" />
                添加
              </Button>
            </div>
            {(assets.maskRefs ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">
                （可留空：仅在局部修补/遮挡处理时使用）
              </div>
            ) : (
              <div className="space-y-2">
                {(assets.maskRefs ?? []).map((ref) => (
                  <div key={ref.id} className="grid gap-2 md:grid-cols-6">
                    <div className="md:col-span-5">
                      <Input
                        value={ref.url}
                        placeholder="粘贴 mask URL / 文件名"
                        onChange={(e) =>
                          updateMaskRefs((prev) =>
                            prev.map((r) => (r.id === ref.id ? { ...r, url: e.target.value } : r)),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updateMaskRefs((prev) => prev.filter((r) => r.id !== ref.id))
                        }
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>参数建议（可选）</Label>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Denoise</Label>
              <Input
                value={assets.params?.denoiseStrength ?? ''}
                placeholder="0-1"
                inputMode="decimal"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const denoiseStrength = raw ? clamp01(Number(raw)) : undefined;
                  updateParams({ denoiseStrength });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">CFG</Label>
              <Input
                value={assets.params?.cfgScale ?? ''}
                placeholder="例如 5-9"
                inputMode="decimal"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const cfgScale = raw ? Number(raw) : undefined;
                  updateParams({ cfgScale });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Steps</Label>
              <Input
                value={assets.params?.steps ?? ''}
                placeholder="例如 20-35"
                inputMode="numeric"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const steps = raw ? Number(raw) : undefined;
                  updateParams({ steps });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seed</Label>
              <Input
                value={assets.params?.seed ?? ''}
                placeholder="可留空"
                inputMode="numeric"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const seed = raw ? Number(raw) : undefined;
                  updateParams({ seed });
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">备注</Label>
            <Input
              value={assets.params?.notes ?? ''}
              placeholder="例如：IP-Adapter weight=0.8；ControlNet depth=0.6..."
              onChange={(e) => updateParams({ notes: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
