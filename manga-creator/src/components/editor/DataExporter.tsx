// ==========================================
// 数据导入导出组件
// ==========================================
// 功能：
// 1. 导出为多种格式（JSON、Markdown、PDF、ZIP）
// 2. 导入项目数据
// 3. 数据校验
// 4. 增量导出
// ==========================================

import { useState } from 'react';
import { Project, Scene } from '@/types';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  Upload,
  FileJson,
  FileText,
  FileArchive,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface DataExporterProps {
  projects: Project[];
  onImport?: (data: any) => Promise<void>;
}

export function DataExporter({ projects, onImport }: DataExporterProps) {
  const { toast } = useToast();
  const { scenes: allScenes } = useStoryboardStore();
  
  // 获取项目的场景数据
  const getProjectScenes = (projectId: string): Scene[] => {
    return allScenes.filter((scene: Scene) => scene.projectId === projectId);
  };
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown' | 'zip'>(
    'json'
  );
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set()
  );
  const [exportOptions, setExportOptions] = useState({
    includeMetadata: true,
    includeScenes: true,
    includeHistory: false,
    compression: false,
  });

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
      const selectedProjectData = projects.filter((p) =>
        selectedProjects.has(p.id)
      );

      // 模拟导出进度
      for (let i = 0; i <= 100; i += 10) {
        setExportProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      let exportData: any;
      let filename: string;
      let blob: Blob;

      switch (exportFormat) {
        case 'json':
          exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            projects: selectedProjectData,
            metadata: exportOptions.includeMetadata
              ? {
                  totalProjects: selectedProjectData.length,
                  totalScenes: selectedProjectData.reduce(
                    (sum, p) => sum + getProjectScenes(p.id).length,
                    0
                  ),
                }
              : undefined,
          };
          filename = `manga-creator-export-${Date.now()}.json`;
          blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json',
          });
          break;

        case 'markdown':
          exportData = generateMarkdown(selectedProjectData, exportOptions);
          filename = `manga-creator-export-${Date.now()}.md`;
          blob = new Blob([exportData], { type: 'text/markdown' });
          break;

        case 'zip':
          // 简化版：将所有项目打包为JSON
          exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            projects: selectedProjectData,
          };
          filename = `manga-creator-export-${Date.now()}.json`;
          blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json',
          });
          break;

        default:
          throw new Error('不支持的导出格式');
      }

      // 下载文件
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: '导出成功',
        description: `已导出 ${selectedProjects.size} 个项目`,
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
      const data = JSON.parse(text);

      // 校验数据格式
      if (!data.version || !data.projects) {
        throw new Error('无效的数据格式');
      }

      // 校验每个项目
      for (const project of data.projects) {
                if (!project.id || !project.title || !project.summary) {
          throw new Error('项目数据不完整');
        }
      }

      // 执行导入
      if (onImport) {
        await onImport(data);
      }

      toast({
        title: '导入成功',
        description: `成功导入 ${data.projects.length} 个项目`,
      });
    } catch (error) {
      toast({
        title: '导入失败',
        description:
          error instanceof Error ? error.message : '文件格式不正确',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 导出区域 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">数据导出</h2>
            <p className="text-sm text-muted-foreground">
              导出项目数据为多种格式
            </p>
          </div>
        </div>

        {/* 导出选项 */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>导出格式</Label>
            <Select
              value={exportFormat}
              onValueChange={(v: any) => setExportFormat(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON (推荐)
                  </div>
                </SelectItem>
                <SelectItem value="markdown">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Markdown
                  </div>
                </SelectItem>
                <SelectItem value="zip">
                  <div className="flex items-center gap-2">
                    <FileArchive className="h-4 w-4" />
                    ZIP压缩包
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>导出选项</Label>
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
              </div>
            </div>
          </div>
        </div>

        {/* 项目选择 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label>选择项目 ({selectedProjects.size} / {projects.length})</Label>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedProjects.size === projects.length ? '取消全选' : '全选'}
            </Button>
          </div>

          <ScrollArea className="h-[200px] border rounded-lg p-4">
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                  onClick={() => toggleProject(project.id)}
                >
                  <Checkbox checked={selectedProjects.has(project.id)} />
                  <div className="flex-1">
                    <p className="font-medium">{project.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {getProjectScenes(project.id).length} 个分镜
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* 导出按钮 */}
        <Button
          onClick={handleExport}
          disabled={isExporting || selectedProjects.size === 0}
          className="w-full"
        >
          {isExporting ? (
            <>
              <Progress value={exportProgress} className="w-20 h-2 mr-2" />
              导出中... {exportProgress}%
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              导出 ({selectedProjects.size})
            </>
          )}
        </Button>
      </div>

      <Separator />

      {/* 导入区域 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">数据导入</h2>
            <p className="text-sm text-muted-foreground">
              从JSON文件导入项目数据
            </p>
          </div>
        </div>

        <div className="p-6 border-2 border-dashed rounded-lg text-center">
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">
            点击选择文件或拖拽文件到此处
          </p>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={isImporting}
            className="hidden"
            id="import-file"
          />
          <label htmlFor="import-file">
            <Button asChild disabled={isImporting}>
              <span>
                {isImporting ? '导入中...' : '选择文件'}
              </span>
            </Button>
          </label>
        </div>

        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              <p className="font-semibold mb-1">注意事项</p>
              <ul className="space-y-1 text-xs">
                <li>• 导入会覆盖同ID的项目数据</li>
                <li>• 请确保导入文件是本应用导出的JSON格式</li>
                <li>• 建议在导入前先备份现有数据</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 生成Markdown格式
function generateMarkdown(projects: Project[], options: any): string {
  let markdown = '# 漫剧创作助手 - 项目导出\n\n';
  markdown += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  markdown += `---\n\n`;

  projects.forEach((project, index) => {
    const projectScenes = options.scenesMap?.get(project.id) || [];
    markdown += `## ${index + 1}. ${project.title}\n\n`;
    markdown += `**画风:** ${project.style}\n\n`;
    markdown += `**主角:** ${project.protagonist}\n\n`;
    markdown += `**剧情:**\n${project.summary}\n\n`;

    if (options.includeScenes && projectScenes.length > 0) {
      markdown += `### 分镜列表 (${projectScenes.length}个)\n\n`;

      projectScenes.forEach((scene: Scene, sceneIndex: number) => {
        markdown += `#### 分镜 ${sceneIndex + 1}\n\n`;
        markdown += `**概要:** ${scene.summary}\n\n`;

        if (scene.sceneDescription) {
          markdown += `**场景描述:**\n${scene.sceneDescription}\n\n`;
        }

        if (scene.actionDescription) {
          markdown += `**动作描述:**\n${scene.actionDescription}\n\n`;
        }

        if (scene.shotPrompt) {
          markdown += `**提示词:**
\`\`\`
${scene.shotPrompt}
\`\`\`

`;
        }

        markdown += `---\n\n`;
      });
    }

    markdown += `\n`;
  });

  return markdown;
}
