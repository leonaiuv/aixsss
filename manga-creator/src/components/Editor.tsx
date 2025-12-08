import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Card } from './ui/card';
import { CheckCircle2, Circle } from 'lucide-react';
import { BasicSettings } from './editor/BasicSettings';
import { SceneGeneration } from './editor/SceneGeneration';
import { SceneRefinement } from './editor/SceneRefinement';
import { PromptExport } from './editor/PromptExport';

type EditorStep = 'basic' | 'generation' | 'refinement' | 'export';

export function Editor() {
  const { currentProject } = useProjectStore();
  const [activeStep, setActiveStep] = useState<EditorStep>('basic');

  // 监听工作流变化自动切换步骤
  useEffect(() => {
    if (!currentProject) return;

    const state = currentProject.workflowState;
    
    if (state === 'IDLE' || state === 'DATA_COLLECTING') {
      setActiveStep('basic');
    } else if (state === 'DATA_COLLECTED' || state === 'SCENE_LIST_GENERATING' || state === 'SCENE_LIST_EDITING') {
      setActiveStep('generation');
    } else if (state === 'SCENE_LIST_CONFIRMED' || state === 'SCENE_PROCESSING') {
      setActiveStep('refinement');
    } else if (state === 'ALL_SCENES_COMPLETE' || state === 'EXPORTING') {
      setActiveStep('export');
    }
  }, [currentProject?.workflowState]);

  // 监听自定义事件来切换步骤
  useEffect(() => {
    const handleNextStep = () => {
      if (!currentProject) return;

      const state = currentProject.workflowState;
      
      if (state === 'DATA_COLLECTED') {
        setActiveStep('generation');
      } else if (state === 'SCENE_LIST_CONFIRMED') {
        setActiveStep('refinement');
      } else if (state === 'ALL_SCENES_COMPLETE') {
        setActiveStep('export');
      }
    };

    window.addEventListener('workflow:next-step', handleNextStep);
    return () => window.removeEventListener('workflow:next-step', handleNextStep);
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-slate-400">请先选择或创建一个项目</p>
      </div>
    );
  }

  const steps = [
    { id: 'basic' as EditorStep, name: '基础设定', states: ['IDLE', 'DATA_COLLECTING', 'DATA_COLLECTED'] },
    { id: 'generation' as EditorStep, name: '分镜生成', states: ['SCENE_LIST_GENERATING', 'SCENE_LIST_EDITING', 'SCENE_LIST_CONFIRMED'] },
    { id: 'refinement' as EditorStep, name: '分镜细化', states: ['SCENE_PROCESSING'] },
    { id: 'export' as EditorStep, name: '提示词导出', states: ['ALL_SCENES_COMPLETE', 'EXPORTING'] },
  ];

  const getStepStatus = (step: typeof steps[0]) => {
    const currentState = currentProject.workflowState;
    
    // 检查是否是当前步骤
    if (step.states.includes(currentState)) {
      return 'current';
    }
    
    // 检查是否已完成
    const allStates = [
      'IDLE',
      'DATA_COLLECTING',
      'DATA_COLLECTED',
      'SCENE_LIST_GENERATING',
      'SCENE_LIST_EDITING',
      'SCENE_LIST_CONFIRMED',
      'SCENE_PROCESSING',
      'ALL_SCENES_COMPLETE',
      'EXPORTING',
    ];
    
    const currentIndex = allStates.indexOf(currentState);
    const stepMaxIndex = Math.max(...step.states.map(s => allStates.indexOf(s)));
    
    if (currentIndex > stepMaxIndex) {
      return 'completed';
    }
    
    return 'pending';
  };

  const handleStepClick = (stepId: EditorStep) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    
    const status = getStepStatus(step);
    // 只允许点击当前或已完成的步骤
    if (status === 'current' || status === 'completed') {
      setActiveStep(stepId);
    }
  };

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6 min-h-[calc(100vh-180px)]">
      {/* 左侧步骤导航 */}
      <Card className="p-6 h-fit sticky top-24">
        <h3 className="font-semibold mb-4">创作流程</h3>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const status = getStepStatus(step);
            const isClickable = status === 'current' || status === 'completed';
            
            return (
              <div key={step.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  {status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : status === 'current' ? (
                    <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  {index < steps.length - 1 && (
                    <div className={`w-0.5 h-8 mt-2 ${
                      status === 'completed' ? 'bg-primary' : 'bg-border'
                    }`} />
                  )}
                </div>
                <button
                  onClick={() => handleStepClick(step.id)}
                  disabled={!isClickable}
                  className={`text-left transition-colors ${
                    isClickable ? 'cursor-pointer hover:text-primary' : 'cursor-not-allowed'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    status === 'current' ? 'text-primary' : 
                    status === 'completed' ? 'text-foreground' : 
                    'text-muted-foreground'
                  }`}>
                    {step.name}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 pt-6 border-t space-y-2">
          <p className="text-xs text-muted-foreground">当前项目</p>
          <p className="font-medium text-sm">{currentProject.title}</p>
        </div>
      </Card>

      {/* 右侧主内容区 */}
      <div className="space-y-6">
        {activeStep === 'basic' && <BasicSettings />}
        {activeStep === 'generation' && <SceneGeneration />}
        {activeStep === 'refinement' && <SceneRefinement />}
        {activeStep === 'export' && <PromptExport />}
      </div>
    </div>
  );
}
