import { useState, useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { ProviderType } from '@/types';
import { KeyManager } from '@/lib/keyManager';
import { initializeEncryption, changeEncryptionPassword } from '@/lib/storage';
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
import { Eye, EyeOff, Loader2, Shield, ShieldAlert, Lock } from 'lucide-react';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps) {
  const { config, saveConfig, testConnection } = useConfigStore();
  const { toast } = useToast();
  
  const [provider, setProvider] = useState<ProviderType>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // 加密密码相关状态
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showForgetConfirm, setShowForgetConfirm] = useState(false);
  const [hasCustomPassword, setHasCustomPassword] = useState(KeyManager.hasCustomPassword());

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setBaseURL(config.baseURL || '');
      setModel(config.model);
    }
    // 检查加密状态
    setHasCustomPassword(KeyManager.hasCustomPassword());
  }, [config, open]);

  const handleSave = () => {
    if (!apiKey || !model) {
      toast({
        title: '请填写必要信息',
        description: 'API Key和模型名称不能为空',
        variant: 'destructive',
      });
      return;
    }

    saveConfig({
      provider,
      apiKey,
      baseURL: baseURL || undefined,
      model,
    });

    toast({
      title: '配置已保存',
      description: 'API配置保存成功',
    });

    onOpenChange(false);
  };

  const handleTest = async () => {
    if (!apiKey || !model) {
      toast({
        title: '请填写必要信息',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    const success = await testConnection({
      provider,
      apiKey,
      baseURL: baseURL || undefined,
      model,
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
    KeyManager.reset();
    
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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API配置</DialogTitle>
          <DialogDescription>
            配置你的AI服务商API密钥。数据将加密存储在本地。
          </DialogDescription>
        </DialogHeader>
        
        {/* 加密设置区域 */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4" />
            <span className="font-medium">加密设置</span>
          </div>
          
          {hasCustomPassword ? (
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
                  {passwordError && (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleChangePassword}>确认更换</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsChangingPassword(false)}>取消</Button>
                  </div>
                </div>
              ) : showForgetConfirm ? (
                <div className="space-y-3 p-3 bg-destructive/10 rounded border border-destructive/30">
                  <p className="text-sm font-medium text-destructive">⚠️ 警告</p>
                  <p className="text-sm">此操作将清除所有加密配置，包括已保存的 API Key。您需要重新配置。</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleConfirmReset}>确认重置</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowForgetConfirm(false)}>取消</Button>
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
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>供应商</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
              <SelectTrigger>
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
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseURL">Base URL (可选)</Label>
            <Input
              id="baseURL"
              placeholder="https://api.example.com"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">模型名称</Label>
            <Input
              id="model"
              placeholder={provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>

          <Button 
            variant="outline" 
            onClick={handleTest}
            disabled={isTesting}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
