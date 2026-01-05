import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Plus, Trash2, Users } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/stores/projectStore';
import { useCharacterStore } from '@/stores/characterStore';

type CharactersNodeData = { label?: string };

export type CharactersFlowNode = Node<CharactersNodeData, 'characters'>;

export function CharactersNode({ data }: NodeProps<CharactersFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);

  const characters = useCharacterStore((s) => s.characters);
  const isLoading = useCharacterStore((s) => s.isLoading);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);
  const addCharacter = useCharacterStore((s) => s.addCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);

  useEffect(() => {
    if (!projectId) return;
    loadCharacters(projectId);
  }, [projectId, loadCharacters]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');

  const canCreate = Boolean(projectId && name.trim());

  const resetForm = () => {
    setName('');
    setBrief('');
  };

  const create = () => {
    if (!projectId) return;
    if (!name.trim()) return;
    addCharacter(projectId, {
      projectId,
      name: name.trim(),
      briefDescription: brief.trim() || undefined,
      avatar: undefined,
      appearance: '',
      personality: '',
      background: '',
      portraitPrompts: undefined,
      customStyle: undefined,
      relationships: [],
      appearances: [],
      themeColor: undefined,
      primaryColor: undefined,
      secondaryColor: undefined,
    });
    setDialogOpen(false);
    resetForm();
  };

  const topCharacters = useMemo(() => characters.slice(0, 20), [characters]);

  return (
    <>
      <NodeFrame
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {data.label ?? '角色'}
          </span>
        }
        description="角色库：用于稳定出场人物的一致性与关系网。"
        headerRight={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDialogOpen(true)}
            disabled={!projectId}
          >
            <Plus className="mr-1 h-4 w-4" />
            新增
          </Button>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>共 {characters.length} 个</span>
            {isLoading ? <span>加载中...</span> : null}
          </div>

          <ScrollArea className="h-[180px] rounded-md border bg-background/60">
            <div className="p-2">
              {characters.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">
                  暂无角色。建议先创建主角 + 2-3 个关键配角。
                </div>
              ) : (
                <div className="space-y-2">
                  {topCharacters.map((c) => (
                    <div key={c.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{c.name}</div>
                          {c.briefDescription ? (
                            <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {c.briefDescription}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              （无简述）
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => projectId && deleteCharacter(projectId, c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {characters.length > 20 ? (
                    <div className="px-2 pb-1 text-[11px] text-muted-foreground">
                      仅展示前 20 个（请在后续版本加入筛选/搜索）。
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </NodeFrame>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新增角色</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">姓名</div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：林月"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">简述（可选）</div>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="一句话：身份/欲望/矛盾点"
                className="min-h-[110px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={create} disabled={!canCreate}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
