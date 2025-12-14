import { useState, useEffect, useMemo } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { ProviderType, type AIGenerationParams, type AIPricing, type ConnectionTestResult } from '@/types';
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
import { Eye, EyeOff, Loader2, Shield, ShieldAlert, Lock, Sliders, Layers, Copy, Trash2, Plus, CopyPlus } from 'lucide-react';
import { AIParameterTuner } from './editor/AIParameterTuner';

const DEFAULT_GENERATION_PARAMS: AIGenerationParams = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1500,
  presencePenalty: 0.3,
  frequencyPenalty: 0.3,
};

const PROVIDER_PRESETS: Record<ProviderType, Array<{ id: string; label: string; model: string; baseURL?: string }>> = {
  deepseek: [
    { id: 'deepseek-default', label: 'DeepSeek 默认（deepseek-chat）', model: 'deepseek-chat', baseURL: 'https://api.deepseek.com' },
    { id: 'deepseek-reasoner', label: 'DeepSeek 推理（deepseek-reasoner）', model: 'deepseek-reasoner', baseURL: 'https://api.deepseek.com' },
  ],
  kimi: [
    { id: 'kimi-8k', label: 'Kimi 8k（moonshot-v1-8k）', model: 'moonshot-v1-8k' },
    { id: 'kimi-32k', label: 'Kimi 32k（moonshot-v1-32k）', model: 'moonshot-v1-32k' },
    { id: 'kimi-128k', label: 'Kimi 128k（moonshot-v1-128k）', model: 'moonshot-v1-128k' },
  ],
  gemini: [
    { id: 'gemini-flash', label: 'Gemini Flash（gemini-1.5-flash）', model: 'gemini-1.5-flash', baseURL: 'https://generativelanguage.googleapis.com' },
    { id: 'gemini-pro', label: 'Gemini Pro（gemini-1.5-pro）', model: 'gemini-1.5-pro', baseURL: 'https://generativelanguage.googleapis.com' },
    { id: 'gemini-legacy', label: 'Gemini 旧版（gemini-pro）', model: 'gemini-pro', baseURL: 'https://generativelanguage.googleapis.com' },
  ],
  'openai-compatible': [
    { id: 'openai-official-mini', label: 'OpenAI 官方（gpt-4o-mini）', model: 'gpt-4o-mini', baseURL: 'https://api.openai.com' },
    { id: 'openai-official', label: 'OpenAI 官方（gpt-4o）', model: 'gpt-4o', baseURL: 'https://api.openai.com' },
    { id: 'openai-35', label: 'OpenAI（gpt-3.5-turbo）', model: 'gpt-3.5-turbo', baseURL: 'https://api.openai.com' },
  ],
};

