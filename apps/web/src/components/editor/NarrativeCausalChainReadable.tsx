import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { JsonViewer } from '@/components/ui/json-viewer';
import { 
  AlertCircle, 
  ArrowRight, 
  BookOpen, 
  CheckCircle2, 
  Drama, 
  Eye, 
  EyeOff, 
  GitBranch, 
  GitCommit, 
  Layers, 
  LayoutGrid, 
  Lightbulb, 
  MessageSquare, 
  Network, 
  PlayCircle, 
  ShieldAlert, 
  Target, 
  User, 
  Users, 
  Zap 
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Type Guards & Helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function nonEmptyText(value: unknown): string | null {
  const s = toText(value).trim();
  return s ? s : null;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((v) => (typeof v === 'string' ? v : toText(v))).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[，,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function omitKnown(obj: Record<string, unknown>, known: string[]): Record<string, unknown> {
  const set = new Set(known);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!set.has(k)) out[k] = v;
  }
  return out;
}

// --- UI Components ---

function SectionHeader({ icon: Icon, title, description }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {Icon && <div className="p-2 bg-primary/10 rounded-lg text-primary"><Icon className="w-5 h-5" /></div>}
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function Kv({ label, value, icon: Icon, className }: { label: string; value: unknown; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  const text = nonEmptyText(value);
  if (!text) return null;
  return (
    <div className={cn("group flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90 bg-muted/30 p-2 rounded-md border border-transparent group-hover:border-border/50 transition-colors">
        {text}
      </div>
    </div>
  );
}

function TagList({ items, variant = "secondary" }: { items: string[], variant?: "default" | "secondary" | "outline" | "destructive" }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, idx) => (
        <Badge key={`${idx}-${it.slice(0, 10)}`} variant={variant} className="px-2 py-0.5 text-xs font-normal">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function Extras({ title, obj, known }: { title: string; obj: unknown; known: string[] }) {
  if (!isRecord(obj)) return null;
  const extras = omitKnown(obj, known);
  if (!Object.keys(extras).length) return null;
  return (
    <Accordion type="single" collapsible className="w-full border rounded-lg bg-muted/20">
      <AccordionItem value="extras" className="border-0">
        <AccordionTrigger className="px-3 py-2 text-xs text-muted-foreground hover:no-underline">
          <span>{title}</span>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          <JsonViewer value={extras} defaultExpandDepth={1} className="text-xs" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// --- Phase Views ---

function Phase1View({ chain }: { chain: Record<string, unknown> }) {
  const outlineSummary = typeof chain.outlineSummary === 'string' ? chain.outlineSummary : null;
  const conflictEngine = isRecord(chain.conflictEngine) ? chain.conflictEngine : null;
  const firstMover = conflictEngine && isRecord(conflictEngine.firstMover) ? conflictEngine.firstMover : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 核心概要 */}
      <Card className="border-l-4 border-l-primary shadow-sm">
        <CardHeader className="pb-3">
          <SectionHeader icon={BookOpen} title="故事核心" description="基于原著与当前设定的核心冲突摘要" />
        </CardHeader>
        <CardContent>
          <div className="text-base leading-7 text-foreground/90 font-serif">
             {toText(outlineSummary) || "暂无摘要"}
          </div>
        </CardContent>
      </Card>

      {conflictEngine && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* 左侧：冲突核心 */}
           <div className="space-y-6">
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                 <SectionHeader icon={Target} title="核心冲突物件/事件" />
                 <p className="text-lg font-medium text-primary">{toText(conflictEngine.coreObjectOrEvent)}</p>
              </div>
              
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                 <SectionHeader icon={Users} title="各方利害 (Stakes)" />
                 {isRecord(conflictEngine.stakesByFaction) ? (
                    <div className="space-y-4">
                      {Object.entries(conflictEngine.stakesByFaction).map(([k, v]) => (
                        <div key={k} className="relative pl-4 border-l-2 border-primary/20 hover:border-primary/50 transition-colors">
                          <div className="text-sm font-semibold text-foreground mb-1">{k}</div>
                          <div className="text-sm text-muted-foreground">{toText(v)}</div>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-sm text-muted-foreground">暂无利害分析</span>}
              </div>
           </div>

           {/* 右侧：第一推动因 */}
           <div className="space-y-6">
              {firstMover ? (
                <Card className="h-full border-primary/10 shadow-sm">
                  <CardHeader>
                    <SectionHeader icon={Zap} title="第一推动因 (First Mover)" description="引发一切连锁反应的源头" />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Kv label="发起者" value={firstMover.initiator} icon={User} />
                    <Kv label="公开理由" value={firstMover.publicReason} icon={MessageSquare} />
                    <Kv label="真实意图" value={firstMover.hiddenIntent} icon={EyeOff} className="p-2 bg-yellow-500/5 border-yellow-500/20 rounded-lg" />
                    <Kv label="合法性包装" value={firstMover.legitimacyMask} icon={ShieldAlert} />
                    <Extras
                      title="扩展字段"
                      obj={firstMover}
                      known={['initiator', 'publicReason', 'hiddenIntent', 'legitimacyMask']}
                    />
                  </CardContent>
                </Card>
              ) : null}

              {/* 必要性推导 */}
              <Card>
                <CardHeader>
                  <SectionHeader icon={GitBranch} title="必要性推导" />
                </CardHeader>
                <CardContent>
                   <ul className="space-y-2">
                     {Array.isArray(conflictEngine.necessityDerivation) ? (
                        conflictEngine.necessityDerivation.map((x: unknown, i: number) => (
                          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                            <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 text-primary/40" />
                            <span>{toText(x)}</span>
                          </li>
                        ))
                     ) : null}
                   </ul>
                </CardContent>
              </Card>
           </div>
        </div>
      )}
    </div>
  );
}

function Phase2View({ chain }: { chain: Record<string, unknown> }) {
  const infoLayers = Array.isArray(chain.infoVisibilityLayers) ? chain.infoVisibilityLayers : [];
  const characterMatrix = Array.isArray(chain.characterMatrix) ? chain.characterMatrix : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 信息分层 */}
      <section>
        <SectionHeader icon={Layers} title="信息能见度层 (Information Layers)" description="从上帝视角到局外人的信息差设计" />
        <div className="grid gap-4 mt-4">
          {infoLayers.map((layer: unknown, idx: number) => {
             const l = isRecord(layer) ? layer : null;
             if (!l) return null;
             const motivation = isRecord(l.motivation) ? l.motivation : null;
             return (
               <Card key={idx} className="overflow-hidden border-l-4 border-l-blue-500/50">
                 <div className="bg-muted/30 p-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <div className="bg-background border px-2 py-0.5 rounded text-xs text-muted-foreground shadow-sm">Layer {idx + 1}</div>
                      <span>{nonEmptyText(l.layerName) ?? '未命名层'}</span>
                    </div>
                    <TagList items={asStringArray(l.roles)} />
                 </div>
                 <CardContent className="p-4 grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                       <Kv label="信息边界 (Boundary)" value={l.infoBoundary} icon={Eye} />
                       <Kv label="盲区 (Blind Spot)" value={l.blindSpot} icon={EyeOff} />
                    </div>
                    {motivation && (
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg text-sm space-y-2">
                        <div className="font-medium text-xs text-muted-foreground uppercase mb-1">Motivation</div>
                        <div className="grid grid-cols-2 gap-2">
                           <div>
                             <span className="text-xs text-green-600 dark:text-green-400">Yield: </span>
                             {toText(motivation.gain)}
                           </div>
                           <div>
                             <span className="text-xs text-red-600 dark:text-red-400">Avoid: </span>
                             {toText(motivation.lossAvoid)}
                           </div>
                        </div>
                        <div className="pt-2 border-t border-dashed mt-2">
                          <span className="text-xs text-muted-foreground">Trigger: </span>
                          {toText(motivation.activationTrigger)}
                        </div>
                      </div>
                    )}
                 </CardContent>
               </Card>
             );
          })}
        </div>
      </section>

      <Separator />

      {/* 角色矩阵 */}
      <section>
        <SectionHeader icon={LayoutGrid} title="角色矩阵 (Character Matrix)" description="主要角色的驱动力与弱点分析" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
           {characterMatrix.map((row: unknown, idx: number) => {
              const r = isRecord(row) ? row : null;
              if (!r) return null;
              return (
                <Card key={idx} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2 bg-muted/10">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      {nonEmptyText(r.name) ?? `Role #${idx + 1}`}
                    </CardTitle>
                    <CardDescription className="line-clamp-1">{toText(r.identity)}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <Kv label="目标" value={r.goal} icon={Target} />
                    <Kv label="秘密" value={r.secret} icon={EyeOff} />
                    <Kv label="软肋" value={r.vulnerability} icon={ShieldAlert} />
                    
                    {asStringArray(r.assumptions).length > 0 && (
                      <div className="pt-2">
                         <div className="text-xs font-medium text-muted-foreground mb-1">偏见/假设</div>
                         <div className="flex flex-wrap gap-1">
                           {asStringArray(r.assumptions).map((a, i) => (
                             <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground border">{a}</span>
                           ))}
                         </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
           })}
        </div>
      </section>
    </div>
  );
}

function Phase3View({ chain }: { chain: Record<string, unknown> }) {
  const beatFlow = isRecord(chain.beatFlow) ? chain.beatFlow : null;
  const acts = beatFlow && Array.isArray(beatFlow.acts) ? beatFlow.acts : [];

  if (!beatFlow) return <div className="text-muted-foreground">暂无节拍数据</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
         <SectionHeader icon={PlayCircle} title="节拍流程 (Beat Flow)" description="场景化的因果链推进" />
         <Badge variant="outline" className="text-xs font-mono">{toText(beatFlow.actMode)}</Badge>
      </div>

      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
         {acts.map((act: unknown, actIdx: number) => {
            const a = isRecord(act) ? act : null;
            if (!a) return null;
            const beats = Array.isArray(a.beats) ? a.beats : [];
            
            return (
              <div key={actIdx} className="relative">
                 {/* Act Header */}
                 <div className="sticky top-0 z-10 flex items-center justify-center mb-6">
                    <div className="bg-background border shadow-sm px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-primary"></span>
                       第 {toText(a.act)} 幕：{nonEmptyText(a.actName)}
                    </div>
                 </div>

                 <div className="space-y-6 pl-10 md:pl-0">
                    {beats.map((beat: unknown, bIdx: number) => {
                       const b = isRecord(beat) ? beat : null;
                       if (!b) return null;
                       
                       return (
                         <div key={bIdx} className="relative group md:flex md:justify-between md:gap-8 md:items-start">
                           {/* Timeline Dot */}
                            <div className="absolute -left-10 md:left-1/2 md:-ml-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-primary bg-background group-hover:bg-primary transition-colors z-10"></div>
                           
                           {/* Left Side (Context) */}
                           <div className="md:w-1/2 md:text-right md:pr-8 mb-2 md:mb-0">
                              <div className="text-sm font-medium text-muted-foreground mb-1">{toText(b.location)}</div>
                              <h4 className="font-semibold text-base">{nonEmptyText(b.beatName) || `Beat ${bIdx + 1}`}</h4>
                              <div className="mt-2 flex flex-wrap gap-1 md:justify-end">
                                 {asStringArray(b.characters).map(c => (
                                   <Badge key={c} variant="secondary" className="text-[10px] px-1 h-5">{c}</Badge>
                                 ))}
                              </div>
                           </div>

                           {/* Right Side (Details) */}
                           <div className="md:w-1/2 md:pl-8 bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
                              <div className="space-y-3">
                                 <Kv label="事件" value={b.surfaceEvent} className="font-medium" />
                                 <div className="grid grid-cols-1 gap-2 text-xs">
                                    <div className="flex gap-2 p-2 bg-muted/30 rounded">
                                       <Network className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
                                       <div className="flex-1">
                                          <span className="font-semibold text-muted-foreground mr-1">信息流:</span>
                                          {toText(b.infoFlow)}
                                       </div>
                                    </div>
                                    <div className="flex gap-2 p-2 bg-muted/30 rounded">
                                       <GitCommit className="w-3.5 h-3.5 text-orange-500 mt-0.5" />
                                       <div className="flex-1">
                                          <span className="font-semibold text-muted-foreground mr-1">咬合点:</span>
                                          {toText(b.interlock)}
                                       </div>
                                    </div>
                                 </div>
                                 
                                 <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-dashed">
                                    <span className="flex items-center gap-1"><Drama className="w-3 h-3" /> {toText(b.emotionalTone)}</span>
                                    <span className="flex items-center gap-1"><Lightbulb className="w-3 h-3" /> {toText(b.visualHook)}</span>
                                 </div>
                              </div>
                           </div>
                         </div>
                       );
                    })}
                 </div>
              </div>
            );
         })}
      </div>
    </div>
  );
}

function Phase4View({ chain }: { chain: Record<string, unknown> }) {
  const plotLines = Array.isArray(chain.plotLines) ? chain.plotLines : [];
  const consistencyChecks = isRecord(chain.consistencyChecks) ? chain.consistencyChecks : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section>
         <SectionHeader icon={GitBranch} title="叙事线 (Plot Lines)" description="多线交织与收束" />
         <div className="grid md:grid-cols-2 gap-4">
            {plotLines.map((pl: unknown, idx: number) => {
               const p = isRecord(pl) ? pl : null;
               if (!p) return null;
               return (
                 <Card key={idx} className="border-l-4 border-l-purple-500/50">
                    <CardHeader className="pb-2">
                       <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{nonEmptyText(p.lineType) ?? 'Plot Line'}</CardTitle>
                          {nonEmptyText(p.driver) && <Badge>{toText(p.driver)}</Badge>}
                       </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                       <div className="grid grid-cols-2 gap-2">
                          <div className="bg-muted/30 p-2 rounded">
                             <div className="text-xs text-muted-foreground mb-1">表面目标</div>
                             <div>{toText(p.statedGoal)}</div>
                          </div>
                          <div className="bg-muted/30 p-2 rounded">
                             <div className="text-xs text-muted-foreground mb-1">真实目标</div>
                             <div>{toText(p.trueGoal)}</div>
                          </div>
                       </div>
                       
                       <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">关键咬合点 (Key Interlocks)</div>
                          <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
                             {asStringArray(p.keyInterlocks).map((k, i) => <li key={i}>{k}</li>)}
                          </ul>
                       </div>

                       <div className="text-xs bg-destructive/10 text-destructive p-2 rounded flex gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span><b>不可逆点:</b> {toText(p.pointOfNoReturn)}</span>
                       </div>
                    </CardContent>
                 </Card>
               );
            })}
         </div>
      </section>

      <Separator />

      <section>
        <SectionHeader icon={CheckCircle2} title="自洽校验 (Consistency Checks)" description="叙事逻辑的自我审查" />
        {consistencyChecks ? (
           <div className="bg-card border rounded-xl overflow-hidden">
              <div className="grid divide-y">
                 {[
                   { k: 'blindSpotDrivesAction', label: '盲区是否驱动行动' },
                   { k: 'infoFlowChangesAtLeastTwo', label: '信息流是否至少改变两次' },
                   { k: 'coreConflictHasThreeWayTension', label: '核心冲突是否具备三方张力' },
                   { k: 'endingIrreversibleTriggeredByMultiLines', label: '结局是否由多线触发不可逆' },
                   { k: 'noRedundantRole', label: '是否存在冗余角色' }
                 ].map((item) => {
                    const val = consistencyChecks[item.k];
                    // 简单的判断：如果是 true/pass/yes 则为绿色，否则红色
                    // 实际 API 返回可能是 boolean 或 string，这里做模糊匹配
                    const s = String(val).toLowerCase();
                    const isPass = s === 'true' || s === 'yes' || s.includes('pass') || s.includes('是');
                    
                    return (
                       <div key={item.k} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                          <span className="text-sm font-medium">{item.label}</span>
                          <div className="flex items-center gap-2">
                             {isPass ? (
                               <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3 mr-1"/> 通过</Badge>
                             ) : (
                               <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1"/> {toText(val)}</Badge>
                             )}
                          </div>
                       </div>
                    );
                 })}
                 
                 {asStringArray(consistencyChecks.notes).length > 0 && (
                   <div className="p-4 bg-muted/20">
                      <div className="text-sm font-medium mb-2">审查备注</div>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                         {asStringArray(consistencyChecks.notes).map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                   </div>
                 )}
              </div>
           </div>
        ) : <div className="text-muted-foreground">暂无校验数据</div>}
      </section>
    </div>
  );
}

// --- Main Component ---

export function NarrativeCausalChainReadable({ value }: { value: unknown }) {
  const chain = useMemo(() => (isRecord(value) ? value : null), [value]);
  
  if (!chain) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
        <p>当前因果链数据为空或格式不正确</p>
      </div>
    );
  }

  const completedPhase = typeof chain.completedPhase === 'number' ? chain.completedPhase : 0;
  
  return (
    <Card className="w-full border shadow-sm bg-background/50 backdrop-blur-sm">
      <CardHeader className="border-b pb-4 bg-muted/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
              <CardTitle className="text-xl flex items-center gap-2">
                 <Network className="w-5 h-5 text-primary" />
                 叙事因果链
                 <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">v{toText(chain.version) || '0.1'}</Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                多阶段生成的深度叙事逻辑结构
              </CardDescription>
           </div>
           
           <div className="flex items-center gap-2">
              <div className="flex items-center text-sm text-muted-foreground bg-background border px-3 py-1 rounded-full shadow-sm">
                 <span className="mr-2">完成度</span>
                 <div className="flex gap-1">
                    {[1, 2, 3, 4].map(step => (
                      <div 
                        key={step} 
                        className={cn(
                          "w-2 h-2 rounded-full",
                          step <= completedPhase ? "bg-green-500" : "bg-muted-foreground/30"
                        )} 
                      />
                    ))}
                 </div>
              </div>
              {String(chain.validationStatus) === 'pass' && (
                <Badge variant="default" className="bg-green-600">自洽校验通过</Badge>
              )}
           </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="phase1" className="w-full">
          <div className="border-b px-4 bg-background">
             <TabsList className="h-auto w-full justify-start gap-4 bg-transparent p-0">
               {[
                 { id: 'phase1', label: '1. 核心冲突', icon: Target },
                 { id: 'phase2', label: '2. 角色与信息', icon: Users },
                 { id: 'phase3', label: '3. 节拍流程', icon: PlayCircle },
                 { id: 'phase4', label: '4. 叙事线与校验', icon: GitBranch },
               ].map((tab) => (
                 <TabsTrigger
                   key={tab.id}
                   value={tab.id}
                   className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3 px-2 transition-all hover:text-foreground"
                 >
                   <div className="flex items-center gap-2">
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                   </div>
                 </TabsTrigger>
               ))}
               <TabsTrigger value="raw" className="ml-auto data-[state=active]:bg-muted py-2 rounded-md border text-xs h-8">
                  JSON 源数据
               </TabsTrigger>
             </TabsList>
          </div>

          <ScrollArea className="h-[calc(100vh-300px)] min-h-[500px]">
             <div className="p-6">
                <TabsContent value="phase1" className="m-0 mt-0"><Phase1View chain={chain} /></TabsContent>
                <TabsContent value="phase2" className="m-0 mt-0"><Phase2View chain={chain} /></TabsContent>
                <TabsContent value="phase3" className="m-0 mt-0"><Phase3View chain={chain} /></TabsContent>
                <TabsContent value="phase4" className="m-0 mt-0"><Phase4View chain={chain} /></TabsContent>
                <TabsContent value="raw" className="m-0 mt-0">
                   <JsonViewer value={chain} className="text-xs font-mono" />
                </TabsContent>
             </div>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}
