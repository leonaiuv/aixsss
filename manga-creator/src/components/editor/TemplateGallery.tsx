// ==========================================
// 提示词模板库组件
// ==========================================
// 功能：
// 1. 浏览和搜索模板
// 2. 应用模板到当前分镜
// 3. 创建自定义模板
// 4. 模板分类和标签
// ==========================================

import { useState, useMemo } from 'react';
import { useTemplateStore } from '@/stores/templateStore';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Plus,
  Search,
  Star,
  TrendingUp,
  Copy,
  Edit2,
  Trash2,
} from 'lucide-react';

interface TemplateGalleryProps {
  onApplyTemplate: (template: string, variables: Record<string, string>) => void;
}

export function TemplateGallery({ onApplyTemplate }: TemplateGalleryProps) {
  const { templates, addTemplate, updateTemplate, deleteTemplate } =
    useTemplateStore();
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: '',
    category: 'scene',
    description: '',
    template: '',
    style: '',
  });

  // 筛选模板
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' || template.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchQuery, selectedCategory]);

  // 按类别分组
  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category));
    return Array.from(cats);
  }, [templates]);

  const handleApply = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // 检查是否需要填充变量
    if (template.variables.length > 0) {
      setSelectedTemplate(templateId);
      setVariableValues({});
    } else {
      onApplyTemplate(template.template, {});
      updateTemplate(templateId, { usageCount: template.usageCount + 1 });
    }
  };

  const handleSubmitVariables = () => {
    if (!selectedTemplate) return;

    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return;

    onApplyTemplate(template.template, variableValues);
    updateTemplate(selectedTemplate, { usageCount: template.usageCount + 1 });
    setSelectedTemplate(null);
    setVariableValues({});
  };

  const handleCreateTemplate = () => {
    if (!formData.name.trim() || !formData.template.trim()) return;

    // 提取变量（格式：{{variableName}}）
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = variableRegex.exec(formData.template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    addTemplate({
      name: formData.name,
      category: formData.category,
      description: formData.description,
      template: formData.template,
      variables,
      style: formData.style || undefined,
      isBuiltIn: false,
    });

    setFormData({
      name: '',
      category: 'scene',
      description: '',
      template: '',
      style: '',
    });
    setIsCreateDialogOpen(false);
  };

  const handleDelete = async (templateId: string) => {
    const ok = await confirm({
      title: '确认删除模板？',
      description: '删除后无法恢复。',
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;
    deleteTemplate(templateId);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">提示词模板库</h2>
            <p className="text-sm text-muted-foreground">
              {templates.length} 个模板
            </p>
          </div>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              创建模板
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>创建新模板</DialogTitle>
              <DialogDescription>
                创建可复用的提示词模板，使用 {'{{'} 变量名 {'}'} 定义动态内容
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">模板名称 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="例如：科幻城市场景"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">分类 *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scene">场景</SelectItem>
                      <SelectItem value="character">角色</SelectItem>
                      <SelectItem value="action">动作</SelectItem>
                      <SelectItem value="mood">情绪</SelectItem>
                      <SelectItem value="lighting">光影</SelectItem>
                      <SelectItem value="camera">镜头</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">描述</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="简要说明这个模板的用途和效果"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template">模板内容 *</Label>
                  <Textarea
                    id="template"
                    value={formData.template}
                    onChange={(e) =>
                      setFormData({ ...formData, template: e.target.value })
                    }
                    placeholder="例如：{{location}} 的街道，{{time}}，{{weather}}，赛博朋克风格"
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    使用 {'{{'} 变量名 {'}'} 定义可替换的部分
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="style">推荐画风</Label>
                  <Input
                    id="style"
                    value={formData.style}
                    onChange={(e) =>
                      setFormData({ ...formData, style: e.target.value })
                    }
                    placeholder="例如：赛博朋克、日式动漫"
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleCreateTemplate}>创建</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模板..."
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 模板列表 */}
      <Tabs defaultValue="popular" className="w-full">
        <TabsList>
          <TabsTrigger value="popular">
            <TrendingUp className="h-4 w-4 mr-2" />
            热门
          </TabsTrigger>
          <TabsTrigger value="builtin">
            <Star className="h-4 w-4 mr-2" />
            内置
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Edit2 className="h-4 w-4 mr-2" />
            自定义
          </TabsTrigger>
        </TabsList>

        <TabsContent value="popular" className="space-y-3">
          <ScrollArea className="h-[500px] pr-4">
            {filteredTemplates
              .sort((a, b) => b.usageCount - a.usageCount)
              .map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onApply={handleApply}
                  onDelete={handleDelete}
                />
              ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="builtin" className="space-y-3">
          <ScrollArea className="h-[500px] pr-4">
            {filteredTemplates
              .filter((t) => t.isBuiltIn)
              .map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onApply={handleApply}
                  onDelete={handleDelete}
                />
              ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="custom" className="space-y-3">
          <ScrollArea className="h-[500px] pr-4">
            {filteredTemplates
              .filter((t) => !t.isBuiltIn)
              .map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onApply={handleApply}
                  onDelete={handleDelete}
                />
              ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* 变量填充对话框 */}
      {selectedTemplate && (
        <Dialog
          open={!!selectedTemplate}
          onOpenChange={() => setSelectedTemplate(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>填充模板变量</DialogTitle>
              <DialogDescription>
                填写模板中的变量值以生成最终内容
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {templates
                .find((t) => t.id === selectedTemplate)
                ?.variables.map((variable) => (
                  <div key={variable} className="space-y-2">
                    <Label htmlFor={variable}>{variable}</Label>
                    <Input
                      id={variable}
                      value={variableValues[variable] || ''}
                      onChange={(e) =>
                        setVariableValues({
                          ...variableValues,
                          [variable]: e.target.value,
                        })
                      }
                      placeholder={`输入 ${variable}`}
                    />
                  </div>
                ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedTemplate(null)}
              >
                取消
              </Button>
              <Button onClick={handleSubmitVariables}>应用</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// 模板卡片组件
function TemplateCard({
  template,
  onApply,
  onDelete,
}: {
  template: any;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 mb-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{template.name}</h3>
            <Badge variant="secondary" className="text-xs">
              {template.category}
            </Badge>
            {template.isBuiltIn && (
              <Badge variant="outline" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                内置
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {template.description}
          </p>
          {template.style && (
            <Badge variant="outline" className="text-xs">
              {template.style}
            </Badge>
          )}
        </div>

        <div className="flex gap-1 ml-4">
          <Button variant="ghost" size="sm" onClick={() => onApply(template.id)}>
            <Copy className="h-3 w-3" />
          </Button>
          {!template.isBuiltIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(template.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          查看模板内容
        </summary>
        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
          {template.template}
        </pre>
      </details>

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span>使用次数: {template.usageCount}</span>
        {template.variables.length > 0 && (
          <span>变量数: {template.variables.length}</span>
        )}
      </div>
    </div>
  );
}