function normalizeGenerationParams(
  params: AIGenerationParams | undefined
): AIGenerationParams {
  return {
    ...DEFAULT_GENERATION_PARAMS,
    ...params,
    presencePenalty: params?.presencePenalty ?? DEFAULT_GENERATION_PARAMS.presencePenalty,
    frequencyPenalty: params?.frequencyPenalty ?? DEFAULT_GENERATION_PARAMS.frequencyPenalty,
  };
}

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps) {
  const {
    config,
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
  const [provider, setProvider] = useState<ProviderType>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [profileName, setProfileName] = useState('默认档案');
  const [pricingPromptPer1K, setPricingPromptPer1K] = useState('');
  const [pricingCompletionPer1K, setPricingCompletionPer1K] = useState('');
  const [presetId, setPresetId] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [generationParams, setGenerationParams] = useState<AIGenerationParams>(
    DEFAULT_GENERATION_PARAMS
  );
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

    const storedGen = normalizeGenerationParams(activeProfile.config.generationParams);
    const draftGen = normalizeGenerationParams(generationParams);
    const sameGen = JSON.stringify(storedGen) === JSON.stringify(draftGen);

    const storedPricing = activeProfile.pricing
      ? `${activeProfile.pricing.promptPer1K}|${activeProfile.pricing.completionPer1K}`
      : '';
    const draftPricingParsed = parsePricing();
    const draftPricing = draftPricingParsed
      ? `${draftPricingParsed.promptPer1K}|${draftPricingParsed.completionPer1K}`
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
    pricingCompletionPer1K,
    pricingPromptPer1K,
    profileName,
    provider,
  ]);

  useEffect(() => {
    if (!open) return;

    if (activeProfile) {
      setProfileName(activeProfile.name);
      setProvider(activeProfile.config.provider);
      setApiKey(activeProfile.config.apiKey);
      setBaseURL(activeProfile.config.baseURL || '');
      setModel(activeProfile.config.model);
      setGenerationParams(normalizeGenerationParams(activeProfile.config.generationParams));
      setPricingPromptPer1K(
        activeProfile.pricing ? String(activeProfile.pricing.promptPer1K) : ''
      );
      setPricingCompletionPer1K(
        activeProfile.pricing ? String(activeProfile.pricing.completionPer1K) : ''
      );
    } else {
      setProfileName('默认档案');
      setProvider('deepseek');
      setApiKey('');
      setBaseURL('');
      setModel('deepseek-chat');
      setGenerationParams(DEFAULT_GENERATION_PARAMS);
      setPricingPromptPer1K('');
      setPricingCompletionPer1K('');
    }

    setPresetId('');

    // 检查加密状态
    setHasCustomPassword(KeyManager.hasCustomPassword());
  }, [activeProfileId, open]);

  useEffect(() => {
    if (!open) return;
    setPasswordError('');
    setUnlockError('');
    setShowForgetConfirm(false);
  }, [open]);

  function normalizedBaseURL(input: string): string | undefined {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const withoutTrailingSlash = trimmed.replace(/\/$/, '');
    return withoutTrailingSlash.replace(/\/(v1beta|v1)$/, '');
  }

  function parsePricing(): AIPricing | undefined {
    const promptRaw = pricingPromptPer1K.trim();
    const completionRaw = pricingCompletionPer1K.trim();
    if (!promptRaw && !completionRaw) return undefined;

    const prompt = Number(promptRaw);
    const completion = Number(completionRaw);
    if (!Number.isFinite(prompt) || prompt < 0) return undefined;
    if (!Number.isFinite(completion) || completion < 0) return undefined;

    return { currency: 'USD', promptPer1K: prompt, completionPer1K: completion };
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

    // 后端模式：编辑已有服务端档案时，API Key 允许留空（表示“保持不变”）
    const requiresApiKey =
      !apiMode || !activeProfileId || (typeof activeProfileId === 'string' && activeProfileId.startsWith('draft_'));
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

    const pricingRawPrompt = pricingPromptPer1K.trim();
    const pricingRawCompletion = pricingCompletionPer1K.trim();
    if (pricingRawPrompt || pricingRawCompletion) {
      const pricing = parsePricing();
      if (!pricing) errors.pricing = '价格格式不正确（请输入非负数字）';
    }

    return errors;
  };

  const validationErrors = getValidationErrors();
  const hasConfigValidationErrors = Boolean(
    validationErrors.apiKey || validationErrors.model || validationErrors.baseURL
  );
  const hasProfileValidationErrors = Boolean(
    validationErrors.profileName || validationErrors.pricing
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
      description: 'API配置保存成功',
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
        description: 'API配置有效',
      });
    } else {
      toast({
        title: '连接测试失败',
        description: '请检查API Key和配置是否正确',
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

  // 设置加密密码
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

  // 更换密码
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
      // 先用当前密码解锁，再更换
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

  // 忘记密码 - 重置加密
  const handleForgetPassword = () => {
    setShowForgetConfirm(true);
  };

  const handleConfirmReset = () => {
    // 清除加密配置
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API配置</DialogTitle>
          <DialogDescription>
            {apiMode
              ? '配置你的AI服务商。API Key 将加密存储在服务端；浏览器不会保存明文。'
              : '配置你的AI服务商API密钥。数据将加密存储在本地。'}
          </DialogDescription>
        </DialogHeader>
        
        {/* 加密设置区域 */}
        {apiMode ? null : (
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4" />
            <span className="font-medium">加密设置</span>
          </div>
          
          {isLocked ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                检测到已设置自定义加密密码。请先解锁后再查看/修改 API 配置。
              </div>
              <div className="space-y-2">
                <Label htmlFor="unlockPassword">加密密码</Label>
                <Input
                  id="unlockPassword"
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="请输入密码以解锁"
                  className="h-11"
                />
              </div>
              {unlockError ? (
                <p className="text-sm text-destructive">{unlockError}</p>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleUnlock()} disabled={isUnlocking}>
                  {isUnlocking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      解锁中...
                    </>
                  ) : (
                    '解锁'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={handleForgetPassword}
                >
                  忘记密码
                </Button>
              </div>

              {showForgetConfirm ? (
                <div className="space-y-3 p-3 bg-destructive/10 rounded border border-destructive/30">
                  <p className="text-sm font-medium text-destructive">⚠️ 警告</p>
                  <p className="text-sm">此操作将清除所有加密配置，包括已保存的 API Key。您需要重新配置。</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleConfirmReset}>
                      确认重置
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowForgetConfirm(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : hasCustomPassword ? (
            // 已设置密码
            <div>
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-3">
                <Shield className="h-4 w-4" />
                <span className="text-sm">已启用加密保护</span>
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
                      className="h-11"
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
                      className="h-11"
                    />
                  </div>
                  {passwordError && (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleChangePassword}>确认更换</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsChangingPassword(false)}>取消</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsChangingPassword(true)}>
                    更换密码
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={handleForgetPassword}>
                    忘记密码
                  </Button>
                </div>
              )}

              {showForgetConfirm ? (
                <div className="mt-3 space-y-3 p-3 bg-destructive/10 rounded border border-destructive/30">
                  <p className="text-sm font-medium text-destructive">⚠️ 警告</p>
                  <p className="text-sm">此操作将清除所有加密配置，包括已保存的 API Key。您需要重新配置。</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleConfirmReset}>确认重置</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowForgetConfirm(false)}>取消</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            // 未设置密码
            <div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-3">
                <ShieldAlert className="h-4 w-4" />
                <span className="text-sm">使用默认加密，建议设置自定义密码</span>
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
                    className="h-11"
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
                    className="h-11"
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
                <Button size="sm" onClick={handleSetEncryptionPassword}>
                  设置加密密码
                </Button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* 配置档案（多配置） */}
        {isLocked ? null : (
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                <span className="font-medium">配置档案</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleCreateProfile}>
                  <Plus className="mr-2 h-4 w-4" />
                  新建
                </Button>
                <Button size="sm" variant="outline" onClick={handleDuplicateProfile}>
                  <CopyPlus className="mr-2 h-4 w-4" />
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleDeleteProfile()}
                  disabled={profiles.length <= 1}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>当前档案</Label>
              <Select value={activeProfileId || ''} onValueChange={(v) => void handleSwitchProfile(v)}>
                <SelectTrigger className="h-11 text-base md:text-sm">
                  <SelectValue placeholder="选择档案" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.config.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 space-y-2">
              <Label htmlFor="profileName">档案名称</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={isLocked}
                className="h-11"
              />
              {validationErrors.profileName ? (
                <p className="text-sm text-destructive">{validationErrors.profileName}</p>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              <Label>价格（可选，USD/1K tokens）</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pricingPromptPer1K" className="text-xs text-muted-foreground">
                    Prompt
                  </Label>
                  <Input
                    id="pricingPromptPer1K"
                    inputMode="decimal"
                    placeholder="例如 0.001"
                    value={pricingPromptPer1K}
                    onChange={(e) => setPricingPromptPer1K(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricingCompletionPer1K" className="text-xs text-muted-foreground">
                    Completion
                  </Label>
                  <Input
                    id="pricingCompletionPer1K"
                    inputMode="decimal"
                    placeholder="例如 0.002"
                    value={pricingCompletionPer1K}
                    onChange={(e) => setPricingCompletionPer1K(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              {validationErrors.pricing ? (
                <p className="text-sm text-destructive">{validationErrors.pricing}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  用于“统计分析/配置页”的成本估算；不填则按默认粗略口径计算。
                </p>
              )}
            </div>
          </div>
        )}
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>供应商</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
              <SelectTrigger disabled={isLocked} className="h-11 text-base md:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="kimi">Kimi (月之暗面)</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="openai-compatible">OpenAI兼容</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>一键预设</Label>
            <Select
              value={presetId}
              onValueChange={(v) => {
                setPresetId(v);
                handleApplyPreset(v);
                setPresetId('');
              }}
            >
              <SelectTrigger disabled={isLocked} className="h-11 text-base md:text-sm">
                <SelectValue placeholder="选择常用模型/默认 Base URL" />
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

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={
                    apiMode && activeProfileId && !activeProfileId.startsWith('draft_')
                      ? '留空表示保持不变（已安全存于服务端）'
                      : '请输入 API Key'
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-11 pr-10"
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
            {validationErrors.apiKey ? (
              <p className="text-sm text-destructive">{validationErrors.apiKey}</p>
            ) : null}
            {apiMode && activeProfileId && !activeProfileId.startsWith('draft_') ? (
              <p className="text-xs text-muted-foreground">
                安全提示：浏览器不会保存 API Key；留空仅更新“模型/参数”，不改动服务端密钥。
              </p>
            ) : null}
          </div>

          {provider === 'kimi' ? null : (
            <div className="space-y-2">
              <Label htmlFor="baseURL">Base URL (可选)</Label>
              <Input
                id="baseURL"
                placeholder={provider === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.example.com'}
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                disabled={isLocked}
                className="h-11"
              />
              {baseURL.trim() && /\/(v1beta|v1)\/?$/.test(baseURL.trim()) ? (
                <p className="text-xs text-muted-foreground">
                  提示：不要包含 <code>/v1</code>/<code>/v1beta</code>，保存/测试时会自动移除。
                </p>
              ) : null}
              {validationErrors.baseURL ? (
                <p className="text-sm text-destructive">{validationErrors.baseURL}</p>
              ) : null}
              {provider === 'openai-compatible' ? (
                <p className="text-xs text-muted-foreground">
                  OpenAI 兼容接口通常是：BaseURL + `/v1/chat/completions`。
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="model">模型名称</Label>
            <Input
              id="model"
              placeholder={provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLocked}
              className="h-11"
            />
            {validationErrors.model ? (
              <p className="text-sm text-destructive">{validationErrors.model}</p>
            ) : null}
          </div>

          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Sliders className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">AI 生成参数</p>
                  <p className="text-xs text-muted-foreground">
                    Temperature {generationParams.temperature.toFixed(2)} · TopP{' '}
                    {generationParams.topP.toFixed(2)} · MaxTokens {generationParams.maxTokens}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAiTunerOpen(true)}
                disabled={isLocked}
              >
                调优
              </Button>
            </div>
          </div>

          <Button 
            variant="outline" 
            onClick={handleTest}
            disabled={isTesting || isLocked || hasConfigValidationErrors}
            className="w-full"
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

          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="font-medium">连接状态 & 近24小时</span>
              </div>
              {lastTest ? (
                <span
                  className={
                    lastTest.status === 'success'
                      ? 'text-xs text-green-600 dark:text-green-400'
                      : 'text-xs text-destructive'
                  }
                >
                  上次测试：{lastTest.status === 'success' ? '成功' : '失败'}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">未测试</span>
              )}
            </div>

            {lastTest ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className={lastTest.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>
                    {lastTest.status === 'success' ? '连接正常' : '连接失败'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(lastTest.testedAt)} · {formatDuration(lastTest.durationMs)}
                  </span>
                </div>

                {typeof lastTest.httpStatus === 'number' ? (
                  <div className="text-xs text-muted-foreground">HTTP {lastTest.httpStatus}</div>
                ) : null}

                {lastTest.status === 'error' ? (
                  <div className="space-y-2">
                    {lastTest.errorMessage ? (
                      <div className="text-xs text-muted-foreground break-words">
                        {lastTest.errorMessage}
                      </div>
                    ) : null}
                    {lastTest.suggestions?.length ? (
                      <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                        {lastTest.suggestions.slice(0, 6).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyLastTest()}>
                      <Copy className="mr-2 h-4 w-4" />
                      复制错误信息
                    </Button>
                  </div>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyLastTest()}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制测试详情
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                建议：保存前先点击“测试连接”，确认 API Key、模型与 Base URL 可用。
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-md border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">调用次数</p>
                <p className="text-lg font-semibold">{usage24h.stats.totalCalls}</p>
              </div>
              <div className="rounded-md border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">成功率</p>
                <p className="text-lg font-semibold">{usage24h.stats.successRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-md border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">平均耗时</p>
                <p className="text-lg font-semibold">{formatDuration(usage24h.stats.avgDurationMs)}</p>
              </div>
              <div className="rounded-md border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">费用估算（$）</p>
                <p className="text-lg font-semibold">${usage24h.costUSD.toFixed(4)}</p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Token（可统计）：{usage24h.stats.totalTokens.toLocaleString()} · 覆盖率 {usage24h.stats.tokenizedCalls}/
              {usage24h.stats.totalCalls} · P95 耗时 {formatDuration(usage24h.stats.p95DurationMs)}
            </div>

            <div className="text-xs text-muted-foreground">
              口径：按 AI 调用完成时间统计（success/error）；不包含“测试连接”。
            </div>
          </div>
        </div>

        <Dialog open={aiTunerOpen} onOpenChange={setAiTunerOpen}>
          <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>AI 参数调优</DialogTitle>
              <DialogDescription>这些参数会影响所有 AI 生成效果。</DialogDescription>
            </DialogHeader>
            <AIParameterTuner params={generationParams} onParamsChange={setGenerationParams} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAiTunerOpen(false)}>
                完成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isLocked || hasSaveValidationErrors}>
            保存配置
          </Button>
        </DialogFooter>

        <ConfirmDialog />
      </DialogContent>
    </Dialog>
  );
}
