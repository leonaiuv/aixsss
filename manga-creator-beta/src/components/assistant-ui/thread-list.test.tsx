import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadList } from './thread-list';

// Mock assistant-ui components to avoid context errors
vi.mock('@assistant-ui/react', () => ({
  ThreadListPrimitive: {
    Root: ({ children, className }: any) => <div className={className}>{children}</div>,
    New: ({ children }: any) => <div>{children}</div>,
    Items: () => <div>Items</div>,
  },
  ThreadListItemPrimitive: {
    Root: ({ children }: any) => <div>{children}</div>,
    Trigger: ({ children }: any) => <div>{children}</div>,
    Title: () => <div>Title</div>,
    Archive: ({ children }: any) => <div>{children}</div>,
  }
}));

// Mock icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    Settings: () => <span data-testid="settings-icon">Settings</span>,
    Eye: () => <span>Eye</span>,
    EyeOff: () => <span>EyeOff</span>,
    Check: () => <span>Check</span>,
    X: () => <span>X</span>,
    PlusIcon: () => <span>Plus</span>,
    ArchiveIcon: () => <span>Archive</span>,
  };
});

describe('ThreadList UI', () => {
  it('renders the settings button in header', () => {
    render(<ThreadList />);
    
    // 查找设置按钮 (通过 title 属性)
    const settingsButton = screen.getByTitle('API 设置');
    expect(settingsButton).toBeInTheDocument();
    
    // 确保它在“项目列表”标题附近 (简单验证两者都存在)
    expect(screen.getByText('项目列表')).toBeInTheDocument();
  });

  it('opens config panel when settings button is clicked', () => {
    render(<ThreadList />);
    
    const settingsButton = screen.getByTitle('API 设置');
    fireEvent.click(settingsButton);
    
    // 应该显示配置面板的内容 (Modal)
    expect(screen.getByText('API 配置')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-xxxxxxxxxxxxxxxx')).toBeInTheDocument();
    
    // 验证是否显示了保存和取消按钮
    expect(screen.getByText('保存')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });
});
