// ==========================================
// 角色管理组件
// ==========================================
// 功能：
// 1. 角色创建、编辑、删除
// 2. 角色关系图谱
// 3. 角色出场统计
// 4. 角色外观描述AI生成
// ==========================================

import { useState, useEffect } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { AIFactory } from '@/lib/ai/factory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
// Select 组件暂未使用，保留供未来扩展
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Users,
  Sparkles,
  Link2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// AI生成类型
type GeneratingField = 'appearance' | 'personality' | 'background' | null;

interface CharacterManagerProps {
  projectId: string;
}

export function CharacterManager({ projectId }: CharacterManagerProps) {
  const { characters, addCharacter, updateCharacter, deleteCharacter, loadCharacters } =
    useCharacterStore();
  
  // 加载角色数据
  useEffect(() => {
    loadCharacters(projectId);
  }, [projectId, loadCharacters]);
  const { config } = useConfigStore();
  const { currentProject } = useProjectStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    appearance: '',
    personality: '',
    background: '',
    themeColor: '#6366f1',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<GeneratingField>(null);
  const [error, setError] = useState<string | null>(null);

  const projectCharacters = characters.filter((c) => c.projectId === projectId);

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    if (editingCharacter) {
      updateCharacter(projectId, editingCharacter, formData);
    } else {
      addCharacter(projectId, {
        ...formData,
        projectId,
        relationships: [],
        appearances: [],
      });
    }

    resetForm();
    setIsDialogOpen(false);
  };

  const handleEdit = (characterId: string) => {
    const character = projectCharacters.find((c) => c.id === characterId);
    if (character) {
      setFormData({
        name: character.name,
        appearance: character.appearance,
        personality: character.personality,
        background: character.background,
        themeColor: character.themeColor || '#6366f1',
      });
      setEditingCharacter(characterId);
      setIsDialogOpen(true);
    }
  };

  const handleDelete = (characterId: string) => {
    if (confirm('确定要删除这个角色吗？')) {
      deleteCharacter(projectId, characterId);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      appearance: '',
      personality: '',
      background: '',
      themeColor: '#6366f1',
    });
    setEditingCharacter(null);
    setError(null);
  };

  // AI生成外观描述
  const handleGenerateAppearance = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.name.trim()) {
      setError('请先输入角色名称');
      return;
    }

    setIsGenerating(true);
    setGeneratingField('appearance');
    setError(null);

    try {
      const client = AIFactory.createClient(config);
      
      const projectContext = currentProject 
        ? `\n故事背景：${currentProject.summary}\n视觉风格：${currentProject.style}\n主角特征：${currentProject.protagonist}`
        : '';

      const prompt = `你是一位专业的角色设计师。请为以下角色生成详细的外观描述：

角色名称：${formData.name}
${formData.personality ? `性格特点：${formData.personality}` : ''}
${formData.background ? `背景故事：${formData.background}` : ''}
${projectContext}

要求：
1. 描述要具体、可视化，适合漫画绘制
2. 包含年龄、身材、发型、发色、眼睛特征
3. 包含标志性服装和配饰
4. 体现角色性格和身份
5. 长度控制在100-200字

请直接输出外观描述，不要有多余解释：`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      setFormData(prev => ({
        ...prev,
        appearance: response.content.trim(),
      }));
    } catch (err) {
      console.error('生成外观描述失败:', err);
      setError(err instanceof Error ? err.message : '生成外观描述失败，请重试');
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  // AI生成性格特点
  const handleGeneratePersonality = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.name.trim()) {
      setError('请先输入角色名称');
      return;
    }

    setIsGenerating(true);
    setGeneratingField('personality');
    setError(null);

    try {
      const client = AIFactory.createClient(config);
      
      const projectContext = currentProject 
        ? `\n故事背景：${currentProject.summary}\n视觉风格：${currentProject.style}`
        : '';

      const prompt = `你是一位专业的角色设计师。请为以下角色生成丰富的性格特点描述：

角色名称：${formData.name}
${formData.appearance ? `外观描述：${formData.appearance}` : ''}
${formData.background ? `背景故事：${formData.background}` : ''}
${projectContext}

要求：
1. 描述主要性格特征（如内向/外向、冲动/理智等）
2. 包含情感表达方式
3. 描述与他人的互动模式
4. 突出独特的性格亮点或缺陷
5. 长度控制在80-150字

请直接输出性格描述，不要有多余解释：`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      setFormData(prev => ({
        ...prev,
        personality: response.content.trim(),
      }));
    } catch (err) {
      console.error('生成性格特点失败:', err);
      setError(err instanceof Error ? err.message : '生成性格特点失败，请重试');
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  // AI生成背景故事
  const handleGenerateBackground = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.name.trim()) {
      setError('请先输入角色名称');
      return;
    }

    setIsGenerating(true);
    setGeneratingField('background');
    setError(null);

    try {
      const client = AIFactory.createClient(config);
      
      const projectContext = currentProject 
        ? `\n故事背景：${currentProject.summary}\n视觉风格：${currentProject.style}\n主角特征：${currentProject.protagonist}`
        : '';

      const prompt = `你是一位专业的角色设计师和编剧。请为以下角色生成引人入胜的背景故事：

角色名称：${formData.name}
${formData.appearance ? `外观描述：${formData.appearance}` : ''}
${formData.personality ? `性格特点：${formData.personality}` : ''}
${projectContext}

要求：
1. 包含角色的出身和成长环境
2. 描述影响角色的关键事件
3. 说明角色的动机和目标
4. 为故事发展留下可能的伏笔
5. 长度控制在150-250字

请直接输出背景故事，不要有多余解释：`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      setFormData(prev => ({
        ...prev,
        background: response.content.trim(),
      }));
    } catch (err) {
      console.error('生成背景故事失败:', err);
      setError(err instanceof Error ? err.message : '生成背景故事失败，请重试');
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">角色管理</h2>
            <p className="text-sm text-muted-foreground">
              管理项目中的所有角色
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              添加角色
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>
                {editingCharacter ? '编辑角色' : '添加新角色'}
              </DialogTitle>
              <DialogDescription>
                填写角色的基本信息，这些信息将用于AI生成时的上下文
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {/* 角色名称 */}
                <div className="space-y-2">
                  <Label htmlFor="name">角色名称 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="例如：李明"
                  />
                </div>

                {/* 错误提示 */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}

                {/* 外观描述 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="appearance">外观描述</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleGenerateAppearance}
                      disabled={isGenerating || !formData.name.trim()}
                    >
                      {generatingField === 'appearance' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          AI生成
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    id="appearance"
                    value={formData.appearance}
                    onChange={(e) =>
                      setFormData({ ...formData, appearance: e.target.value })
                    }
                    placeholder="描述角色的外貌特征：年龄、身高、发型、服装等"
                    rows={4}
                    disabled={generatingField === 'appearance'}
                  />
                </div>

                {/* 性格特点 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="personality">性格特点</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleGeneratePersonality}
                      disabled={isGenerating || !formData.name.trim()}
                    >
                      {generatingField === 'personality' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          AI生成
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    id="personality"
                    value={formData.personality}
                    onChange={(e) =>
                      setFormData({ ...formData, personality: e.target.value })
                    }
                    placeholder="描述角色的性格：开朗、内向、冲动、理智等"
                    rows={3}
                    disabled={generatingField === 'personality'}
                  />
                </div>

                {/* 背景故事 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="background">背景故事</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleGenerateBackground}
                      disabled={isGenerating || !formData.name.trim()}
                    >
                      {generatingField === 'background' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          AI生成
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    id="background"
                    value={formData.background}
                    onChange={(e) =>
                      setFormData({ ...formData, background: e.target.value })
                    }
                    placeholder="描述角色的背景：来历、经历、目标等"
                    rows={4}
                    disabled={generatingField === 'background'}
                  />
                </div>

                {/* 主题色 */}
                <div className="space-y-2">
                  <Label htmlFor="themeColor">主题色</Label>
                  <div className="flex gap-2">
                    <Input
                      id="themeColor"
                      type="color"
                      value={formData.themeColor}
                      onChange={(e) =>
                        setFormData({ ...formData, themeColor: e.target.value })
                      }
                      className="w-20"
                    />
                    <Input
                      value={formData.themeColor}
                      onChange={(e) =>
                        setFormData({ ...formData, themeColor: e.target.value })
                      }
                      placeholder="#6366f1"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(false);
                }}
              >
                取消
              </Button>
              <Button onClick={handleSubmit}>
                {editingCharacter ? '保存' : '添加'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 角色列表 */}
      {projectCharacters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">还没有角色</h3>
          <p className="text-sm text-muted-foreground mb-4">
            添加角色可以帮助AI更好地理解故事和生成内容
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projectCharacters.map((character) => (
            <div
              key={character.id}
              className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow"
            >
              {/* 角色头部 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: character.themeColor }}
                  >
                    {character.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold">{character.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {character.appearances.length} 次出场
                    </p>
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(character.id)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(character.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <Separator className="my-3" />

              {/* 角色信息 */}
              <Tabs defaultValue="appearance" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="appearance" className="text-xs">
                    外观
                  </TabsTrigger>
                  <TabsTrigger value="personality" className="text-xs">
                    性格
                  </TabsTrigger>
                  <TabsTrigger value="background" className="text-xs">
                    背景
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="appearance" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.appearance || '暂无外观描述'}
                  </p>
                </TabsContent>
                <TabsContent value="personality" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.personality || '暂无性格描述'}
                  </p>
                </TabsContent>
                <TabsContent value="background" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.background || '暂无背景故事'}
                  </p>
                </TabsContent>
              </Tabs>

              {/* 关系标签 */}
              {character.relationships.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {character.relationships.map((rel, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      {rel.relationshipType}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
