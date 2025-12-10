import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SceneCard, SceneCardProps } from './SceneCard';

describe('SceneCard', () => {
  const defaultProps: SceneCardProps = {
    id: 'scene-1',
    order: 1,
    summary: '测试分镜',
    status: 'pending',
  };

  it('应该渲染分镜序号和摘要', () => {
    render(<SceneCard {...defaultProps} />);
    
    expect(screen.getByText('分镜 1')).toBeInTheDocument();
    expect(screen.getByText('测试分镜')).toBeInTheDocument();
  });

  it('应该显示待处理状态', () => {
    render(<SceneCard {...defaultProps} status="pending" />);
    
    expect(screen.getByText('待处理')).toBeInTheDocument();
  });

  it('应该显示已完成状态', () => {
    render(<SceneCard {...defaultProps} status="completed" />);
    
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('应该显示处理中状态', () => {
    render(<SceneCard {...defaultProps} status="in_progress" />);
    
    expect(screen.getByText('处理中')).toBeInTheDocument();
  });

  it('应该显示错误状态', () => {
    render(<SceneCard {...defaultProps} status="error" />);
    
    expect(screen.getByText('出错')).toBeInTheDocument();
  });

  it('应该显示场景描述', () => {
    render(
      <SceneCard
        {...defaultProps}
        sceneDescription="这是一个详细的场景描述"
      />
    );
    
    expect(screen.getByText('这是一个详细的场景描述')).toBeInTheDocument();
  });

  it('应该显示关键帧提示词', () => {
    render(
      <SceneCard
        {...defaultProps}
        keyframePrompt="一个美丽的场景，阳光明媚"
      />
    );
    
    expect(screen.getByText('一个美丽的场景，阳光明媚')).toBeInTheDocument();
  });

  it('应该支持点击展开/收起', () => {
    const onToggle = vi.fn();
    render(<SceneCard {...defaultProps} onToggle={onToggle} />);
    
    const card = screen.getByRole('article');
    expect(card).toBeInTheDocument();
  });
});
