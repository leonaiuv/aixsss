import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import {
  ProviderType,
  type AIGenerationParams,
  type AIPricing,
  type ConnectionTestResult,
} from '@/types';
import { ENCRYPTION_CHECK_KEY, KeyManager, verifyMasterPassword } from '@/lib/keyManager';
import { initializeEncryption, changeEncryptionPassword } from '@/lib/storage';
import { useAIUsageStore, calculateUsageStats, estimateUsageCostUSD } from '@/stores/aiUsageStore';
import { useConfirm } from '@/hooks/use-confirm';
import { isApiMode } from '@/lib/runtime/mode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Eye,
  EyeOff,
  Loader2,
  Shield,
  ShieldAlert,
  Lock,
  Sliders,
  Copy,
  Trash2,
  Plus,
  CopyPlus,
  Check,
  X,
  Zap,
  Key,
  Server,
  Activity,
  DollarSign,
} from 'lucide-react';
import { AIParameterTuner } from './editor/AIParameterTuner';
import { clampMaxTokens, getMaxTokensPolicy } from '@/lib/ai/maxTokensPolicy';
import { cn } from '@/lib/utils';

const DEFAULT_GENERATION_PARAMS: AIGenerationParams = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 4096,
  presencePenalty: 0.3,
  frequencyPenalty: 0.3,
};

const PROVIDER_PRESETS: Record<
  ProviderType,
  Array<{ id: string; label: string; model: string; baseURL?: string }>
> = {
  deepseek: [
    {
      id: 'deepseek-default',
      label: 'DeepSeek 默认（deepseek-chat）',
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek 推理（deepseek-reasoner）',
      model: 'deepseek-reasoner',
      baseURL: 'https://api.deepseek.com',
    },
  ],
  kimi: [
    { id: 'kimi-8k', label: 'Kimi 8k（moonshot-v1-8k）', model: 'moonshot-v1-8k' },
    { id: 'kimi-32k', label: 'Kimi 32k（moonshot-v1-32k）', model: 'moonshot-v1-32k' },
    { id: 'kimi-128k', label: 'Kimi 128k（moonshot-v1-128k）', model: 'moonshot-v1-128k' },
  ],
  gemini: [
    {
      id: 'gemini-flash',
      label: 'Gemini Flash（gemini-1.5-flash）',
      model: 'gemini-1.5-flash',
      baseURL: 'https://generativelanguage.googleapis.com',
    },
    {
      id: 'gemini-pro',
      label: 'Gemini Pro（gemini-1.5-pro）',
      model: 'gemini-1.5-pro',
      baseURL: 'https://generativelanguage.googleapis.com',
    },
    {
      id: 'gemini-legacy',
      label: 'Gemini 旧版（gemini-pro）',
      model: 'gemini-pro',
      baseURL: 'https://generativelanguage.googleapis.com',
    },
  ],
  'openai-compatible': [
    {
      id: 'aihubmix-gpt5',
      label: 'AiHubMix（GPT-5，推荐）',
      model: 'gpt-5',
      baseURL: 'https://aihubmix.com',
    },
    {
      id: 'aihubmix-gpt5-mini',
      label: 'AiHubMix（GPT-5 Mini）',
      model: 'gpt-5-mini',
      baseURL: 'https://aihubmix.com',
    },
    {
      id: 'aihubmix-gpt5-nano',
      label: 'AiHubMix（GPT-5 Nano）',
      model: 'gpt-5-nano',
      baseURL: 'https://aihubmix.com',
    },
    {
      id: 'aihubmix-gemini3',
      label: 'AiHubMix（Gemini 3，示例）',
      model: 'gemini-3',
      baseURL: 'https://aihubmix.com',
    },
    {
      id: 'aihubmix-forward',
      label: 'AiHubMix（通用转发，示例 gpt-4o-mini）',
      model: 'gpt-4o-mini',
      baseURL: 'https://aihubmix.com',
    },
    {
      id: 'openai-official-mini',
      label: 'OpenAI 官方（gpt-4o-mini）',
      model: 'gpt-4o-mini',
      baseURL: 'https://api.openai.com',
    },
    {
      id: 'openai-official',
      label: 'OpenAI 官方（gpt-4o）',
      model: 'gpt-4o',
      baseURL: 'https://api.openai.com',
    },
    {
      id: 'openai-35',
      label: 'OpenAI（gpt-3.5-turbo）',
      model: 'gpt-3.5-turbo',
      baseURL: 'https://api.openai.com',
    },
  ],
};

