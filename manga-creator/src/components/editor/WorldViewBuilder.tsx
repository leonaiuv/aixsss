import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useConfigStore } from '@/stores/configStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe,
  Plus,
  Trash2,
  Sparkles,
  Edit2,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { WorldViewElement } from '@/types';
import { AIFactory } from '@/lib/ai/factory';

const ELEMENT_TYPES = [
  { value: 'era', label: '时代背景', icon: '🕐', desc: '故事发生的时代特征' },
  { value: 'geography', label: '地理设定', icon: '🗺️', desc: '世界的地理环境' },
  { value: 'society', label: '社会制度', icon: '🏛️', desc: '社会结构和制度' },
  { value: 'technology', label: '科技水平', icon: '🔬', desc: '科技发展程度' },
  { value: 'magic', label: '魔法体系', icon: '✨', desc: '魔法或超能力设定' },
  { value: 'custom', label: '自定义', icon: '📝', desc: '其他世界观要素' },
] as const;

export function WorldViewBuilder() {
  const { currentProject } = useProjectStore();
  const { elements, loadElements, addElement, updateElement, deleteElement, currentElementId, setCurrentElement } = useWorldViewStore();
  const { config } = useConfigStore();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'era' as WorldViewElement['type'],
    title: '',
    content: '',
  });

  useEffect(() => {
    if (currentProject) {
      loadElements(currentProject.id);
    }
  }, [currentProject?.id, loadElements]);

  useEffect(() => {
    if (currentElementId) {
      const element = elements.find(e => e.id === currentElementId);
      if (element) {
        setFormData({
          type: element.type,
          title: element.title,
          content: element.content,
        });
      }
    }
  }, [currentElementId, elements]);

  if (!currentProject) {
    return null;
  }

  const currentElement = elements.find(e => e.id === currentElementId);

  // AI生成世界观要素
  const handleGenerate = async () => {
    if (!config || !formData.title) return;

    setIsGenerating(true);
    try {
      const client = AIFactory.createClient(config);
      
      const typeLabels: Record<string, string> = {
        era: '时代背景',
        geography: '地理环境',
        society: '社会制度',
        technology: '科技水平',
        magic: '魔法体系',
        custom: '世界观要素',
      };

      const prompt = `你是一位资深的世界观设计师。请为以下${typeLabels[formData.type]}生成详细的设定：

标题：${formData.title}
故事背景：${currentProject.summary}
画风：${currentProject.style}

要求：
1. 内容要与整体故事风格协调一致
2. 细节要具体、可视化
3. 保持内在逻辑自洽
4. 长度控制在200-400字

请直接输出设定内容：`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      setFormData(prev => ({
        ...prev,
        content: response.content.trim(),
      }));
    } catch (error) {
      console.error('生成失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 保存或更新要素
  const handleSave = () => {
    if (!formData.title.trim()) return;

    if (editingId) {
      updateElement(currentProject.id, editingId, formData);
      setEditingId(null);
    } else {
      const newElement = addElement(currentProject.id, {
        projectId: currentProject.id,
        type: formData.type,
        title: formData.title,
        content: formData.content,
        order: elements.length + 1,
      });
      setCurrentElement(newElement.id);
    }

    setFormData({
      type: 'era',
      title: '',
      content: '',
    });
  };

  // 编辑要素
  const handleEdit = (element: WorldViewElement) => {
    setEditingId(element.id);
    setCurrentElement(element.id);
    setFormData({
      type: element.type,
      title: element.title,
      content: element.content,
    });
  };

  // 删除要素
  const handleDelete = (elementId: string) => {
    if (window.confirm('确认删除这个世界观要素吗？')) {
      deleteElement(currentProject.id, elementId);
      if (currentElementId === elementId) {
        setCurrentElement(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              世界观构建
            </h2>
            <p className="text-sm text-muted-foreground">
              构建完整的世界观设定，为分镜创作提供坚实基础
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            {elements.length} 个要素
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">要素列表</TabsTrigger>
            <TabsTrigger value="edit">编辑/新增</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 mt-4">
            {elements.length === 0 ? (
              <div className="text-center py-12">
                <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  还没有世界观要素，开始构建吧
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {elements.map((element) => {
                  const type = ELEMENT_TYPES.find(t => t.value === element.type);
                  
                  return (
                    <Card
                      key={element.id}
                      className={`p-4 cursor-pointer transition-colors ${
                        currentElementId === element.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setCurrentElement(element.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{type?.icon}</span>
                          <div>
                            <h3 className="font-semibold">{element.title}</h3>
                            <p className="text-xs text-muted-foreground">{type?.label}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(element);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(element.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {element.content || '暂无内容'}
                      </p>
                    </Card>
                  );
                })}
              </div>
            )}

            {currentElement && (
              <Card className="p-6 bg-muted/30 mt-6">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="text-2xl">
                    {ELEMENT_TYPES.find(t => t.value === currentElement.type)?.icon}
                  </span>
                  {currentElement.title}
                </h3>
                <p className="text-sm whitespace-pre-wrap">{currentElement.content}</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="edit" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="element-type">要素类型</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, type: value as WorldViewElement['type'] }))}
                >
                  <SelectTrigger id="element-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <span>{type.icon}</span>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-muted-foreground">{type.desc}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="element-title">标题</Label>
                <Input
                  id="element-title"
                  placeholder="如：赛博都市、古代王国、星际联邦..."
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="element-content">详细内容</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={!formData.title || isGenerating}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>AI生成</span>
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="element-content"
                  placeholder="详细描述这个世界观要素..."
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  className="min-h-[200px] resize-none"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={!formData.title.trim()}>
                  <Check className="h-4 w-4 mr-2" />
                  {editingId ? '更新' : '保存'}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ type: 'era', title: '', content: '' });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    取消
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>世界观构建提示</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong>完整性</strong>: 覆盖时代、地理、社会、科技等多个维度</li>
          <li>• <strong>一致性</strong>: 各要素之间逻辑自洽，不能互相矛盾</li>
          <li>• <strong>可视化</strong>: 描述要具体，方便后续转化为画面</li>
          <li>• <strong>关联性</strong>: 世界观要素会在分镜生成时自动引用</li>
        </ul>
      </Card>
    </div>
  );
}
