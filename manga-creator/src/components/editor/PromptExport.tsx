import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Download, 
  Copy, 
  FileText, 
  CheckCircle2,
  Eye,
  Code
} from 'lucide-react';

export function PromptExport() {
  const { currentProject } = useProjectStore();
  const { scenes, loadScenes } = useStoryboardStore();
  
  const [exportContent, setExportContent] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (currentProject) {
      loadScenes(currentProject.id);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    if (currentProject && scenes.length > 0) {
      setExportContent(generateMarkdown());
    }
  }, [currentProject, scenes]);

  if (!currentProject) {
    return null;
  }

  const completedScenes = scenes.filter(s => s.status === 'completed');
  const completionRate = Math.round((completedScenes.length / scenes.length) * 100);

  // 生成Markdown格式内容
  const generateMarkdown = () => {
    let md = `# ${currentProject.title}\n\n`;
    md += `## 项目信息\n\n`;
    md += `- **创建时间**: ${new Date(currentProject.createdAt).toLocaleString('zh-CN')}\n`;
    md += `- **更新时间**: ${new Date(currentProject.updatedAt).toLocaleString('zh-CN')}\n`;
    md += `- **画风**: ${currentProject.style}\n`;
    md += `- **分镜总数**: ${scenes.length}\n`;
    md += `- **完成进度**: ${completionRate}%\n\n`;

    md += `## 基础设定\n\n`;
    md += `### 剧本梗概\n\n`;
    md += `${currentProject.summary}\n\n`;
    md += `### 主角设定\n\n`;
    md += `${currentProject.protagonist}\n\n`;

    md += `---\n\n`;
    md += `## 分镜列表\n\n`;

    scenes.forEach((scene, index) => {
      md += `### 分镜 ${index + 1}: ${scene.summary}\n\n`;
      
      if (scene.sceneDescription) {
        md += `**场景描述**:\n\n`;
        md += `${scene.sceneDescription}\n\n`;
      }

      if (scene.actionDescription) {
        md += `**动作描述**:\n\n`;
        md += `${scene.actionDescription}\n\n`;
      }

      if (scene.shotPrompt) {
        md += `**AI绘画提示词**:\n\n`;
        md += `\`\`\`\n${scene.shotPrompt}\n\`\`\`\n\n`;
      }

      if (scene.notes) {
        md += `**备注**: ${scene.notes}\n\n`;
      }

      md += `---\n\n`;
    });

    return md;
  };

  // 生成JSON格式
  const generateJSON = () => {
    const data = {
      project: {
        id: currentProject.id,
        title: currentProject.title,
        summary: currentProject.summary,
        style: currentProject.style,
        protagonist: currentProject.protagonist,
        createdAt: currentProject.createdAt,
        updatedAt: currentProject.updatedAt,
      },
      scenes: scenes.map(scene => ({
        order: scene.order,
        summary: scene.summary,
        sceneDescription: scene.sceneDescription,
        actionDescription: scene.actionDescription,
        shotPrompt: scene.shotPrompt,
        notes: scene.notes,
        status: scene.status,
      })),
      statistics: {
        totalScenes: scenes.length,
        completedScenes: completedScenes.length,
        completionRate: completionRate,
      },
    };

    return JSON.stringify(data, null, 2);
  };

  // 仅导出提示词
  const generatePromptsOnly = () => {
    let content = `# ${currentProject.title} - AI绘画提示词\n\n`;
    content += `画风: ${currentProject.style}\n`;
    content += `主角: ${currentProject.protagonist}\n\n`;
    content += `---\n\n`;

    scenes.forEach((scene, index) => {
      if (scene.shotPrompt) {
        content += `## 分镜 ${index + 1}\n\n`;
        content += `${scene.shotPrompt}\n\n`;
        content += `---\n\n`;
      }
    });

    return content;
  };

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 下载文件
  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">提示词导出</h2>
            <p className="text-sm text-muted-foreground">
              查看完整的分镜内容,导出为Markdown或JSON格式
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>{completionRate}% 完成</span>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold text-primary">{scenes.length}</p>
            <p className="text-sm text-muted-foreground mt-1">分镜总数</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold text-green-600">{completedScenes.length}</p>
            <p className="text-sm text-muted-foreground mt-1">已完成</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold text-orange-600">{scenes.length - completedScenes.length}</p>
            <p className="text-sm text-muted-foreground mt-1">未完成</p>
          </div>
        </div>

        {/* 预览区域 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>内容预览</span>
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportContent(generateMarkdown())}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                <span>Markdown</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportContent(generateJSON())}
                className="gap-2"
              >
                <Code className="h-4 w-4" />
                <span>JSON</span>
              </Button>
            </div>
          </div>
          <Textarea
            value={exportContent}
            readOnly
            className="min-h-[400px] resize-none font-mono text-xs"
          />
        </div>

        {/* 导出按钮 */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleCopy} className="gap-2">
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>复制到剪贴板</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => handleDownload(generateMarkdown(), `${currentProject.title}.md`)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span>下载Markdown</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => handleDownload(generateJSON(), `${currentProject.title}.json`)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span>下载JSON</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => handleDownload(generatePromptsOnly(), `${currentProject.title}_prompts.txt`)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span>仅导出提示词</span>
          </Button>
        </div>

        {/* 未完成提示 */}
        {completedScenes.length < scenes.length && (
          <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              💡 还有 {scenes.length - completedScenes.length} 个分镜未完成细化,
              建议完成所有分镜后再导出最终版本
            </p>
          </div>
        )}
      </Card>

      {/* 格式说明 */}
      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span>导出格式说明</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong>Markdown</strong>: 适合人类阅读,包含完整的项目信息和分镜细节</li>
          <li>• <strong>JSON</strong>: 适合程序处理,可导入其他工具或备份数据</li>
          <li>• <strong>仅提示词</strong>: 纯文本格式,直接用于AI绘画工具(MidJourney/Stable Diffusion等)</li>
          <li>• <strong>剪贴板复制</strong>: 快速分享或粘贴到其他应用</li>
        </ul>
      </Card>

      {/* 快速分镜预览 */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">快速预览</h3>
        <div className="grid grid-cols-2 gap-4">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              className={`p-4 rounded-lg border ${
                scene.status === 'completed' 
                  ? 'border-green-500/30 bg-green-500/5' 
                  : 'border-border bg-muted/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">{scene.summary}</p>
                  <div className="flex gap-2 text-xs">
                    <span className={scene.sceneDescription ? 'text-green-600' : 'text-muted-foreground'}>
                      场景{scene.sceneDescription ? '✓' : '○'}
                    </span>
                    <span className={scene.actionDescription ? 'text-green-600' : 'text-muted-foreground'}>
                      动作{scene.actionDescription ? '✓' : '○'}
                    </span>
                    <span className={scene.shotPrompt ? 'text-green-600' : 'text-muted-foreground'}>
                      提示词{scene.shotPrompt ? '✓' : '○'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
