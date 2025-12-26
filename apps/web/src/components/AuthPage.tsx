import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { BookOpen, Sparkles, Layers, Wand2 } from 'lucide-react';

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

  const features = [
    {
      icon: Sparkles,
      title: 'AI 智能分镜',
      description: '自动生成专业级分镜脚本',
    },
    {
      icon: Layers,
      title: '多维度创作',
      description: '角色、世界观、剧情一体化管理',
    },
    {
      icon: Wand2,
      title: '一键优化',
      description: '智能润色与风格调整',
    },
  ];

  return (
    <div className="min-h-screen flex">
      {/* 左侧品牌区域 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-paper-texture" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

        {/* 网格装饰 */}
        <div className="absolute inset-0 bg-grid-subtle opacity-30" />

        <div className="relative z-10 flex flex-col justify-center px-12 lg:px-16 xl:px-20">
          {/* 品牌标识 */}
          <div className="mb-12 opacity-0 animate-fade-in-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight">漫剧创作助手</h1>
                <p className="text-sm text-muted-foreground">AI 驱动的分镜创作工具</p>
              </div>
            </div>
          </div>

          {/* 标语 */}
          <div className="mb-12 opacity-0 animate-fade-in-left animation-delay-100">
            <h2 className="text-4xl lg:text-5xl font-display font-bold leading-tight mb-4">
              <span className="text-foreground">让创意</span>
              <br />
              <span className="text-primary">跃然纸上</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-md">
              借助人工智能的力量，将你的故事创意转化为生动的漫剧分镜脚本。 专业、高效、充满灵感。
            </p>
          </div>

          {/* 特性列表 */}
          <div className="space-y-4">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="flex items-start gap-4 p-4 rounded-lg bg-card/50 backdrop-blur-sm border border-border/50 opacity-0 animate-fade-in-left"
                style={{ animationDelay: `${200 + index * 100}ms` }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧登录区域 */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md opacity-0 animate-fade-in-up">
          {/* 移动端品牌标识 */}
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-display font-bold">漫剧创作助手</h1>
            </div>
            <p className="text-sm text-muted-foreground">AI 驱动的分镜创作工具</p>
          </div>

          <Card className="border-border/60 shadow-ink">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-display">
                {mode === 'login' ? '欢迎回来' : '创建账号'}
              </CardTitle>
              <CardDescription>
                {mode === 'login' ? '登录你的账号，继续创作之旅' : '注册新账号，开始你的创作'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="h-11"
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
                  className="h-11"
                  onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                />
              </div>

              {mode === 'register' && (
                <div className="space-y-2 animate-fade-in">
                  <Label htmlFor="team">团队名称</Label>
                  <Input
                    id="team"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="h-11"
                    placeholder="输入团队名称"
                  />
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md animate-fade-in">
                  {error}
                </div>
              )}

              <Button
                className="w-full h-11 text-base"
                onClick={onSubmit}
                disabled={isLoading || !email.trim() || !password}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    处理中...
                  </span>
                ) : mode === 'login' ? (
                  '登录'
                ) : (
                  '注册'
                )}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {mode === 'login' ? '还没有账号？' : '已有账号？'}
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
              >
                {mode === 'login' ? '创建新账号' : '返回登录'}
              </Button>
            </CardContent>
          </Card>

          {/* 底部提示 */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            登录即表示同意我们的服务条款和隐私政策
          </p>
        </div>
      </div>
    </div>
  );
}
