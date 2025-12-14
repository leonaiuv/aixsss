import { useMemo, useState } from 'react';
import { isApiMode } from '@/lib/runtime/mode';
import { getProjects, getScenes } from '@/lib/storage';
import { apiCreateProject, apiUpdateProject } from '@/lib/api/projects';
import { apiCreateScene } from '@/lib/api/scenes';
import { apiCreateCharacter } from '@/lib/api/characters';
import { apiCreateWorldViewElement } from '@/lib/api/worldView';
import type { Project } from '@/types';
import { ApiError } from '@/lib/api/http';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CloudUpload, X } from 'lucide-react';

const MIGRATION_STATUS_KEY = 'aixs_local_data_migration_status_v1';

function safeGetMigrationStatus(): string | null {
  try {
    return localStorage.getItem(MIGRATION_STATUS_KEY);
  } catch {
    return null;
  }
}

function safeSetMigrationStatus(status: 'dismissed' | 'done'): void {
  try {
    localStorage.setItem(MIGRATION_STATUS_KEY, status);
  } catch {
    // ignore
  }
}

function getLocalCharacters(projectId: string) {
  try {
    const raw = localStorage.getItem(`aixs_characters_${projectId}`);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  } catch {
    return [];
  }
}

function getLocalWorldViewElements(projectId: string) {
  try {
    const raw = localStorage.getItem(`aixs_worldview_${projectId}`);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  } catch {
    return [];
  }
}