function normalizeGenerationParams(
  params: AIGenerationParams | undefined,
  provider?: ProviderType,
  model?: string,
): AIGenerationParams {
  const policy = getMaxTokensPolicy(provider, model);
  return {
    ...DEFAULT_GENERATION_PARAMS,
    ...params,
    maxTokens: clampMaxTokens(params?.maxTokens ?? policy.recommendedDefault, provider, model),
    presencePenalty: params?.presencePenalty ?? DEFAULT_GENERATION_PARAMS.presencePenalty,
    frequencyPenalty: params?.frequencyPenalty ?? DEFAULT_GENERATION_PARAMS.frequencyPenalty,
  };
}

type TabId = 'connection' | 'params' | 'usage' | 'security';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'connection', label: '连接配置', icon: Server },
  { id: 'params', label: '生成参数', icon: Sliders },
  { id: 'usage', label: '用量统计', icon: Activity },
  { id: 'security', label: '安全设置', icon: Shield },
];

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps) {
  const {
    testConnection,
    loadConfig,
    clearConfig,
    profiles,
    activeProfileId,
    setActiveProfile,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useConfigStore();
  const apiMode = isApiMode();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const usageEvents = useAIUsageStore((state) => state.events);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;

  const [activeTab, setActiveTab] = useState<TabId>('connection');
  const [provider, setProvider] = useState<ProviderType>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [profileName, setProfileName] = useState('默认档案');
  type PricingUnit = 'per_1M' | 'per_1K';
  const PRICING_UNIT_STORAGE_KEY = 'aixs_pricing_unit';
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(() => {
    try {
      const raw =
        typeof localStorage !== 'undefined' ? localStorage.getItem(PRICING_UNIT_STORAGE_KEY) : null;
      return raw === 'per_1K' || raw === 'per_1M' ? raw : 'per_1M';
    } catch {
      return 'per_1M';
    }
  });
  const [pricingInput, setPricingInput] = useState('');
  const [pricingOutput, setPricingOutput] = useState('');
  const [pricingCachedInput, setPricingCachedInput] = useState('');
  const [presetId, setPresetId] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [generationParams, setGenerationParams] =
    useState<AIGenerationParams>(DEFAULT_GENERATION_PARAMS);
  const [aiTunerOpen, setAiTunerOpen] = useState(false);

  // 加密密码相关状态
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showForgetConfirm, setShowForgetConfirm] = useState(false);
  const [hasCustomPassword, setHasCustomPassword] = useState(KeyManager.hasCustomPassword());

  const isUnlocked = KeyManager.isInitialized();
  const isLocked = !apiMode && hasCustomPassword && !isUnlocked;

  const pricingUnitRef = useRef<PricingUnit>(pricingUnit);
  pricingUnitRef.current = pricingUnit;

  const lastTest: ConnectionTestResult | undefined = activeProfile?.lastTest;

  const formatDuration = (ms: number): string => {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r.toFixed(0)}s`;
  };

  const formatDateTime = (ts: number): string => {
    try {
      return new Date(ts).toLocaleString('zh-CN');
    } catch {
      return '-';
    }
  };

  const pricingByProfileId = useMemo(() => {
    return Object.fromEntries(profiles.map((p) => [p.id, p.pricing]));
  }, [profiles]);

  const parsePricing = useCallback((): AIPricing | undefined => {
    const inputRaw = pricingInput.trim();
    const outputRaw = pricingOutput.trim();
    const cachedRaw = pricingCachedInput.trim();

    if (!inputRaw && !outputRaw && !cachedRaw) return undefined;
    if (!inputRaw || !outputRaw) return undefined;

    const input = Number(inputRaw);
    const output = Number(outputRaw);
    const cached = cachedRaw ? Number(cachedRaw) : undefined;

    if (!Number.isFinite(input) || input < 0) return undefined;
    if (!Number.isFinite(output) || output < 0) return undefined;
    if (cachedRaw && (!Number.isFinite(cached) || (cached as number) < 0)) return undefined;

    const factor = pricingUnit === 'per_1M' ? 1000 : 1;
    const promptPer1K = input / factor;
    const completionPer1K = output / factor;
    const cachedPromptPer1K = cachedRaw ? (cached as number) / factor : undefined;

    return {
      currency: 'USD',
      promptPer1K,
      completionPer1K,
      ...(cachedPromptPer1K !== undefined ? { cachedPromptPer1K } : {}),
    };
  }, [pricingCachedInput, pricingInput, pricingOutput, pricingUnit]);

  const usage24h = useMemo(() => {
    if (!activeProfileId) return { events: [], stats: calculateUsageStats([]), costUSD: 0 };
    const now = Date.now();
    const from = now - 24 * 60 * 60 * 1000;
    const recent = usageEvents.filter((e) => e.completedAt >= from);
    const scoped = recent.filter((e) => {
      if (e.profileId) return e.profileId === activeProfileId;
      return e.provider === provider && e.model === model;
    });
    const stats = calculateUsageStats(scoped);
    const costUSD = estimateUsageCostUSD(scoped, pricingByProfileId);
    return { events: scoped, stats, costUSD };
  }, [activeProfileId, model, pricingByProfileId, provider, usageEvents]);

  const isDirty = useMemo(() => {
    if (!activeProfile) return false;

    const storedBaseURL = activeProfile.config.baseURL || '';
    const draftBaseURL = provider === 'kimi' ? '' : normalizedBaseURL(baseURL) || '';

    const storedGen = normalizeGenerationParams(
      activeProfile.config.generationParams,
      activeProfile.config.provider,
      activeProfile.config.model,
    );
    const draftGen = normalizeGenerationParams(generationParams, provider, model);
    const sameGen = JSON.stringify(storedGen) === JSON.stringify(draftGen);

    const storedPricing = activeProfile.pricing
      ? `${activeProfile.pricing.promptPer1K}|${activeProfile.pricing.completionPer1K}|${
          activeProfile.pricing.cachedPromptPer1K ?? ''
        }`
      : '';
    const draftPricingParsed = parsePricing();
    const draftPricing = draftPricingParsed
      ? `${draftPricingParsed.promptPer1K}|${draftPricingParsed.completionPer1K}|${
          draftPricingParsed.cachedPromptPer1K ?? ''
        }`
      : '';

    return (
      profileName.trim() !== activeProfile.name ||
      provider !== activeProfile.config.provider ||
      apiKey !== activeProfile.config.apiKey ||
      draftBaseURL !== storedBaseURL ||
      model !== activeProfile.config.model ||
      !sameGen ||
      draftPricing !== storedPricing
    );
  }, [
    activeProfile,
    apiKey,
    baseURL,
    generationParams,
    model,
    parsePricing,
    profileName,
    provider,
  ]);

  useEffect(() => {
    if (!open) return;

    const profile = activeProfileRef.current;

    if (profile) {
      setProfileName(profile.name);
      setProvider(profile.config.provider);
      setApiKey(profile.config.apiKey);
      setBaseURL(profile.config.baseURL || '');
      setModel(profile.config.model);
      setGenerationParams(
        normalizeGenerationParams(
          profile.config.generationParams,
          profile.config.provider,
          profile.config.model,
        ),
      );
      const factor = pricingUnitRef.current === 'per_1M' ? 1000 : 1;
      setPricingInput(profile.pricing ? String(profile.pricing.promptPer1K * factor) : '');
      setPricingOutput(profile.pricing ? String(profile.pricing.completionPer1K * factor) : '');
      setPricingCachedInput(
        profile.pricing && typeof profile.pricing.cachedPromptPer1K === 'number'
          ? String(profile.pricing.cachedPromptPer1K * factor)
          : '',
      );
    } else {
      setProfileName('默认档案');
      setProvider('deepseek');
      setApiKey('');
      setBaseURL('');
      setModel('deepseek-chat');
      setGenerationParams(normalizeGenerationParams(undefined, 'deepseek', 'deepseek-chat'));
      setPricingInput('');
      setPricingOutput('');
      setPricingCachedInput('');
    }

    setPresetId('');
    setHasCustomPassword(KeyManager.hasCustomPassword());
  }, [activeProfileId, open]);

  useEffect(() => {
    if (!open) return;
    setPasswordError('');
    setUnlockError('');
    setShowForgetConfirm(false);
  }, [open]);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(PRICING_UNIT_STORAGE_KEY, pricingUnit);
    } catch {
      // ignore
    }
  }, [PRICING_UNIT_STORAGE_KEY, pricingUnit]);

  useEffect(() => {
    setGenerationParams((prev) => {
      const next = clampMaxTokens(prev.maxTokens, provider, model);
      if (next === prev.maxTokens) return prev;
      return { ...prev, maxTokens: next };
    });
  }, [provider, model]);

  const handlePricingUnitChange = (next: PricingUnit) => {
    if (next === pricingUnit) return;

    const prevFactor = pricingUnit === 'per_1M' ? 1000 : 1;
    const nextFactor = next === 'per_1M' ? 1000 : 1;
    const ratio = nextFactor / prevFactor;

    const convert = (raw: string): string => {
      const trimmed = raw.trim();
      if (!trimmed) return '';
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return raw;
      const converted = n * ratio;
      const normalized =
        Math.abs(converted) >= 1 ? Number(converted.toFixed(6)) : Number(converted.toFixed(8));
      return String(normalized);
    };

    setPricingInput((v) => convert(v));
    setPricingOutput((v) => convert(v));
    setPricingCachedInput((v) => convert(v));
    setPricingUnit(next);
  };

  function normalizedBaseURL(input: string): string | undefined {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const withoutTrailingSlash = trimmed.replace(/\/$/, '');
    return withoutTrailingSlash.replace(/\/(v1beta|v1)$/, '');
  }

  const getValidationErrors = (): {
    profileName?: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
    pricing?: string;
  } => {
    const errors: {
      profileName?: string;
      apiKey?: string;
      model?: string;
      baseURL?: string;
      pricing?: string;
    } = {};

    if (!profileName.trim()) errors.profileName = '档案名称不能为空';

    const requiresApiKey =
      !apiMode ||
      !activeProfileId ||
      (typeof activeProfileId === 'string' && activeProfileId.startsWith('draft_'));
    if (requiresApiKey && !apiKey.trim()) errors.apiKey = 'API Key 不能为空';

    if (!model.trim()) errors.model = '模型名称不能为空';

    if (provider !== 'kimi') {
      const normalized = normalizedBaseURL(baseURL);
      if (normalized) {
        try {
          const url = new URL(normalized);
          if (!['http:', 'https:'].includes(url.protocol)) {
            errors.baseURL = 'Base URL 需要以 http(s):// 开头';
          }
        } catch {
          errors.baseURL = 'Base URL 格式不正确';
        }
      }
    }

    const pricingRawInput = pricingInput.trim();
    const pricingRawOutput = pricingOutput.trim();
    const pricingRawCached = pricingCachedInput.trim();
    if (pricingRawInput || pricingRawOutput || pricingRawCached) {
      if (!pricingRawInput || !pricingRawOutput) {
        errors.pricing = '请同时填写"输入价"和"输出价"（或全部留空）';
      } else {
        const pricing = parsePricing();
        if (!pricing) errors.pricing = '价格格式不正确（请输入非负数字）';
      }
    }

    return errors;
  };

  const validationErrors = getValidationErrors();
  const hasConfigValidationErrors = Boolean(
    validationErrors.apiKey || validationErrors.model || validationErrors.baseURL,
  );
  const hasProfileValidationErrors = Boolean(
    validationErrors.profileName || validationErrors.pricing,
  );
  const hasSaveValidationErrors = hasConfigValidationErrors || hasProfileValidationErrors;

  const handleApplyPreset = (nextPresetId: string) => {
    const presets = PROVIDER_PRESETS[provider] || [];
    const preset = presets.find((p) => p.id === nextPresetId);
    if (!preset) return;

    setModel(preset.model);
    if (provider !== 'kimi') {
      setBaseURL(preset.baseURL || '');
    }

    const policy = getMaxTokensPolicy(provider, preset.model);
    setGenerationParams((prev) => {
      const clamped = clampMaxTokens(prev.maxTokens, provider, preset.model);
      const bumped = clamped < policy.recommendedDefault ? policy.recommendedDefault : clamped;
      return { ...prev, maxTokens: clampMaxTokens(bumped, provider, preset.model) };
    });
  };

  const handleSwitchProfile = async (nextProfileId: string) => {
    if (isLocked) return;
    if (!nextProfileId || nextProfileId === activeProfileId) return;

    if (isDirty) {
      const ok = await confirm({
        title: '切换配置档案',
        description: '切换后将丢弃当前未保存的修改（如需保留，请先保存）。是否继续？',
      });
      if (!ok) return;
    }

    setActiveProfile(nextProfileId);
  };

  const handleCreateProfile = () => {
    const defaults = PROVIDER_PRESETS[provider]?.[0];
    const nextConfig = {
      provider,
      apiKey: '',
      model: defaults?.model || model || 'deepseek-chat',
      baseURL: provider === 'kimi' ? undefined : normalizedBaseURL(defaults?.baseURL || baseURL),
      generationParams,
    } as const;

    createProfile({
      name: `新档案 ${new Date().toLocaleString('zh-CN')}`,
      config: nextConfig,
      pricing: parsePricing(),
    });
  };

  const handleDuplicateProfile = () => {
    const nextConfig = {
      provider,
      apiKey,
      model,
      baseURL: provider === 'kimi' ? undefined : normalizedBaseURL(baseURL),
      generationParams,
    } as const;

    createProfile({
      name: `复制 - ${profileName.trim() || '未命名档案'}`,
      config: nextConfig,
      pricing: parsePricing(),
    });
  };

  const handleDeleteProfile = async () => {
    if (!activeProfileId) return;

    const ok = await confirm({
      title: '删除配置档案',
      description: '删除后无法恢复。建议先导出备份或复制档案。是否继续？',
      confirmText: '删除',
      destructive: true,
    });
    if (!ok) return;

    deleteProfile(activeProfileId);
  };

  const handleSave = () => {
    if (isLocked) {
      toast({
        title: '配置已锁定',
        description: '请输入加密密码解锁后再保存/测试配置',
        variant: 'destructive',
      });
      return;
    }

    if (hasSaveValidationErrors) {
      toast({
        title: '请检查表单错误',
        description: '请先修正标红字段再保存',
        variant: 'destructive',
      });
      return;
    }

    if (!activeProfileId) {
      createProfile({
        name: profileName.trim() || '默认档案',
        config: {
          provider,
          apiKey,
          baseURL: provider === 'kimi' ? undefined : normalizedBaseURL(baseURL),
          model,
          generationParams,
        },
        pricing: parsePricing(),
      });
    } else {
      updateProfile(activeProfileId, {
        name: profileName.trim() || activeProfile?.name || '默认档案',
        config: {
          provider,
          apiKey,
          baseURL: provider === 'kimi' ? undefined : normalizedBaseURL(baseURL),
          model,
          generationParams,
        },
        pricing: parsePricing(),
      });
    }

    toast({
      title: '配置已保存',
      description: 'AI 服务配置保存成功',
    });

    onOpenChange(false);
  };

  const handleTest = async () => {
    if (isLocked) {
      toast({
        title: '配置已锁定',
        description: '请输入加密密码解锁后再保存/测试配置',
        variant: 'destructive',
      });
      return;
    }

    if (hasConfigValidationErrors) {
      toast({
        title: '请检查表单错误',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    const success = await testConnection({
      provider,
      apiKey,
      baseURL: provider === 'kimi' ? undefined : normalizedBaseURL(baseURL),
      model,
      generationParams,
    });
    setIsTesting(false);

    if (success) {
      toast({
        title: '连接测试成功',
        description: 'API 配置有效',
      });
    } else {
      toast({
        title: '连接测试失败',
        description: '请检查 API Key 和配置是否正确',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLastTest = async () => {
    if (!lastTest) return;

    const lines = [
      `档案：${profileName.trim() || activeProfile?.name || '-'}`,
      `供应商：${provider}`,
      `模型：${model}`,
      `结果：${lastTest.status === 'success' ? '成功' : '失败'}`,
      `时间：${formatDateTime(lastTest.testedAt)}`,
      `耗时：${formatDuration(lastTest.durationMs)}`,
      lastTest.httpStatus ? `HTTP：${lastTest.httpStatus}` : '',
      lastTest.errorMessage ? `错误：${lastTest.errorMessage}` : '',
      lastTest.suggestions?.length ? `建议：\n- ${lastTest.suggestions.join('\n- ')}` : '',
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({ title: '已复制测试详情' });
    } catch {
      toast({
        title: '复制失败',
        description: '浏览器可能禁止剪贴板访问，请手动复制',
        variant: 'destructive',
      });
    }
  };

  const handleUnlock = async () => {
    setUnlockError('');

    const password = unlockPassword;
    if (!password) {
      setUnlockError('请输入加密密码');
      return;
    }

    setIsUnlocking(true);
    try {
      const ok = verifyMasterPassword(password);
      if (!ok) {
        setUnlockError('密码不正确');
        return;
      }

      initializeEncryption(password);
      loadConfig();
      setUnlockPassword('');

      toast({
        title: '已解锁',
        description: '现在可以查看与修改 API 配置',
      });
    } catch {
      setUnlockError('解锁失败，请重试');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleSetEncryptionPassword = () => {
    setPasswordError('');

    if (encryptionPassword.length < 6) {
      setPasswordError('密码至少6位');
      return;
    }

    if (encryptionPassword !== confirmPassword) {
      setPasswordError('密码不匹配');
      return;
    }

    try {
      initializeEncryption(encryptionPassword);
      loadConfig();
      setHasCustomPassword(true);
      setEncryptionPassword('');
      setConfirmPassword('');
      toast({
        title: '加密密码已设置',
        description: '您的数据现在使用自定义密码保护',
      });
    } catch {
      setPasswordError('设置密码失败');
    }
  };

  const handleChangePassword = () => {
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('新密码至少6位');
      return;
    }

    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }

    const ok = verifyMasterPassword(currentPassword);
    if (!ok) {
      setPasswordError('当前密码不正确');
      return;
    }

    try {
      initializeEncryption(currentPassword);
    } catch {
      setPasswordError('解锁失败，请检查当前密码');
      return;
    }

    const success = changeEncryptionPassword(newPassword);
    if (success) {
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      toast({
        title: '密码已更换',
        description: '加密密码已成功更新',
      });
    } else {
      setPasswordError('更换密码失败');
    }
  };

  const handleForgetPassword = () => {
    setShowForgetConfirm(true);
  };

  const handleConfirmReset = () => {
    localStorage.removeItem('aixs_config');
    localStorage.removeItem('aixs_key_salt');
    localStorage.removeItem('aixs_key_version');
    localStorage.removeItem('aixs_has_custom_password');
    localStorage.removeItem(ENCRYPTION_CHECK_KEY);
    KeyManager.reset();
    clearConfig();

    setHasCustomPassword(false);
    setShowForgetConfirm(false);
    setApiKey('');

    toast({
      title: '已重置加密',
      description: '请重新设置密码并配置 API Key',
    });
  };

  // 渲染连接配置选项卡
  const renderConnectionTab = () => (
    <div className="space-y-5">
      {/* 档案选择 */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Select
            value={activeProfileId || ''}
            onValueChange={(v) => void handleSwitchProfile(v)}
          >
            <SelectTrigger disabled={isLocked} className="h-10">
              <SelectValue placeholder="选择档案" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-amber-500" />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={handleCreateProfile} disabled={isLocked}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={handleDuplicateProfile} disabled={isLocked}>
            <CopyPlus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => void handleDeleteProfile()}
            disabled={profiles.length <= 1 || isLocked}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 档案名称 */}
      <div className="space-y-2">
        <Label htmlFor="profileName">档案名称</Label>
        <Input
          id="profileName"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          disabled={isLocked}
          placeholder="为此配置起个名字"
        />
        {validationErrors.profileName && (
          <p className="text-sm text-destructive">{validationErrors.profileName}</p>
        )}
      </div>

      {/* 供应商和预设 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>供应商</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
            <SelectTrigger disabled={isLocked}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
              <SelectItem value="kimi">Kimi (月之暗面)</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="openai-compatible">OpenAI 兼容</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>快速预设</Label>
          <Select
            value={presetId}
            onValueChange={(v) => {
              setPresetId(v);
              handleApplyPreset(v);
              setPresetId('');
            }}
          >
            <SelectTrigger disabled={isLocked}>
              <SelectValue placeholder="选择模型预设" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_PRESETS[provider].map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor="apiKey" className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5" />
          API Key
        </Label>
        <div className="relative">
          <Input
            id="apiKey"
            type={showApiKey ? 'text' : 'password'}
            placeholder={
              apiMode && activeProfileId && !activeProfileId.startsWith('draft_')
                ? '留空表示保持不变'
                : '请输入 API Key'
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="pr-10"
            disabled={isLocked}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => setShowApiKey(!showApiKey)}
            disabled={isLocked}
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {validationErrors.apiKey && (
          <p className="text-sm text-destructive">{validationErrors.apiKey}</p>
        )}
      </div>

      {/* Base URL */}
      {provider !== 'kimi' && (
        <div className="space-y-2">
          <Label htmlFor="baseURL">Base URL (可选)</Label>
          <Input
            id="baseURL"
            placeholder={
              provider === 'gemini'
                ? 'https://generativelanguage.googleapis.com'
                : 'https://api.example.com'
            }
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            disabled={isLocked}
          />
          {validationErrors.baseURL && (
            <p className="text-sm text-destructive">{validationErrors.baseURL}</p>
          )}
        </div>
      )}

      {/* 模型名称 */}
      <div className="space-y-2">
        <Label htmlFor="model">模型名称</Label>
        <Input
          id="model"
          placeholder={provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isLocked}
        />
        {validationErrors.model && (
          <p className="text-sm text-destructive">{validationErrors.model}</p>
        )}
      </div>

      {/* 测试连接 */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isTesting || isLocked || hasConfigValidationErrors}
          className="flex-1"
        >
          {isTesting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              测试中...
            </>
          ) : (
            '测试连接'
          )}
        </Button>
        {lastTest && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm',
              lastTest.status === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {lastTest.status === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            <span>{lastTest.status === 'success' ? '连接正常' : '连接失败'}</span>
          </div>
        )}
      </div>

      {/* 连接错误信息 */}
      {lastTest?.status === 'error' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          {lastTest.errorMessage && (
            <p className="text-sm text-destructive">{lastTest.errorMessage}</p>
          )}
          {lastTest.suggestions?.length ? (
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
              {lastTest.suggestions.slice(0, 3).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void handleCopyLastTest()}>
            <Copy className="mr-2 h-3 w-3" />
            复制错误信息
          </Button>
        </div>
      )}
    </div>
  );

  // 渲染生成参数选项卡
  const renderParamsTab = () => (
    <div className="space-y-5">
      {/* 当前参数概览 */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">AI 生成参数</p>
            <p className="text-xs text-muted-foreground">
              Temperature {generationParams.temperature.toFixed(2)} · TopP{' '}
              {generationParams.topP.toFixed(2)} · MaxTokens {generationParams.maxTokens}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiTunerOpen(true)}
            disabled={isLocked}
          >
            <Sliders className="mr-2 h-4 w-4" />
            调整参数
          </Button>
        </div>
      </div>

      {/* 价格配置 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" />
            定价配置 (可选)
          </Label>
          <Select
            value={pricingUnit}
            onValueChange={(v) => handlePricingUnitChange(v as PricingUnit)}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_1M">USD/1M tokens</SelectItem>
              <SelectItem value="per_1K">USD/1K tokens</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pricingInput" className="text-xs text-muted-foreground">
              输入价
            </Label>
            <Input
              id="pricingInput"
              inputMode="decimal"
              placeholder={pricingUnit === 'per_1M' ? '1.0' : '0.001'}
              value={pricingInput}
              onChange={(e) => setPricingInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricingOutput" className="text-xs text-muted-foreground">
              输出价
            </Label>
            <Input
              id="pricingOutput"
              inputMode="decimal"
              placeholder={pricingUnit === 'per_1M' ? '2.0' : '0.002'}
              value={pricingOutput}
              onChange={(e) => setPricingOutput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricingCachedInput" className="text-xs text-muted-foreground">
              缓存输入价
            </Label>
            <Input
              id="pricingCachedInput"
              inputMode="decimal"
              placeholder={pricingUnit === 'per_1M' ? '0.5' : '0.0005'}
              value={pricingCachedInput}
              onChange={(e) => setPricingCachedInput(e.target.value)}
            />
          </div>
        </div>
        {validationErrors.pricing && (
          <p className="text-sm text-destructive">{validationErrors.pricing}</p>
        )}
        <p className="text-xs text-muted-foreground">
          用于成本估算，不填则使用默认估算
        </p>
      </div>
    </div>
  );

  // 渲染用量统计选项卡
  const renderUsageTab = () => (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        统计当前档案近 24 小时的 AI 调用数据
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">调用次数</p>
          <p className="text-2xl font-semibold">{usage24h.stats.totalCalls}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">成功率</p>
          <p className="text-2xl font-semibold">{usage24h.stats.successRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">平均耗时</p>
          <p className="text-2xl font-semibold">{formatDuration(usage24h.stats.avgDurationMs)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">费用估算</p>
          <p className="text-2xl font-semibold">${usage24h.costUSD.toFixed(4)}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-medium">详细信息</p>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Token 总计：{usage24h.stats.totalTokens.toLocaleString()}</p>
          <p>
            覆盖率：{usage24h.stats.tokenizedCalls}/{usage24h.stats.totalCalls}
          </p>
          <p>P95 耗时：{formatDuration(usage24h.stats.p95DurationMs)}</p>
        </div>
      </div>
    </div>
  );

  // 渲染安全设置选项卡
  const renderSecurityTab = () => {
    if (apiMode) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="h-12 w-12 text-green-500 mb-4" />
          <p className="text-sm font-medium">服务端安全存储</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
            API Key 已加密存储在服务端，浏览器不会保存明文
          </p>
        </div>
      );
    }

    if (isLocked) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <Lock className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm">配置已锁定，请输入密码解锁</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unlockPassword">加密密码</Label>
            <Input
              id="unlockPassword"
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="请输入密码以解锁"
            />
          </div>
          {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}

          <div className="flex gap-2">
            <Button onClick={() => void handleUnlock()} disabled={isUnlocking}>
              {isUnlocking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  解锁中...
                </>
              ) : (
                '解锁'
              )}
            </Button>
            <Button variant="ghost" onClick={handleForgetPassword}>
              忘记密码
            </Button>
          </div>

          {showForgetConfirm && (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
              <p className="text-sm font-medium text-destructive">⚠️ 警告</p>
              <p className="text-sm">此操作将清除所有加密配置，包括已保存的 API Key。</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleConfirmReset}>
                  确认重置
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowForgetConfirm(false)}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (hasCustomPassword) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-green-500/30 bg-green-500/5">
            <Shield className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">已启用加密保护</p>
              <p className="text-xs text-muted-foreground">您的 API Key 使用自定义密码加密存储</p>
            </div>
          </div>

          {isChangingPassword ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">当前密码</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">新密码</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少6位字符"
                />
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleChangePassword}>
                  确认更换
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsChangingPassword(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsChangingPassword(true)}>
                更换密码
              </Button>
              <Button variant="ghost" onClick={handleForgetPassword}>
                忘记密码
              </Button>
            </div>
          )}

          {showForgetConfirm && (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
              <p className="text-sm font-medium text-destructive">⚠️ 警告</p>
              <p className="text-sm">此操作将清除所有加密配置，包括已保存的 API Key。</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleConfirmReset}>
                  确认重置
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowForgetConfirm(false)}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 未设置密码
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">使用默认加密</p>
            <p className="text-xs text-muted-foreground">建议设置自定义密码以增强安全性</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="encryptionPassword">加密密码</Label>
            <Input
              id="encryptionPassword"
              type="password"
              value={encryptionPassword}
              onChange={(e) => setEncryptionPassword(e.target.value)}
              placeholder="至少6位字符"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
            />
          </div>
          {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          <Button onClick={handleSetEncryptionPassword}>设置加密密码</Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl min-h-[500px] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <div className="flex h-full">
          {/* 左侧标签导航 */}
          <div className="w-44 shrink-0 border-r bg-muted/30 flex flex-col">
            <DialogHeader className="px-4 py-4 border-b">
              <DialogTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                AI 设置
              </DialogTitle>
            </DialogHeader>
            <nav className="flex-1 p-2 space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-muted',
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'connection' && renderConnectionTab()}
              {activeTab === 'params' && renderParamsTab()}
              {activeTab === 'usage' && renderUsageTab()}
              {activeTab === 'security' && renderSecurityTab()}
            </div>

            {/* 底部操作栏 */}
            <DialogFooter className="border-t px-5 py-3 bg-muted/20">
              <div className="flex items-center justify-between w-full">
                <div className="text-xs text-muted-foreground">
                  {isDirty && <span className="text-amber-500">● 有未保存的更改</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSave} disabled={isLocked || hasSaveValidationErrors}>
                    保存配置
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </div>
        </div>

        {/* AI 参数调优弹窗 */}
        <Dialog open={aiTunerOpen} onOpenChange={setAiTunerOpen}>
          <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>AI 参数调优</DialogTitle>
              <DialogDescription>这些参数会影响所有 AI 生成效果。</DialogDescription>
            </DialogHeader>
            <AIParameterTuner
              provider={provider}
              model={model}
              params={generationParams}
              onParamsChange={setGenerationParams}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAiTunerOpen(false)}>
                完成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog />
      </DialogContent>
    </Dialog>
  );
}
