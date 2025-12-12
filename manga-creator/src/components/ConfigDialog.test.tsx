import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigDialog } from './ConfigDialog';
import { KeyManager } from '@/lib/keyManager';

// Mock stores
const mockSaveConfig = vi.fn();
const mockTestConnection = vi.fn();
const mockConfig = {
  provider: 'deepseek' as const,
  apiKey: 'test-api-key',
  model: 'deepseek-chat',
};

vi.mock('@/stores/configStore', () => ({
  useConfigStore: () => ({
    config: mockConfig,
    saveConfig: mockSaveConfig,
    testConnection: mockTestConnection,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock localStorage
function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    length: 0,
    clear: () => Object.keys(store).forEach(k => delete store[k]),
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => delete store[key],
    setItem: (key: string, value: string) => { store[key] = value; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });
  KeyManager.reset();
});

describe('ConfigDialog 基础功能', () => {
  it('应正确渲染对话框', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByText('API配置')).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
  });

  it('应显示保存按钮', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByRole('button', { name: /保存配置/i })).toBeInTheDocument();
  });
});

describe('ConfigDialog 加密密码设置', () => {
  it('应显示加密密码设置区域', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByText(/加密设置/i)).toBeInTheDocument();
  });

  it('未设置密码时应显示设置密码表单', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByLabelText(/加密密码/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/确认密码/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /设置加密密码/i })).toBeInTheDocument();
  });

  it('密码不匹配时应显示错误', async () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const passwordInput = screen.getByLabelText(/加密密码/i);
    const confirmInput = screen.getByLabelText(/确认密码/i);
    const submitBtn = screen.getByRole('button', { name: /设置加密密码/i });
    
    fireEvent.change(passwordInput, { target: { value: 'password1' } });
    fireEvent.change(confirmInput, { target: { value: 'password2' } });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/密码不匹配/i)).toBeInTheDocument();
    });
  });

  it('密码过短时应显示错误', async () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const passwordInput = screen.getByLabelText(/加密密码/i);
    const confirmInput = screen.getByLabelText(/确认密码/i);
    const submitBtn = screen.getByRole('button', { name: /设置加密密码/i });
    
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.change(confirmInput, { target: { value: '123' } });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/密码至少6位/i)).toBeInTheDocument();
    });
  });

  it('正确设置密码后应初始化加密', async () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const passwordInput = screen.getByLabelText(/加密密码/i);
    const confirmInput = screen.getByLabelText(/确认密码/i);
    const submitBtn = screen.getByRole('button', { name: /设置加密密码/i });
    
    fireEvent.change(passwordInput, { target: { value: 'secure-password-123' } });
    fireEvent.change(confirmInput, { target: { value: 'secure-password-123' } });
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(KeyManager.isInitialized()).toBe(true);
      expect(KeyManager.hasCustomPassword()).toBe(true);
    });
  });

  it('已设置密码时应显示更换密码选项', async () => {
    // 先设置密码
    KeyManager.initialize('existing-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByText(/已启用加密保护/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /更换密码/i })).toBeInTheDocument();
  });

  it('更换密码时应验证当前密码', async () => {
    KeyManager.initialize('current-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const changeBtn = screen.getByRole('button', { name: /更换密码/i });
    fireEvent.click(changeBtn);
    
    await waitFor(() => {
      expect(screen.getByLabelText(/当前密码/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/新密码/i)).toBeInTheDocument();
    });
  });
});

describe('ConfigDialog 忘记密码', () => {
  it('已设置密码时应显示忘记密码选项', () => {
    KeyManager.initialize('my-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByRole('button', { name: /忘记密码/i })).toBeInTheDocument();
  });

  it('点击忘记密码应显示确认提示', async () => {
    KeyManager.initialize('my-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const forgetBtn = screen.getByRole('button', { name: /忘记密码/i });
    fireEvent.click(forgetBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/警告/i)).toBeInTheDocument();
      expect(screen.getByText(/清除所有加密配置/i)).toBeInTheDocument();
    });
  });

  it('确认重置后应清除加密状态', async () => {
    KeyManager.initialize('my-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    const forgetBtn = screen.getByRole('button', { name: /忘记密码/i });
    fireEvent.click(forgetBtn);
    
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /确认重置/i });
      fireEvent.click(confirmBtn);
    });
    
    await waitFor(() => {
      // 应显示设置密码表单
      expect(screen.getByLabelText(/加密密码/i)).toBeInTheDocument();
    });
  });
});

describe('ConfigDialog 加密状态指示', () => {
  it('未设置密码时应显示警告', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByText(/使用默认加密/i)).toBeInTheDocument();
  });

  it('已设置密码时应显示安全状态', () => {
    KeyManager.initialize('my-password');
    
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);
    
    expect(screen.getByText(/已启用加密保护/i)).toBeInTheDocument();
  });
});
