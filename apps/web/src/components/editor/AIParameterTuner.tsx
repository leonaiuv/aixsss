// ==========================================
// AI参数调优组件
// ==========================================
// 功能：
// 1. 调整AI生成参数（temperature、top_p等）
// 2. 预设模板
// 3. 参数解释
// 4. 实时预览效果
// ==========================================

import { useMemo, useState } from 'react';
import { AIGenerationParams, type ProviderType } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sliders, Info, RotateCcw, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getMaxTokensPolicy } from '@/lib/ai/maxTokensPolicy';

interface AIParameterTunerProps {
  provider?: ProviderType;
  model?: string;
  params: AIGenerationParams;
  onParamsChange: (params: AIGenerationParams) => void;
}

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, v));
}

export function AIParameterTuner({
  provider,
  model,
  params,
  onParamsChange,
}: AIParameterTunerProps) {
  const [preset, setPreset] = useState<string>('balanced');
  const maxTokensPolicy = useMemo(() => getMaxTokensPolicy(provider, model), [provider, model]);

  const canTuneReasoningEffort = useMemo(() => {
    if (provider !== 'openai-compatible') return false;
    const m = (model ?? '').toLowerCase().trim();
    if (!m) return false;
    if (m.includes('gpt-5')) return true;
    if (/(^|\/)o\d/.test(m)) return true;
    return false;
  }, [model, provider]);

  const presets = useMemo(() => {
    const base = maxTokensPolicy.recommendedDefault;
    const min = maxTokensPolicy.min;
    const max = maxTokensPolicy.max;
    return {
      creative: {
        temperature: 0.9,
        topP: 0.95,
        maxTokens: clampInt(Math.round(base * 1.25), min, max),
        presencePenalty: 0.6,
        frequencyPenalty: 0.5,
      },
      balanced: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: clampInt(base, min, max),
        presencePenalty: 0.3,
        frequencyPenalty: 0.3,
      },
      conservative: {
        temperature: 0.3,
        topP: 0.7,
        maxTokens: clampInt(Math.round(base * 0.75), min, max),
        presencePenalty: 0.1,
        frequencyPenalty: 0.1,
      },
    } satisfies Record<string, AIGenerationParams>;
  }, [maxTokensPolicy]);

  const handlePresetChange = (presetName: string) => {
    setPreset(presetName);
    const next = presets[presetName as keyof typeof presets];
    // 保留“推理强度”等非数值型参数，避免切换预设后丢失
    onParamsChange({ ...next, reasoningEffort: params.reasoningEffort });
  };

  const handleReset = () => {
    handlePresetChange('balanced');
  };

  type NumericParamKey = 'temperature' | 'topP' | 'maxTokens' | 'presencePenalty' | 'frequencyPenalty';
  const updateParam = (key: NumericParamKey, value: number) => {
    onParamsChange({ ...params, [key]: value });
    setPreset('custom');
  };

  const updateReasoningEffort = (value: AIGenerationParams['reasoningEffort']) => {
    onParamsChange({ ...params, reasoningEffort: value });
    setPreset('custom');
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sliders className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI参数调优</h2>
            <p className="text-sm text-muted-foreground">调整AI生成参数以控制输出效果</p>
          </div>
        </div>

        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          重置
        </Button>
      </div>

      {/* 预设选择 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">快速预设</CardTitle>
          <CardDescription>选择一个预设配置快速开始</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="creative">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  创意模式 - 更多样化、更有想象力
                </div>
              </SelectItem>
              <SelectItem value="balanced">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  平衡模式 - 质量和多样性兼顾
                </div>
              </SelectItem>
              <SelectItem value="conservative">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  保守模式 - 更稳定、更可预测
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          {preset === 'custom' && (
            <Badge variant="secondary" className="mt-2">
              自定义配置
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* 参数调整 */}
      <div className="space-y-6">
        {/* 推理强度（GPT-5/推理模型） */}
        {canTuneReasoningEffort ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">推理强度（Thinking）</CardTitle>
              <CardDescription>
                仅对 GPT-5 / 推理类模型（Responses API）生效，用于控制推理深度与耗时/成本。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>推理强度</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-xs">
                            AiHubMix 的 Responses API 支持通过 reasoning.effort 调整推理强度：
                            none/minimal/low/medium/high/xhigh（不同模型支持的档位可能不同）。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {params.reasoningEffort ?? 'default'}
                  </Badge>
                </div>
                <Select
                  value={params.reasoningEffort ?? 'default'}
                  onValueChange={(v) =>
                    updateReasoningEffort(v === 'default' ? undefined : (v as AIGenerationParams['reasoningEffort']))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">默认（不指定）</SelectItem>
                    <SelectItem value="none">none（关闭推理/最省）</SelectItem>
                    <SelectItem value="minimal">minimal（最少推理）</SelectItem>
                    <SelectItem value="low">low（低）</SelectItem>
                    <SelectItem value="medium">medium（中）</SelectItem>
                    <SelectItem value="high">high（高）</SelectItem>
                    <SelectItem value="xhigh">xhigh（超高）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  提示：更高推理强度通常更稳但更慢/更贵；若追求速度可选 none/minimal/low。若供应商返回“不支持该档位”，系统会自动降级。
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* 温度 (Temperature) */}
        <ParameterSlider
          label="温度 (Temperature)"
          value={params.temperature}
          onChange={(value) => updateParam('temperature', value)}
          min={0}
          max={2}
          step={0.1}
          description="控制输出的随机性。值越高，输出越有创意和多样性"
          tooltip="推荐范围: 创意性内容 0.7-1.0，事实性内容 0-0.3"
        />

        {/* 核采样 (Top P) */}
        <ParameterSlider
          label="核采样 (Top P)"
          value={params.topP}
          onChange={(value) => updateParam('topP', value)}
          min={0}
          max={1}
          step={0.05}
          description="核采样参数。控制考虑的词汇范围"
          tooltip="推荐值: 0.9-0.95 通常效果最好"
        />

        {/* 最大 Token 数 */}
        <ParameterSlider
          label="最大 Token 数"
          value={params.maxTokens}
          onChange={(value) => updateParam('maxTokens', value)}
          min={maxTokensPolicy.min}
          max={maxTokensPolicy.max}
          step={maxTokensPolicy.step}
          description="最大生成长度（token数）"
          tooltip={`${maxTokensPolicy.hint}；1 token ≈ 0.75 个英文单词 或 0.5 个中文字`}
        />

        <Separator />

        {/* 主题惩罚 (Presence Penalty) */}
        <ParameterSlider
          label="主题惩罚 (Presence Penalty)"
          value={params.presencePenalty || 0}
          onChange={(value) => updateParam('presencePenalty', value)}
          min={-2}
          max={2}
          step={0.1}
          description="惩罚已出现的主题，鼓励谈论新主题"
          tooltip="正值增加探索新主题的可能性"
        />

        {/* 重复惩罚 (Frequency Penalty) */}
        <ParameterSlider
          label="重复惩罚 (Frequency Penalty)"
          value={params.frequencyPenalty || 0}
          onChange={(value) => updateParam('frequencyPenalty', value)}
          min={-2}
          max={2}
          step={0.1}
          description="惩罚重复的词语，减少重复表达"
          tooltip="正值减少逐字重复的可能性"
        />
      </div>

      {/* 效果预览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前配置效果</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <EffectIndicator label="创意度" value={calculateCreativity(params)} />
            <EffectIndicator label="稳定性" value={calculateStability(params)} />
            <EffectIndicator label="多样性" value={calculateDiversity(params)} />
            <EffectIndicator
              label="长度倾向"
              value={Math.min(100, (params.maxTokens / maxTokensPolicy.max) * 100)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 提示 */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
        <div className="flex gap-2">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-semibold mb-1">💡 使用建议</p>
            <ul className="space-y-1 text-xs">
              <li>
                • <strong>场景锚点</strong>: 使用平衡或保守模式，确保锚点清晰稳定
              </li>
              <li>
                • <strong>动作描述</strong>: 使用平衡模式，兼顾细节和连贯性
              </li>
              <li>
                • <strong>提示词生成</strong>: 可尝试创意模式，获得更多样的表达
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// 参数滑块组件
function ParameterSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  description,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  description: string;
  tooltip: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Badge variant="outline" className="font-mono">
          {value.toFixed(step < 1 ? 2 : 0)}
        </Badge>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// 效果指示器
function EffectIndicator({ label, value }: { label: string; value: number }) {
  const getColor = (v: number) => {
    if (v < 33) return 'bg-green-500';
    if (v < 67) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(value)} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// 计算创意度
function calculateCreativity(params: AIGenerationParams): number {
  return Math.min(
    100,
    params.temperature * 50 + (params.topP - 0.5) * 100 + (params.presencePenalty || 0) * 25,
  );
}

// 计算稳定性
function calculateStability(params: AIGenerationParams): number {
  return Math.min(100, 100 - params.temperature * 40 - (params.frequencyPenalty || 0) * 20);
}

// 计算多样性
function calculateDiversity(params: AIGenerationParams): number {
  return Math.min(
    100,
    params.topP * 100 + (params.presencePenalty || 0) * 20 + (params.frequencyPenalty || 0) * 20,
  );
}
