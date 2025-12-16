import type { ProviderType } from '@/types';

export type MaxTokensPolicy = {
  /** UI 下限（并非强校验，仅用于滑块范围） */
  min: number;
  /** UI 上限（与后端 schema 的 maxTokens 上限对齐） */
  max: number;
  /** UI 步进 */
  step: number;
  /** 推荐默认值（用于提示/预设） */
  recommendedDefault: number;
  /** 一句话提示（展示默认/最大等） */
  hint: string;
};

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, v));
}

/**
 * 规则来源（业务约定）：
 * - deepseek-chat：默认 4K，最大 8K
 * - deepseek-reasoner：默认 32K，最大 64K
 */
export function getMaxTokensPolicy(provider?: ProviderType, model?: string): MaxTokensPolicy {
  const m = (model ?? '').toLowerCase();

  if (provider === 'deepseek') {
    if (m.includes('reasoner')) {
      return {
        min: 1024,
        max: 65536,
        step: 1024,
        recommendedDefault: 32768,
        hint: 'deepseek-reasoner：默认 32K，最大 64K',
      };
    }

    return {
      min: 256,
      max: 8192,
      step: 256,
      recommendedDefault: 4096,
      hint: 'deepseek-chat：默认 4K，最大 8K',
    };
  }

  // 其它供应商/模型：给更大的可调范围，但不保证所有模型都支持该上限（以供应商返回为准）
  return {
    min: 128,
    max: 65536,
    step: 512,
    recommendedDefault: 4096,
    hint: '建议按模型能力调整（部分模型可能不支持过大输出长度）',
  };
}

export function clampMaxTokens(value: number, provider?: ProviderType, model?: string): number {
  const policy = getMaxTokensPolicy(provider, model);
  return clampInt(value, policy.min, policy.max);
}
