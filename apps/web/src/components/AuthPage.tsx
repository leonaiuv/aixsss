import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('默认团队');
  const navigate = useNavigate();

  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const onSubmit = async () => {
    const e = email.trim();
    if (!e || !password) return;
    try {
      if (mode === 'login') {
        await login(e, password);
      } else {
        await register(e, password, teamName.trim() || '默认团队');
      }
      navigate('/', { replace: true });
    } catch {
      // error 已在 store 中设置
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === 'login' ? '登录' : '注册'}</CardTitle>
          <CardDescription>
            {mode === 'login' ? '使用账号进入你的工作区（数据将保存到服务端）。' : '创建账号并初始化团队。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <Label htmlFor="team">团队名称</Label>
              <Input id="team" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </div>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}

          <Button className="w-full" onClick={onSubmit} disabled={isLoading || !email.trim() || !password}>
            {mode === 'login' ? '登录' : '注册'}
          </Button>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{mode === 'login' ? '还没有账号？' : '已有账号？'}</span>
            <Button
              variant="link"
              className="px-0"
              onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
            >
              {mode === 'login' ? '去注册' : '去登录'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


