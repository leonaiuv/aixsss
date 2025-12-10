import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreeColumnLayout } from './ThreeColumnLayout';

describe('ThreeColumnLayout', () => {
  it('应该渲染三个主要区域', () => {
    render(
      <ThreeColumnLayout
        left={<div data-testid="left-panel">左侧面板</div>}
        center={<div data-testid="center-panel">中间画布</div>}
        right={<div data-testid="right-panel">右侧对话</div>}
      />
    );

    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  it('应该正确渲染传入的子组件内容', () => {
    render(
      <ThreeColumnLayout
        left={<span>项目列表</span>}
        center={<span>编辑器</span>}
        right={<span>AI对话</span>}
      />
    );

    expect(screen.getByText('项目列表')).toBeInTheDocument();
    expect(screen.getByText('编辑器')).toBeInTheDocument();
    expect(screen.getByText('AI对话')).toBeInTheDocument();
  });

  it('应该应用正确的布局类名', () => {
    const { container } = render(
      <ThreeColumnLayout
        left={<div>左</div>}
        center={<div>中</div>}
        right={<div>右</div>}
      />
    );

    // 检查根容器使用 flex 布局
    const root = container.firstChild;
    expect(root).toHaveClass('flex');
  });

  it('应该支持自定义类名', () => {
    const { container } = render(
      <ThreeColumnLayout
        left={<div>左</div>}
        center={<div>中</div>}
        right={<div>右</div>}
        className="custom-layout"
      />
    );

    const root = container.firstChild;
    expect(root).toHaveClass('custom-layout');
  });
});
