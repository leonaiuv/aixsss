import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight, Sparkles, Globe, Users, Palette, Brush, Layers, MapPin, Copy, Check } from 'lucide-react';
import { WorldViewBuilder } from './WorldViewBuilder';
import { CharacterManager } from './CharacterManager';
import { 
  ART_STYLE_PRESETS, 
  ArtStyleConfig, 
  getArtStyleConfig, 
  composeStyleFullPrompt,
  migrateOldStyleToConfig 
} from '@/types';

export function BasicSettings() {
  const { currentProject, updateProject } = useProjectStore();
  
  // 初始化画风配置
  const getInitialStyleConfig = (): ArtStyleConfig => {
    if (currentProject?.artStyleConfig) {
      return currentProject.artStyleConfig;
    }
    if (currentProject?.style) {
      return migrateOldStyleToConfig(currentProject.style);
    }
    return getArtStyleConfig('anime_cel')!;
  };

  const [formData, setFormData] = useState({
    summary: currentProject?.summary || '',
    protagonist: currentProject?.protagonist || '',
  });
  const [styleConfig, setStyleConfig] = useState<ArtStyleConfig>(getInitialStyleConfig());
  const [activeTab, setActiveTab] = useState('basic');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (currentProject) {
      setFormData({
        summary: currentProject.summary || '',
        protagonist: currentProject.protagonist || '',
      });
      setStyleConfig(getInitialStyleConfig());
    }
  }, [currentProject?.id]);

  if (!currentProject) {
    return null;
  }

  // 处理预设选择
  const handlePresetChange = (presetId: string) => {
    const newConfig = getArtStyleConfig(presetId);
    if (newConfig) {
      setStyleConfig(newConfig);
    }
  };

  // 处理单个维度修改
  const handleStyleFieldChange = (field: keyof Omit<ArtStyleConfig, 'presetId' | 'fullPrompt'>, value: string) => {
    const newConfig = {
      ...styleConfig,
      presetId: 'custom', // 修改后变为自定义
      [field]: value,
    };
    // 重新合成 fullPrompt
    newConfig.fullPrompt = composeStyleFullPrompt(newConfig);
    setStyleConfig(newConfig);
  };

  // 复制完整提示词
  const handleCopyFullPrompt = async () => {
    await navigator.clipboard.writeText(styleConfig.fullPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const canProceed = formData.summary.length >= 50 && styleConfig.fullPrompt && formData.protagonist.length >= 20;

  const handleSave = () => {
    if (canProceed) {
      updateProject(currentProject.id, {
        summary: formData.summary,
        style: styleConfig.presetId, // 向后兼容
        artStyleConfig: styleConfig,  // 新版完整配置
        protagonist: formData.protagonist,
        workflowState: 'DATA_COLLECTED',
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleProceed = () => {
    handleSave();
    // 触发进入下一步的事件
    window.dispatchEvent(new CustomEvent('workflow:next-step'));
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">基础设定</h2>
            <p className="text-sm text-muted-foreground">
              输入剧本梗概、选择画风、描述主角,为AI生成分镜做准备
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            <span>AI辅助创作</span>
          </div>
        </div>

        {/* Tabs结构：基本信息/世界观/角色 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="basic" className="gap-2">
              <Sparkles className="h-4 w-4" />
              基本信息
            </TabsTrigger>
            <TabsTrigger value="worldview" className="gap-2">
              <Globe className="h-4 w-4" />
              世界观 (可选)
            </TabsTrigger>
            <TabsTrigger value="characters" className="gap-2">
              <Users className="h-4 w-4" />
              角色 (可选)
            </TabsTrigger>
          </TabsList>

          {/* 基本信息Tab */}
          <TabsContent value="basic">
        {/* 剧本输入 */}
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="summary" className="text-base font-semibold">
              剧本梗概 *
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              简述故事情节、冲突、转折点(建议50-300字)
            </p>
            <Textarea
              id="summary"
              placeholder="示例: 在未来都市,黑客少女发现了政府隐藏的真相。她潜入数据中心,解开层层加密,最终揭露了控制人类意识的阴谋。在追击中,她必须在信任同伴与独自逃亡之间做出抉择..."
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              className="min-h-[180px] resize-none"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {formData.summary.length < 50 && (
                  <span className="text-yellow-500">还需 {50 - formData.summary.length} 字</span>
                )}
                {formData.summary.length >= 50 && formData.summary.length < 300 && (
                  <span className="text-green-500">✓ 长度合适</span>
                )}
                {formData.summary.length >= 300 && (
                  <span className="text-orange-500">建议精简至300字以内</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formData.summary.length} / 300
              </p>
            </div>
          </div>

          {/* 风格选择 - 重构版 */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="style" className="text-base font-semibold">
                画风选择 *
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                选择预设画风，或自定义调整各项参数
              </p>
              <Select value={styleConfig.presetId} onValueChange={handlePresetChange}>
                <SelectTrigger id="style" className="h-12">
                  <SelectValue placeholder="选择画风预设..." />
                </SelectTrigger>
                <SelectContent>
                  {ART_STYLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="flex flex-col items-start py-1">
                        <span className="font-medium">{preset.label}</span>
                        <span className="text-xs text-muted-foreground">{preset.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {styleConfig.presetId === 'custom' && (
                    <SelectItem value="custom">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-medium">自定义画风</span>
                        <span className="text-xs text-muted-foreground">已修改的自定义配置</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* 画风细节调整区 - 可展开 */}
            <Accordion type="single" collapsible className="border rounded-lg">
              <AccordionItem value="style-details" className="border-0">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">画风细节调整</span>
                    {styleConfig.presetId === 'custom' && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">已自定义</span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  {/* 整体风格 */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5" />
                      整体风格
                    </Label>
                    <Input
                      value={styleConfig.baseStyle}
                      onChange={(e) => handleStyleFieldChange('baseStyle', e.target.value)}
                      placeholder="如: anime style, cel shaded, clean lineart"
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  {/* 渲染技法 */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Brush className="h-3.5 w-3.5" />
                      渲染技法
                    </Label>
                    <Input
                      value={styleConfig.technique}
                      onChange={(e) => handleStyleFieldChange('technique', e.target.value)}
                      placeholder="如: heavy impasto brushstrokes, watercolor wash"
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  {/* 色彩倾向 */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Palette className="h-3.5 w-3.5" />
                      色彩倾向
                    </Label>
                    <Input
                      value={styleConfig.colorPalette}
                      onChange={(e) => handleStyleFieldChange('colorPalette', e.target.value)}
                      placeholder="如: vibrant saturated colors, high contrast"
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  {/* 文化/时代特征 */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      文化/时代特征
                    </Label>
                    <Input
                      value={styleConfig.culturalFeature}
                      onChange={(e) => handleStyleFieldChange('culturalFeature', e.target.value)}
                      placeholder="如: Oriental aesthetics, Victorian era"
                      className="font-mono text-sm"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            {/* 完整提示词预览 */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">完整画风提示词 (Full Prompt)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyFullPrompt}
                  className="h-7 gap-1.5"
                >
                  {copiedPrompt ? (
                    <><Check className="h-3.5 w-3.5" />已复制</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" />复制</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed break-all">
                {styleConfig.fullPrompt}
              </p>
            </div>
          </div>

          {/* 主角描述 */}
          <div className="space-y-2">
            <Label htmlFor="protagonist" className="text-base font-semibold">
              主角描述 *
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              描述主角的外貌特征、服装、性格(建议20-150字)
            </p>
            <Textarea
              id="protagonist"
              placeholder="示例: 18岁少女,银色短发,紫色赛博义眼。穿黑色机能夹克、破洞牛仔裤、高帮军靴。性格冷静理智但内心孤独,精通编程和黑客技术,右臂有发光电路纹身..."
              value={formData.protagonist}
              onChange={(e) => setFormData({ ...formData, protagonist: e.target.value })}
              className="min-h-[140px] resize-none"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {formData.protagonist.length < 20 && (
                  <span className="text-yellow-500">还需 {20 - formData.protagonist.length} 字</span>
                )}
                {formData.protagonist.length >= 20 && (
                  <span className="text-green-500">✓ 描述充分</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formData.protagonist.length} / 150
              </p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <Button variant="outline" onClick={handleSave} disabled={!canProceed}>
            保存草稿
          </Button>
          <Button 
            onClick={handleProceed} 
            disabled={!canProceed}
            className="gap-2"
          >
            <span>确认并生成分镜</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 提示信息 */}
        {!canProceed && (
          <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              💡 请完整填写所有必填项(标注*)后才能进入下一步
            </p>
          </div>
        )}
          </TabsContent>

          {/* 世界观Tab */}
          <TabsContent value="worldview">
            <WorldViewBuilder />
          </TabsContent>

          {/* 角色Tab */}
          <TabsContent value="characters">
            <CharacterManager projectId={currentProject.id} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* 示例参考卡片 */}
      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>填写建议</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong>剧本梗概</strong>: 包含起因、发展、高潮、结局的基本框架</li>
          <li>• <strong>画风选择</strong>: 考虑故事题材和目标受众</li>
          <li>• <strong>主角描述</strong>: 越具体越好,包括视觉特征和性格标签</li>
          <li>• <strong>一致性原则</strong>: 所有描述将被提取为"项目上下文",贯穿整个创作流程</li>
        </ul>
      </Card>
    </div>
  );
}
