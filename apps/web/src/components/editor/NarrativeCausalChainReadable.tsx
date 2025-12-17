import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Separator } from '@/components/ui/separator';

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

function Kv({ label, value }: { label: string; value: unknown }) {
  const text = nonEmptyText(value);
  if (!text) return null;
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 md:col-span-3 text-sm text-muted-foreground">{label}</div>
      <div className="col-span-12 md:col-span-9 text-sm whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{title}</div>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((it, idx) => (
          <li key={`${idx}-${it.slice(0, 30)}`} className="text-sm whitespace-pre-wrap break-words">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Extras({ title, obj, known }: { title: string; obj: unknown; known: string[] }) {
  if (!isRecord(obj)) return null;
  const extras = omitKnown(obj, known);
  if (!Object.keys(extras).length) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{title}</div>
      <JsonViewer value={extras} defaultExpandDepth={1} maxHeightClassName="max-h-[30vh]" />
    </div>
  );
}

export function NarrativeCausalChainReadable({ value }: { value: unknown }) {
  const chain = useMemo(() => (isRecord(value) ? value : null), [value]);
  if (!chain) {
    return (
      <div className="text-sm text-muted-foreground">
        当前因果链不是标准对象结构，无法生成可读版。
      </div>
    );
  }

  const completedPhase = chain.completedPhase;
  const validationStatus = chain.validationStatus;
  const version = chain.version;

  const outlineSummary = chain.outlineSummary;
  const conflictEngine = isRecord(chain.conflictEngine) ? chain.conflictEngine : null;
  const firstMover =
    conflictEngine && isRecord(conflictEngine.firstMover) ? conflictEngine.firstMover : null;

  const infoLayers = Array.isArray(chain.infoVisibilityLayers) ? chain.infoVisibilityLayers : [];
  const characterMatrix = Array.isArray(chain.characterMatrix) ? chain.characterMatrix : [];

  const beatFlow = isRecord(chain.beatFlow) ? chain.beatFlow : null;
  const acts = beatFlow && Array.isArray(beatFlow.acts) ? beatFlow.acts : [];

  const plotLines = Array.isArray(chain.plotLines) ? chain.plotLines : [];
  const consistencyChecks = isRecord(chain.consistencyChecks) ? chain.consistencyChecks : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">可读版</Badge>
          <span className="text-sm text-muted-foreground">
            版本：{typeof version === 'string' ? version : '-'} · 进度：
            {typeof completedPhase === 'number' ? `${completedPhase}/4` : '-/4'} · 自洽校验：
            {typeof validationStatus === 'string' ? validationStatus : '-'}
          </span>
        </div>
      </Card>

      <Accordion
        type="multiple"
        defaultValue={['phase1', 'phase2', 'phase3', 'phase4']}
        className="w-full"
      >
        <AccordionItem value="phase1">
          <AccordionTrigger>阶段1：核心冲突</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <Kv label="故事大纲摘要" value={outlineSummary} />

              {conflictEngine ? (
                <>
                  <Separator />
                  <Kv label="核心冲突物件/事件" value={conflictEngine.coreObjectOrEvent} />

                  {/* 第一推动因 */}
                  {firstMover ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">第一推动因</div>
                      <Kv label="发起者" value={firstMover.initiator} />
                      <Kv label="公开理由" value={firstMover.publicReason} />
                      <Kv label="真实意图" value={firstMover.hiddenIntent} />
                      <Kv label="合法性包装" value={firstMover.legitimacyMask} />
                      <Extras
                        title="第一推动因 · 扩展字段（含中文/非预期 key）"
                        obj={firstMover}
                        known={['initiator', 'publicReason', 'hiddenIntent', 'legitimacyMask']}
                      />
                    </div>
                  ) : null}

                  {/* 各方利害 */}
                  {isRecord(conflictEngine.stakesByFaction) ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">各方利害（stakesByFaction）</div>
                      <div className="space-y-2">
                        {Object.entries(conflictEngine.stakesByFaction).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-12 gap-3">
                            <div className="col-span-12 md:col-span-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                              {k}
                            </div>
                            <div className="col-span-12 md:col-span-9 text-sm whitespace-pre-wrap break-words">
                              {toText(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <List
                    title="必要性推导（necessityDerivation）"
                    items={
                      Array.isArray(conflictEngine.necessityDerivation)
                        ? conflictEngine.necessityDerivation.map((x) => toText(x)).filter(Boolean)
                        : []
                    }
                  />

                  <Extras
                    title="冲突引擎 · 扩展字段"
                    obj={conflictEngine}
                    known={[
                      'coreObjectOrEvent',
                      'stakesByFaction',
                      'firstMover',
                      'necessityDerivation',
                    ]}
                  />
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="phase2">
          <AccordionTrigger>阶段2：信息分层 + 角色矩阵</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {infoLayers.length ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">信息能见度层（从高到低）</div>
                  <div className="space-y-4">
                    {infoLayers.map((layer, idx) => {
                      const l = isRecord(layer) ? layer : null;
                      if (!l) return null;
                      const roles = Array.isArray(l.roles)
                        ? l.roles.map((r) => toText(r)).filter(Boolean)
                        : [];
                      const motivation = isRecord(l.motivation) ? l.motivation : null;
                      return (
                        <Card key={idx} className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">
                              {nonEmptyText(l.layerName) ?? `未命名层 #${idx + 1}`}
                            </div>
                            {roles.length ? (
                              <Badge variant="secondary">{roles.join('、')}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            <Kv label="信息边界" value={l.infoBoundary} />
                            <Kv label="盲区" value={l.blindSpot} />
                            {motivation ? (
                              <div className="space-y-2">
                                <div className="text-sm font-medium">动机（motivation）</div>
                                <Kv label="收益动机（gain）" value={motivation.gain} />
                                <Kv label="避损动机（lossAvoid）" value={motivation.lossAvoid} />
                                <Kv label="触发点" value={motivation.activationTrigger} />
                                <Extras
                                  title="动机 · 扩展字段"
                                  obj={motivation}
                                  known={['gain', 'lossAvoid', 'activationTrigger']}
                                />
                              </div>
                            ) : null}
                            <Extras
                              title="该层 · 扩展字段"
                              obj={l}
                              known={[
                                'layerName',
                                'roles',
                                'infoBoundary',
                                'blindSpot',
                                'motivation',
                              ]}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无信息层数据。</div>
              )}

              <Separator />

              {characterMatrix.length ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">角色矩阵</div>
                  <div className="space-y-3">
                    {characterMatrix.map((row, idx) => {
                      const r = isRecord(row) ? row : null;
                      if (!r) return null;
                      const name = nonEmptyText(r.name) ?? `未命名角色 #${idx + 1}`;
                      const assumptions = asStringArray(r.assumptions);
                      return (
                        <Card key={idx} className="p-4">
                          <div className="text-sm font-medium">{name}</div>
                          <div className="mt-2 space-y-2">
                            <Kv label="身份" value={r.identity} />
                            <Kv label="目标" value={r.goal} />
                            <Kv label="秘密" value={r.secret} />
                            <Kv label="软肋" value={r.vulnerability} />
                            <List title="假设/偏见（assumptions）" items={assumptions} />
                            <Extras
                              title="该角色 · 扩展字段"
                              obj={r}
                              known={[
                                'name',
                                'identity',
                                'goal',
                                'secret',
                                'vulnerability',
                                'assumptions',
                              ]}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无角色矩阵数据。</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="phase3">
          <AccordionTrigger>阶段3：节拍流程（场景化）</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {beatFlow ? (
                <>
                  <Kv label="幕结构（actMode）" value={beatFlow.actMode} />
                  {acts.length ? (
                    <div className="space-y-4">
                      {acts.map((act, idx) => {
                        const a = isRecord(act) ? act : null;
                        if (!a) return null;
                        const beats = Array.isArray(a.beats) ? a.beats : [];
                        return (
                          <Card key={idx} className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">
                                第{typeof a.act === 'number' ? a.act : idx + 1}幕
                                {nonEmptyText(a.actName) ? `「${nonEmptyText(a.actName)}」` : ''}
                              </div>
                              <Badge variant="secondary">{beats.length} 个节拍</Badge>
                            </div>
                            <div className="mt-3 space-y-3">
                              {beats.map((beat, bIdx) => {
                                const b = isRecord(beat) ? beat : null;
                                if (!b) return null;
                                const characters = asStringArray(b.characters);
                                return (
                                  <Card key={bIdx} className="p-3 border-dashed">
                                    <div className="text-sm font-medium">
                                      {nonEmptyText(b.beatName) ?? `节拍 #${bIdx + 1}`}
                                    </div>
                                    <div className="mt-2 space-y-2">
                                      <Kv label="表面事件" value={b.surfaceEvent} />
                                      <Kv label="信息流" value={b.infoFlow} />
                                      <Kv label="冲突升级（escalation）" value={b.escalation} />
                                      <Kv label="咬合点（interlock）" value={b.interlock} />
                                      <Kv label="地点" value={b.location} />
                                      {characters.length ? (
                                        <div className="grid grid-cols-12 gap-3">
                                          <div className="col-span-12 md:col-span-3 text-sm text-muted-foreground">
                                            在场角色
                                          </div>
                                          <div className="col-span-12 md:col-span-9 text-sm">
                                            {characters.join('、')}
                                          </div>
                                        </div>
                                      ) : null}
                                      <Kv label="视觉钩子" value={b.visualHook} />
                                      <Kv label="情绪基调" value={b.emotionalTone} />
                                      <Kv label="预估分镜数" value={b.estimatedScenes} />
                                      <Extras
                                        title="该节拍 · 扩展字段"
                                        obj={b}
                                        known={[
                                          'beatName',
                                          'surfaceEvent',
                                          'infoFlow',
                                          'escalation',
                                          'interlock',
                                          'location',
                                          'characters',
                                          'visualHook',
                                          'emotionalTone',
                                          'estimatedScenes',
                                        ]}
                                      />
                                    </div>
                                  </Card>
                                );
                              })}
                              <Extras
                                title="该幕 · 扩展字段"
                                obj={a}
                                known={['act', 'actName', 'beats']}
                              />
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">暂无节拍数据。</div>
                  )}
                  <Extras title="节拍流程 · 扩展字段" obj={beatFlow} known={['actMode', 'acts']} />
                </>
              ) : (
                <div className="text-sm text-muted-foreground">暂无节拍流程数据。</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="phase4">
          <AccordionTrigger>阶段4：叙事线交织 + 自洽校验</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {plotLines.length ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">叙事线（plotLines）</div>
                  <div className="space-y-3">
                    {plotLines.map((pl, idx) => {
                      const p = isRecord(pl) ? pl : null;
                      if (!p) return null;
                      const interlocks = asStringArray(p.keyInterlocks);
                      return (
                        <Card key={idx} className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">
                              {nonEmptyText(p.lineType) ?? '未标注线类型'}
                            </div>
                            {nonEmptyText(p.driver) ? (
                              <Badge variant="secondary">{String(p.driver)}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-2">
                            <Kv label="表面目标" value={p.statedGoal} />
                            <Kv label="真实目标" value={p.trueGoal} />
                            <List title="关键咬合点（keyInterlocks）" items={interlocks} />
                            <Kv label="不可逆点" value={p.pointOfNoReturn} />
                            <Extras
                              title="该叙事线 · 扩展字段"
                              obj={p}
                              known={[
                                'lineType',
                                'driver',
                                'statedGoal',
                                'trueGoal',
                                'keyInterlocks',
                                'pointOfNoReturn',
                              ]}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无叙事线数据。</div>
              )}

              <Separator />

              {consistencyChecks ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">自洽校验（consistencyChecks）</div>
                  <div className="space-y-2">
                    <Kv label="盲区驱动行动" value={consistencyChecks.blindSpotDrivesAction} />
                    <Kv
                      label="信息流至少改变两次"
                      value={consistencyChecks.infoFlowChangesAtLeastTwo}
                    />
                    <Kv
                      label="核心冲突三方张力"
                      value={consistencyChecks.coreConflictHasThreeWayTension}
                    />
                    <Kv
                      label="结局由多线触发不可逆"
                      value={consistencyChecks.endingIrreversibleTriggeredByMultiLines}
                    />
                    <Kv label="无冗余角色" value={consistencyChecks.noRedundantRole} />
                    <List title="备注（notes）" items={asStringArray(consistencyChecks.notes)} />
                    <Extras
                      title="自洽校验 · 扩展字段"
                      obj={consistencyChecks}
                      known={[
                        'blindSpotDrivesAction',
                        'infoFlowChangesAtLeastTwo',
                        'coreConflictHasThreeWayTension',
                        'endingIrreversibleTriggeredByMultiLines',
                        'noRedundantRole',
                        'notes',
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">暂无自洽校验数据。</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="extras">
          <AccordionTrigger>扩展字段（根级，含中文/非预期 key）</AccordionTrigger>
          <AccordionContent>
            <Extras
              title="根级扩展字段"
              obj={chain}
              known={[
                'version',
                'validationStatus',
                'revisionSuggestions',
                'completedPhase',
                'outlineSummary',
                'conflictEngine',
                'infoVisibilityLayers',
                'characterMatrix',
                'beatFlow',
                'plotLines',
                'consistencyChecks',
              ]}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