export function LocalDataMigrationBanner(props: { serverProjects: Project[]; isServerLoading?: boolean; onImported?: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string | null>(() => safeGetMigrationStatus());
  const [isImporting, setIsImporting] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');

  const localProjects = useMemo(() => {
    try {
      return getProjects();
    } catch {
      return [];
    }
  }, []);

  const serverIdSet = useMemo(() => new Set((props.serverProjects || []).map((p) => p.id)), [props.serverProjects]);
  const importCandidates = useMemo(
    () => localProjects.filter((p) => p?.id && !serverIdSet.has(p.id)),
    [localProjects, serverIdSet],
  );

  const totalLocalScenes = useMemo(() => {
    try {
      return localProjects.reduce((sum, p) => sum + getScenes(p.id).length, 0);
    } catch {
      return 0;
    }
  }, [localProjects]);

  const totalLocalCharacters = useMemo(() => {
    try {
      return localProjects.reduce((sum, p) => sum + getLocalCharacters(p.id).length, 0);
    } catch {
      return 0;
    }
  }, [localProjects]);

  const totalLocalWorldView = useMemo(() => {
    try {
      return localProjects.reduce((sum, p) => sum + getLocalWorldViewElements(p.id).length, 0);
    } catch {
      return 0;
    }
  }, [localProjects]);

  if (!isApiMode()) return null;
  if (props.isServerLoading) return null;
  if (status === 'dismissed' || status === 'done') return null;
  if (localProjects.length === 0) return null;
  if (importCandidates.length === 0) return null;

  const dismiss = () => {
    safeSetMigrationStatus('dismissed');
    setStatus('dismissed');
  };

  const handleImport = async () => {
    setIsImporting(true);
    setErrorText('');
    setProgressText('准备导入...');

    let importedProjects = 0;
    let importedScenes = 0;
    let importedCharacters = 0;
    let importedWorldView = 0;

    try {
      for (let i = 0; i < importCandidates.length; i++) {
        const p = importCandidates[i];
        setProgressText(`导入项目 ${i + 1}/${importCandidates.length}：${p.title || p.id}`);

        try {
          await apiCreateProject({
            id: p.id,
            title: p.title,
            summary: p.summary,
            protagonist: p.protagonist,
            style: p.style,
            artStyleConfig: p.artStyleConfig,
          });
          importedProjects += 1;
        } catch (e) {
          // 若已存在/冲突，继续；其他错误也先记录但不中断整体导入
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
        }

        // 尽量恢复工作流进度（不影响核心数据导入）
        try {
          await apiUpdateProject(p.id, {
            workflowState: p.workflowState,
            currentSceneOrder: p.currentSceneOrder,
            currentSceneStep: p.currentSceneStep ?? undefined,
          });
        } catch {
          // ignore
        }

        const scenes = getScenes(p.id);
        for (let j = 0; j < scenes.length; j++) {
          const s = scenes[j];
          setProgressText(`导入分镜：${p.title || p.id}（${j + 1}/${scenes.length}）`);
          try {
            await apiCreateScene(p.id, {
              id: s.id,
              order: s.order,
              summary: s.summary,
              sceneDescription: s.sceneDescription,
              actionDescription: s.actionDescription,
              shotPrompt: s.shotPrompt,
              motionPrompt: s.motionPrompt,
              dialogues: s.dialogues,
              contextSummary: s.contextSummary,
              status: s.status,
              notes: s.notes,
            });
            importedScenes += 1;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
            // ignore per-scene failure
          }
        }

        const localCharacters = getLocalCharacters(p.id);
        for (let j = 0; j < localCharacters.length; j++) {
          const c = localCharacters[j] as any;
          setProgressText(`导入角色：${p.title || p.id}（${j + 1}/${localCharacters.length}）`);
          try {
            await apiCreateCharacter(p.id, {
              id: typeof c.id === 'string' ? c.id : undefined,
              name: typeof c.name === 'string' ? c.name : '未命名角色',
              briefDescription: typeof c.briefDescription === 'string' ? c.briefDescription : undefined,
              avatar: typeof c.avatar === 'string' ? c.avatar : undefined,
              appearance: typeof c.appearance === 'string' ? c.appearance : '',
              personality: typeof c.personality === 'string' ? c.personality : '',
              background: typeof c.background === 'string' ? c.background : '',
              portraitPrompts: c.portraitPrompts ?? undefined,
              customStyle: typeof c.customStyle === 'string' ? c.customStyle : undefined,
              relationships: c.relationships ?? undefined,
              appearances: c.appearances ?? undefined,
              themeColor: typeof c.themeColor === 'string' ? c.themeColor : undefined,
              primaryColor: typeof c.primaryColor === 'string' ? c.primaryColor : undefined,
              secondaryColor: typeof c.secondaryColor === 'string' ? c.secondaryColor : undefined,
            } as any);
            importedCharacters += 1;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
          }
        }

        const localWorldView = getLocalWorldViewElements(p.id);
        for (let j = 0; j < localWorldView.length; j++) {
          const w = localWorldView[j] as any;
          setProgressText(`导入世界观：${p.title || p.id}（${j + 1}/${localWorldView.length}）`);
          try {
            await apiCreateWorldViewElement(p.id, {
              id: typeof w.id === 'string' ? w.id : undefined,
              type: w.type,
              title: typeof w.title === 'string' ? w.title : '未命名要素',
              content: typeof w.content === 'string' ? w.content : '',
              order: typeof w.order === 'number' ? w.order : j + 1,
            } as any);
            importedWorldView += 1;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
          }
        }
      }

      safeSetMigrationStatus('done');
      setStatus('done');
      setProgressText('');

      toast({
        title: '导入完成',
        description: `已导入 ${importedProjects}/${importCandidates.length} 个项目、${importedScenes}/${totalLocalScenes} 个分镜、${importedCharacters}/${totalLocalCharacters} 个角色、${importedWorldView}/${totalLocalWorldView} 个世界观要素到云端。`,
      });

      props.onImported?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorText(message || '导入失败');
      toast({
        title: '导入失败',
        description: message || '导入失败',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CloudUpload className="h-4 w-4" />
          检测到本地项目数据
        </CardTitle>
        <CardDescription>
          发现 {importCandidates.length} 个本地项目（共 {totalLocalScenes} 个分镜、{totalLocalCharacters} 个角色、{totalLocalWorldView} 个世界观要素）尚未导入到云端。导入后可跨设备同步。
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {progressText ? <div className="text-sm text-muted-foreground">{progressText}</div> : null}
        {errorText ? <div className="text-sm text-destructive mt-2">{errorText}</div> : null}
      </CardContent>
      <CardFooter className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={dismiss} disabled={isImporting}>
          <X className="h-4 w-4 mr-2" />
          以后再说
        </Button>
        <Button onClick={() => void handleImport()} disabled={isImporting}>
          {isImporting ? '导入中...' : '导入到云端'}
        </Button>
      </CardFooter>
    </Card>
  );
}


