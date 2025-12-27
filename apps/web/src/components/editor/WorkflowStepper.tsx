import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export type WorkflowStepId = 'workbench' | 'global' | 'causal' | 'plan' | 'episode' | 'export';

interface WorkflowStepperProps {
  currentStep: WorkflowStepId;
  onStepClick: (step: WorkflowStepId) => void;
  className?: string;
}

const STEPS: { id: WorkflowStepId; label: string; description: string }[] = [
  { id: 'workbench', label: '工作台', description: '概览与任务' },
  { id: 'global', label: '全局设定', description: '世界观/角色' },
  { id: 'causal', label: '因果链', description: '故事骨架' },
  { id: 'plan', label: '剧集规划', description: '分集大纲' },
  { id: 'episode', label: '单集创作', description: '核心与分镜' },
  { id: 'export', label: '导出', description: '整合产物' },
];

export function WorkflowStepper({ currentStep, onStepClick, className }: WorkflowStepperProps) {
  return (
    <div
      className={cn(
        'w-full py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mb-8',
        className,
      )}
    >
      <div className="container flex items-center justify-between max-w-7xl mx-auto px-4">
        <nav aria-label="Progress">
          <ol role="list" className="flex items-center">
            {STEPS.map((step, stepIdx) => {
              const isCurrent = step.id === currentStep;
              const isCompleted = STEPS.findIndex((s) => s.id === currentStep) > stepIdx;

              return (
                <li
                  key={step.id}
                  className={cn('relative', stepIdx !== STEPS.length - 1 ? 'pr-8 sm:pr-20' : '')}
                >
                  {stepIdx !== STEPS.length - 1 && (
                    <div
                      className="absolute top-4 left-0 -right-8 h-0.5 w-full hidden sm:block"
                      aria-hidden="true"
                    >
                      <div
                        className={cn(
                          'h-full transition-all duration-500 ease-in-out',
                          isCompleted ? 'bg-primary' : 'bg-muted',
                        )}
                      />
                    </div>
                  )}
                  <button
                    onClick={() => onStepClick(step.id)}
                    className="group relative flex flex-col items-center text-center focus:outline-none"
                    disabled={false} // Allow jumping for now, logic can be added later
                  >
                    <span className="flex items-center justify-center">
                      <span
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-200 z-10 bg-background',
                          isCompleted
                            ? 'border-primary bg-primary text-primary-foreground'
                            : isCurrent
                              ? 'border-primary ring-4 ring-primary/20'
                              : 'border-muted-foreground/30 hover:border-primary/50',
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <span
                            className={cn(
                              'text-xs font-bold',
                              isCurrent ? 'text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {stepIdx + 1}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="mt-2 flex flex-col items-center">
                      <span
                        className={cn(
                          'text-sm font-medium transition-colors duration-200',
                          isCurrent
                            ? 'text-primary'
                            : isCompleted
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                        )}
                      >
                        {step.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
