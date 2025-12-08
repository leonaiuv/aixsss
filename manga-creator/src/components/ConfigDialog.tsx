import { useState, useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { ProviderType } from '@/types';
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
import { Eye, EyeOff, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setBaseURL(config.baseURL || '');
      setModel(config.model);
    }
  }, [config]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>API配置</DialogTitle>
          <DialogDescription>
            配置你的AI服务商API密钥。数据将加密存储在本地。
          </DialogDescription>
        </DialogHeader>
        
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
