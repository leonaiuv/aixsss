// ==========================================
// 数据导入导出组件（优化版）
// ==========================================
// 功能：
// 1. 导出为多种格式（JSON、Markdown）
// 2. 完整导出项目、分镜、角色数据
// 3. 导入项目数据与校验
// 4. 导出预览与进度追踪
// ==========================================

import { useState, useMemo, useCallback } from 'react';
import { Project, Scene, Character, ART_STYLE_PRESETS } from '@/types';
import { useCustomStyleStore } from '@/stores/customStyleStore';
import { getScenes } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  Upload,
  FileJson,
  FileText,
  AlertCircle,
  Users,
  Film,
  FolderOpen,
  Eye,
  Info,
} from 'lucide-react';

// 获取角色数据的函数
function getCharacters(projectId: string): Character[] {
  try {
    const stored = localStorage.getItem(`aixs_characters_${projectId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// 导出选项接口
interface ExportOptions {
  includeMetadata: boolean;
  includeScenes: boolean;
  includeCharacters: boolean;
  includeDialogues: boolean;
}

// 导出数据接口
interface ExportData {
  version: string;
  exportDate: string;
  exportTool: string;
  projects: Project[];
  scenes?: Record<string, Scene[]>;
  characters?: Record<string, Character[]>;
  metadata?: {
    totalProjects: number;
    totalScenes: number;
    totalCharacters: number;
    completedScenes: number;
    exportOptions: ExportOptions;
  };
}

interface DataExporterProps {
  projects: Project[];
  onImport?: (data: ExportData) => Promise<void>;
}

export function DataExporter({ projects, onImport }: DataExporterProps) {
  const { toast } = useToast();

  // 状态管理
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown'>('json');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeMetadata: true,
    includeScenes: true,
    includeCharacters: true,
    includeDialogues: true,
  });

  // 获取项目的分镜数据（直接从storage读取，确保数据完整）
  const getProjectScenes = useCallback((projectId: string): Scene[] => {
    return getScenes(projectId);
  }, []);

  // 获取项目的角色数据
  const getProjectCharacters = useCallback((projectId: string): Character[] => {
    return getCharacters(projectId);
  }, []);

  // 计算选中项目的统计数据
  const selectedStats = useMemo(() => {
    const selectedProjectData = projects.filter((p) => selectedProjects.has(p.id));
    let totalScenes = 0;
    let totalCharacters = 0;
    let completedScenes = 0;

    selectedProjectData.forEach((project) => {
      const scenes = getProjectScenes(project.id);
      const characters = getProjectCharacters(project.id);
      totalScenes += scenes.length;
      totalCharacters += characters.length;
      completedScenes += scenes.filter((s) => s.status === 'completed').length;
    });

    return {
      projectCount: selectedProjectData.length,
      totalScenes,
      totalCharacters,
      completedScenes,
    };
  }, [selectedProjects, projects, getProjectScenes, getProjectCharacters]);

  const toggleProject = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const toggleAll = () => {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    }
  };

  // 获取画风标签
  const getStyleLabel = (project: Project): string => {
    if (project.artStyleConfig?.presetId) {
      const presetId = project.artStyleConfig.presetId;
      // 检查是否为自定义画风
      if (presetId.startsWith('custom_')) {
        const customStyle = useCustomStyleStore.getState().getCustomStyleById(presetId);
        if (customStyle) return customStyle.name;
      }
      const preset = ART_STYLE_PRESETS.find((p) => p.id === presetId);
      if (preset) return preset.label;
    }
    return project.style || '未设置';
  };

  // 构建导出数据
  const buildExportData = useCallback((): ExportData => {
    const selectedProjectData = projects.filter((p) => selectedProjects.has(p.id));
    const scenes: Record<string, Scene[]> = {};
    const characters: Record<string, Character[]> = {};
    let totalScenes = 0;
    let totalCharacters = 0;
    let completedScenes = 0;

    // 收集每个项目的分镜和角色数据
    selectedProjectData.forEach((project) => {
      if (exportOptions.includeScenes) {
        const projectScenes = getProjectScenes(project.id);
        scenes[project.id] = exportOptions.includeDialogues
          ? projectScenes
          : projectScenes.map((s) => ({ ...s, dialogues: undefined }));
        totalScenes += projectScenes.length;
        completedScenes += projectScenes.filter((s) => s.status === 'completed').length;
      }

      if (exportOptions.includeCharacters) {
        const projectCharacters = getProjectCharacters(project.id);
        characters[project.id] = projectCharacters;
        totalCharacters += projectCharacters.length;
      }
    });

    const exportData: ExportData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      exportTool: '漫剧创作助手',
      projects: selectedProjectData,
    };

    if (exportOptions.includeScenes) {
      exportData.scenes = scenes;
    }

    if (exportOptions.includeCharacters) {
      exportData.characters = characters;
    }

    if (exportOptions.includeMetadata) {
      exportData.metadata = {
        totalProjects: selectedProjectData.length,
        totalScenes,
        totalCharacters,
        completedScenes,
        exportOptions,
      };
    }

    return exportData;
  }, [projects, selectedProjects, exportOptions, getProjectScenes, getProjectCharacters]);

  const handleExport = async () => {
    if (selectedProjects.size === 0) {
      toast({
        title: '请选择项目',
        description: '至少选择一个项目进行导出',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      // 步骤1: 准备数据 (30%)
      setExportProgress(10);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const exportData = buildExportData();
      setExportProgress(30);

      // 步骤2: 生成内容 (60%)
      let content: string;
      let filename: string;
      let mimeType: string;

      if (exportFormat === 'json') {
        content = JSON.stringify(exportData, null, 2);
        filename = `manga-creator-export-${Date.now()}.json`;
        mimeType = 'application/json';
      } else {
        content = generateMarkdown(exportData);
        filename = `manga-creator-export-${Date.now()}.md`;
        mimeType = 'text/markdown';
      }

      setExportProgress(60);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 步骤3: 创建文件 (90%)
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      setExportProgress(90);

      // 步骤4: 下载文件 (100%)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);

      toast({
        title: '导出成功',
        description: `已导出 ${selectedProjects.size} 个项目，包含 ${selectedStats.totalScenes} 个分镜`,
      });
    } catch (error) {
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;

      // 校验数据格式版本
      if (!data.version || !data.projects) {
        throw new Error('无效的数据格式：缺少版本号或项目数据');
      }

      // 校验每个项目的必要字段
      for (const project of data.projects) {
        if (!project.id || !project.title) {
          throw new Error(`项目数据不完整：项目 "${project.title || '未命名'}" 缺少必要字段`);
        }
      }

      // 统计导入数据
      const sceneCount = data.scenes
        ? Object.values(data.scenes).reduce((sum, arr) => sum + arr.length, 0)
        : 0;
      const characterCount = data.characters
        ? Object.values(data.characters).reduce((sum, arr) => sum + arr.length, 0)
        : 0;

      // 执行导入
      if (onImport) {
        await onImport(data);
      }

      toast({
        title: '导入成功',
        description: `成功导入 ${data.projects.length} 个项目，${sceneCount} 个分镜，${characterCount} 个角色`,
      });
    } catch (error) {
      toast({
        title: '导入失败',
        description: error instanceof Error ? error.message : '文件格式不正确',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  // 生成导出预览内容
  const getPreviewContent = useCallback((): string => {
    if (selectedProjects.size === 0) return '请先选择要导出的项目';

    const exportData = buildExportData();

    if (exportFormat === 'json') {
      return (
        JSON.stringify(exportData, null, 2).slice(0, 2000) +
        (JSON.stringify(exportData).length > 2000 ? '\n...（内容已截断）' : '')
      );
    } else {
      const md = generateMarkdown(exportData);
      return md.slice(0, 2000) + (md.length > 2000 ? '\n...（内容已截断）' : '');
    }
  }, [selectedProjects, exportFormat, buildExportData]);

  return (
    <div className="space-y-6">
      {/* 导出区域 */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">数据导出</h2>
            <p className="text-sm text-muted-foreground">导出项目数据为多种格式</p>
          </div>
        </div>

        {/* 导出选项区域 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 左侧：格式和选项 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                导出格式
              </Label>
              <Select
                value={exportFormat}
                onValueChange={(v: 'json' | 'markdown') => setExportFormat(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">
                    <div className="flex items-center gap-2">
                      <FileJson className="h-4 w-4" />
                      <span>JSON (推荐)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="markdown">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>Markdown</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {exportFormat === 'json'
                  ? 'JSON格式适合备份和数据迁移，可完整保留所有数据'
                  : 'Markdown格式适合阅读和分享，人类可读性更好'}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                导出内容选项
              </Label>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="metadata"
                    checked={exportOptions.includeMetadata}
                    onCheckedChange={(checked) =>
                      setExportOptions({
                        ...exportOptions,
                        includeMetadata: !!checked,
                      })
                    }
                  />
                  <Label htmlFor="metadata" className="text-sm cursor-pointer">
                    包含元数据
                  </Label>
                  <span className="text-xs text-muted-foreground">(统计信息)</span>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="scenes"
                    checked={exportOptions.includeScenes}
                    onCheckedChange={(checked) =>
                      setExportOptions({
                        ...exportOptions,
                        includeScenes: !!checked,
                      })
                    }
                  />
                  <Label htmlFor="scenes" className="text-sm cursor-pointer">
                    包含分镜数据
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    <Film className="h-3 w-3 mr-1" />
                    {selectedStats.totalScenes}个
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="characters"
                    checked={exportOptions.includeCharacters}
                    onCheckedChange={(checked) =>
                      setExportOptions({
                        ...exportOptions,
                        includeCharacters: !!checked,
                      })
                    }
                  />
                  <Label htmlFor="characters" className="text-sm cursor-pointer">
                    包含角色数据
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {selectedStats.totalCharacters}个
                  </Badge>
                </div>

                {exportOptions.includeScenes && (
                  <div className="flex items-center gap-2 ml-6">
                    <Checkbox
                      id="dialogues"
                      checked={exportOptions.includeDialogues}
                      onCheckedChange={(checked) =>
                        setExportOptions({
                          ...exportOptions,
                          includeDialogues: !!checked,
                        })
                      }
                    />
                    <Label
                      htmlFor="dialogues"
                      className="text-sm cursor-pointer text-muted-foreground"
                    >
                      包含台词对白
                    </Label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右侧：项目选择 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                选择项目 ({selectedProjects.size} / {projects.length})
              </Label>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selectedProjects.size === projects.length ? '取消全选' : '全选'}
              </Button>
            </div>

            <ScrollArea className="h-[200px] border rounded-lg">
              <div className="p-3 space-y-2">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无项目</p>
                ) : (
                  projects.map((project) => {
                    const sceneCount = getProjectScenes(project.id).length;
                    const charCount = getProjectCharacters(project.id).length;
                    return (
                      <div
                        key={project.id}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedProjects.has(project.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent hover:border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleProject(project.id)}
                      >
                        <Checkbox
                          checked={selectedProjects.has(project.id)}
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{project.title}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Film className="h-3 w-3" />
                              {sceneCount} 个分镜
                            </span>
                            {charCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {charCount} 个角色
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {getStyleLabel(project)}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* 导出统计摘要 */}
        {selectedProjects.size > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span>
                  <strong>{selectedStats.projectCount}</strong> 个项目
                </span>
              </div>
              {exportOptions.includeScenes && (
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-primary" />
                  <span>
                    <strong>{selectedStats.totalScenes}</strong> 个分镜
                  </span>
                  <span className="text-muted-foreground">
                    ({selectedStats.completedScenes} 已完成)
                  </span>
                </div>
              )}
              {exportOptions.includeCharacters && selectedStats.totalCharacters > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>
                    <strong>{selectedStats.totalCharacters}</strong> 个角色
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 预览按钮和区域 */}
        {selectedProjects.size > 0 && (
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="preview" className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span>导出预览</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <pre className="p-4 bg-muted/30 rounded text-xs overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
                  {getPreviewContent()}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* 导出按钮 */}
        <Button
          onClick={handleExport}
          disabled={isExporting || selectedProjects.size === 0}
          className="w-full mt-4"
          size="lg"
        >
          {isExporting ? (
            <div className="flex items-center gap-3 w-full">
              <Progress value={exportProgress} className="flex-1 h-2" />
              <span className="shrink-0">导出中... {exportProgress}%</span>
            </div>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              导出 ({selectedProjects.size})
            </>
          )}
        </Button>
      </Card>

      <Separator />

      {/* 导入区域 */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">数据导入</h2>
            <p className="text-sm text-muted-foreground">从JSON文件导入项目数据</p>
          </div>
        </div>

        <div className="p-8 border-2 border-dashed rounded-lg text-center hover:border-primary/50 transition-colors">
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">点击选择文件或拖拽文件到此处</p>
          <p className="text-xs text-muted-foreground mb-4">支持 .json 格式的导出文件</p>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className="hidden"
            id="import-file"
          />
          <label htmlFor="import-file">
            <Button asChild disabled={isImporting} variant="secondary">
              <span>
                {isImporting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    导入中...
                  </>
                ) : (
                  '选择文件'
                )}
              </span>
            </Button>
          </label>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950/50 rounded-lg border border-yellow-200 dark:border-yellow-900">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-semibold mb-2">注意事项</p>
              <ul className="space-y-1 text-xs">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  导入会覆盖同ID的项目数据
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  请确保导入文件是本应用导出的JSON格式
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  建议在导入前先备份现有数据
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// 生成Markdown格式导出内容
function generateMarkdown(data: ExportData): string {
  let markdown = '# 漫剧创作助手 - 项目导出\n\n';
  markdown += `> 导出时间: ${new Date(data.exportDate).toLocaleString('zh-CN')}\n`;
  markdown += `> 导出版本: ${data.version}\n\n`;

  if (data.metadata) {
    markdown += `## 导出概览\n\n`;
    markdown += `| 统计项 | 数量 |\n`;
    markdown += `|--------|------|\n`;
    markdown += `| 项目数 | ${data.metadata.totalProjects} |\n`;
    markdown += `| 分镜数 | ${data.metadata.totalScenes} |\n`;
    markdown += `| 角色数 | ${data.metadata.totalCharacters} |\n`;
    markdown += `| 已完成分镜 | ${data.metadata.completedScenes} |\n\n`;
    markdown += `---\n\n`;
  }

  data.projects.forEach((project, index) => {
    const projectScenes = data.scenes?.[project.id] || [];
    const projectCharacters = data.characters?.[project.id] || [];

    // 获取画风标签
    let styleLabel = project.style || '未设置';
    if (project.artStyleConfig?.presetId) {
      const preset = ART_STYLE_PRESETS.find((p) => p.id === project.artStyleConfig?.presetId);
      if (preset) styleLabel = preset.label;
    }

    markdown += `## ${index + 1}. ${project.title}\n\n`;
    markdown += `**画风:** ${styleLabel}\n\n`;

    if (project.artStyleConfig?.fullPrompt) {
      markdown += `**画风提示词:**
\`\`\`
${project.artStyleConfig.fullPrompt}
\`\`\`

`;
    }

    markdown += `**主角:** ${project.protagonist}\n\n`;
    markdown += `**剧情简介:**\n${project.summary}\n\n`;
    if (Array.isArray(project.contextCache?.emotionArc) && project.contextCache.emotionArc.length) {
      markdown += `**情绪弧线:**\n`;
      project.contextCache.emotionArc.forEach((point, idx) => {
        const beat = (point as { beat?: unknown }).beat;
        const value = (point as { value?: unknown }).value;
        const note = (point as { note?: unknown }).note;
        markdown += `- ${idx + 1}. ${typeof beat === 'string' ? beat : '未命名节点'}: ${
          typeof value === 'number' ? value : '-'
        }${typeof note === 'string' && note ? `（${note}）` : ''}\n`;
      });
      markdown += `\n`;
    }

    // 角色信息
    if (projectCharacters.length > 0) {
      markdown += `### 角色列表 (${projectCharacters.length}个)\n\n`;
      projectCharacters.forEach((char, charIndex) => {
        markdown += `#### ${charIndex + 1}. ${char.name}\n\n`;
        if (char.appearance) markdown += `- **外貌:** ${char.appearance}\n`;
        if (char.personality) markdown += `- **性格:** ${char.personality}\n`;
        if (char.background) markdown += `- **背景:** ${char.background}\n`;
        if (char.portraitPrompts?.general) {
          markdown += `- **定妆照提示词:**
\`\`\`
${char.portraitPrompts.general}
\`\`\`
`;
        }
        markdown += `\n`;
      });
    }

    // 分镜信息
    if (projectScenes.length > 0) {
      markdown += `### 分镜列表 (${projectScenes.length}个)\n\n`;

      projectScenes.forEach((scene, sceneIndex) => {
        markdown += `#### 分镜 ${sceneIndex + 1}\n\n`;
        markdown += `**概要:** ${scene.summary}\n\n`;

        if (scene.sceneDescription) {
          markdown += `**场景锚点（Scene Anchor）:**\n${scene.sceneDescription}\n\n`;
        }

        if (scene.sceneScriptJson) {
          markdown += `**分场脚本片段:**
\`\`\`json
${JSON.stringify(scene.sceneScriptJson, null, 2)}
\`\`\`

`;
        }

        if (scene.shotPrompt) {
          markdown += `**关键帧提示词（KF0-KF8）:**
\`\`\`
${scene.shotPrompt}
\`\`\`

`;
        }

        if (scene.motionPrompt) {
          markdown += `**时空/运动提示词:**
\`\`\`
${scene.motionPrompt}
\`\`\`

`;
        }

        if (scene.soundDesignJson) {
          markdown += `**声音设计:**
\`\`\`json
${JSON.stringify(scene.soundDesignJson, null, 2)}
\`\`\`

`;
        }

        if (scene.durationEstimateJson) {
          markdown += `**时长估算:**
\`\`\`json
${JSON.stringify(scene.durationEstimateJson, null, 2)}
\`\`\`

`;
        }

        if (scene.dialogues && scene.dialogues.length > 0) {
          markdown += `**台词:**\n`;
          scene.dialogues.forEach((d) => {
            const speaker = d.characterName || (d.type === 'narration' ? '旁白' : '未知');
            markdown += `- **${speaker}:** ${d.content}\n`;
          });
          markdown += `\n`;
        }

        if (scene.notes) {
          markdown += `**备注:** ${scene.notes}\n\n`;
        }

        markdown += `---\n\n`;
      });
    }

    markdown += `\n`;
  });

  return markdown;
}
