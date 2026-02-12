import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneDetailModal } from './SceneDetailModal';
import type { Scene } from '@/types';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function buildScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene_1',
    projectId: 'proj_1',
    episodeId: 'ep_1',
    order: 1,
    summary: '测试分镜',
    sceneDescription: '场景锚点',
    actionDescription: '',
    shotPrompt: 'shot prompt',
    motionPrompt: 'motion prompt',
    status: 'pending',
    notes: '',
    ...overrides,
  };
}

describe('SceneDetailModal', () => {
  const baseProps = {
    open: true,
    onOpenChange: () => undefined,
    scene: buildScene(),
    prevScene: null,
    characters: [],
    worldViewElements: [],
    isRefining: false,
    isGeneratingImages: false,
    isGeneratingVideo: false,
    refineProgress: undefined,
    isBatchBlocked: false,
    isGeneratingSoundDesign: false,
    isEstimatingDuration: false,
    aiProfileId: 'aip_1',
    onUpdateScene: () => undefined,
    onRefineScene: () => undefined,
    onGenerateImages: () => undefined,
    onGenerateVideo: () => undefined,
    onGenerateSingleKeyframeImage: () => undefined,
    onGenerateSoundDesign: () => undefined,
    onEstimateDuration: () => undefined,
    onDeleteScene: () => undefined,
    onCopyImg2ImgPack: async () => undefined,
    parsedKeyframes: {
      keyframes: [],
      keyframeKeys: [],
      filledKeyframeCount: 0,
      isStructured: false,
    },
    parsedMotion: {
      motionShort: {},
      motionBeats: {},
      constraints: {},
      isStructured: false,
    },
    onCopyKeyframe: async () => undefined,
    onCopyKeyframeAvoid: async () => undefined,
    onCopyMotion: async () => undefined,
    onCopySceneAnchor: async () => undefined,
    onCopyDialogues: async () => undefined,
    sceneAnchorCopyText: { zh: '', en: '' },
    getSceneStatusLabel: () => '待处理',
    onGenerateKeyframePrompt: () => undefined,
    onGenerateSingleKeyframePrompt: () => undefined,
    isGeneratingKeyframePrompt: false,
    generatingSingleKeyframeKey: null,
    generatingSingleImageKey: null,
  } as const;

  it('不应再显示分镜组功能区块', () => {
    render(
      <SceneDetailModal
        {...baseProps}
        scene={buildScene({
          storyboardSceneBibleJson: { ok: true },
          storyboardPlanJson: { ok: true },
          storyboardGroupsJson: {
            settings: { camera_mode: 'B' },
            groups: [],
          },
        })}
      />,
    );

    expect(screen.queryByText('分镜组（81镜头）')).not.toBeInTheDocument();
    expect(screen.queryByText('生成下一组')).not.toBeInTheDocument();
    expect(screen.queryByText('生成 SceneBible')).not.toBeInTheDocument();
    expect(screen.queryByText('生成 Plan（初始化 KF0-KF8）')).not.toBeInTheDocument();
  });

  it('应支持整组生成关键帧提示词', async () => {
    const user = userEvent.setup();
    const onGenerateKeyframePrompt = vi.fn();

    render(
      <SceneDetailModal
        {...baseProps}
        onGenerateKeyframePrompt={onGenerateKeyframePrompt}
        scene={buildScene({ shotPrompt: '' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: '生成关键帧提示词' }));
    expect(onGenerateKeyframePrompt).toHaveBeenCalledWith('scene_1');
  });

  it('应支持单帧生成关键帧提示词', async () => {
    const user = userEvent.setup();
    const onGenerateSingleKeyframePrompt = vi.fn();

    render(
      <SceneDetailModal
        {...baseProps}
        onGenerateSingleKeyframePrompt={onGenerateSingleKeyframePrompt}
      />,
    );

    await user.click(screen.getByRole('button', { name: '生成 KF0' }));
    expect(onGenerateSingleKeyframePrompt).toHaveBeenCalledWith('scene_1', 'KF0');
  });

  it('应支持单关键帧图片重生成', async () => {
    const user = userEvent.setup();
    const onGenerateSingleKeyframeImage = vi.fn();

    render(
      <SceneDetailModal
        {...baseProps}
        onGenerateSingleKeyframeImage={onGenerateSingleKeyframeImage}
        scene={buildScene({
          generatedImages: [{ keyframe: 'KF0', url: 'https://example.com/kf0.png' }],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重生成图片 KF0' }));
    expect(onGenerateSingleKeyframeImage).toHaveBeenCalledWith('scene_1', 'KF0');
  });

  it('应支持双击关键帧图片放大预览', async () => {
    const user = userEvent.setup();
    render(
      <SceneDetailModal
        {...baseProps}
        scene={buildScene({
          generatedImages: [{ keyframe: 'KF0', url: 'https://example.com/kf0.png' }],
        })}
      />,
    );

    await user.dblClick(screen.getByRole('img', { name: 'KF0 keyframe' }));
    expect(screen.getByRole('img', { name: 'KF0 预览大图' })).toBeInTheDocument();
  });

  it('应提供对话框无障碍标题与描述', () => {
    render(<SceneDetailModal {...baseProps} />);
    expect(screen.getByText('分镜详情')).toBeInTheDocument();
    expect(screen.getByText('查看并编辑分镜内容、提示词与生成结果')).toBeInTheDocument();
  });

  it('弹层应保持 fixed 定位，避免向下偏移', () => {
    render(<SceneDetailModal {...baseProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).not.toContain('relative');
  });
});
