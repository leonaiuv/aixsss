import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigDialog } from './ConfigDialog';
import { KeyManager, KeyPurpose } from '@/lib/keyManager';

// Mock stores
const mockSaveConfig = vi.fn();
const mockTestConnection = vi.fn();
const mockLoadConfig = vi.fn();
const mockClearConfig = vi.fn();
const mockSetActiveProfile = vi.fn();
const mockCreateProfile = vi.fn(() => 'profile_2');
const mockUpdateProfile = vi.fn();
const mockDeleteProfile = vi.fn();
let mockConfig: {
  provider: 'deepseek';
  apiKey: string;
  imageApiKey?: string;
  videoApiKey?: string;
  model: string;
  generationParams?: Record<string, unknown>;
};
let mockProfiles: Array<{
  id: string;
  name: string;
  config: typeof mockConfig;
  createdAt: string;
  updatedAt: string;
}>;

vi.mock('@/stores/configStore', () => ({
  useConfigStore: () => ({
    config: mockConfig,
    saveConfig: mockSaveConfig,
    testConnection: mockTestConnection,
    loadConfig: mockLoadConfig,
    clearConfig: mockClearConfig,
    profiles: mockProfiles,
    activeProfileId: 'profile_1',
    setActiveProfile: mockSetActiveProfile,
    createProfile: mockCreateProfile,
    updateProfile: mockUpdateProfile,
    deleteProfile: mockDeleteProfile,
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
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => delete store[key],
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });
  KeyManager.reset();
  mockConfig = {
    provider: 'deepseek',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  };
  mockProfiles = [
    {
      id: 'profile_1',
      name: '默认档案',
      config: mockConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
});

const openSecurityTab = () => {
  fireEvent.click(screen.getByRole('button', { name: /安全设置/i }));
};

const openConnectionTab = () => {
  fireEvent.click(screen.getByRole('button', { name: /连接配置/i }));
};

describe('ConfigDialog 基础功能', () => {
  it('应正确渲染对话框', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText('AI 设置')).toBeInTheDocument();
    expect(screen.getByLabelText(/文本 API Key/i)).toBeInTheDocument();
  });

  it('应显示保存按钮', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole('button', { name: /保存配置/i })).toBeInTheDocument();
  });

  it('连接配置应显示文本/图片/视频模型输入', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();
    expect(screen.getByLabelText(/文本模型/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/图片模型/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/视频模型/i)).toBeInTheDocument();
  });

  it('连接配置应显示图片/视频供应商选择（不再只跟随文本供应商）', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();
    expect(screen.getByText(/图片供应商/i)).toBeInTheDocument();
    expect(screen.getByText(/视频供应商/i)).toBeInTheDocument();
  });

  it('当图片供应商为 NanoBanana(DMXAPI) 时应显示图片 API Key（与文本供应商无关）', () => {
    mockConfig = {
      provider: 'deepseek',
      apiKey: 'text-key',
      model: 'deepseek-chat',
      generationParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        imageProvider: 'nanobananapro-dmxapi',
        imageBaseURL: 'https://www.dmxapi.cn',
        imageModel: 'gemini-3-pro-image-preview',
      },
    };
    mockProfiles[0].config = mockConfig;

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();
    expect(screen.getByLabelText(/图片 API Key/i)).toBeInTheDocument();
  });

  it('图片供应商不跟随文本时：保存应持久化 imageProvider/imageApiKey', async () => {
    mockConfig = {
      provider: 'deepseek',
      apiKey: 'text-key',
      imageApiKey: 'img-key',
      model: 'deepseek-chat',
      generationParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        imageProvider: 'openai-compatible',
        imageBaseURL: 'https://api.openai.com',
        imageModel: 'gpt-image-1',
      },
    };
    mockProfiles[0].config = mockConfig;

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();
    fireEvent.click(screen.getByRole('button', { name: /保存配置/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'profile_1',
        expect.objectContaining({
          config: expect.objectContaining({
            imageApiKey: 'img-key',
            generationParams: expect.objectContaining({
              imageProvider: 'openai-compatible',
              imageModel: 'gpt-image-1',
            }),
          }),
        }),
      );
    });
  });

  it('视频供应商不跟随文本时：保存应持久化 videoProvider/videoApiKey', async () => {
    mockConfig = {
      provider: 'deepseek',
      apiKey: 'text-key',
      videoApiKey: 'ark-key',
      model: 'deepseek-chat',
      generationParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        videoProvider: 'doubao-ark',
        videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        videoModel: 'doubao-seedance-1-5-pro-251215',
      },
    };
    mockProfiles[0].config = mockConfig;

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();
    fireEvent.click(screen.getByRole('button', { name: /保存配置/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'profile_1',
        expect.objectContaining({
          config: expect.objectContaining({
            videoApiKey: 'ark-key',
            generationParams: expect.objectContaining({
              videoProvider: 'doubao-ark',
              videoModel: 'doubao-seedance-1-5-pro-251215',
            }),
          }),
        }),
      );
    });
  });

  it('保存时应同时持久化文本/图片/视频模型', async () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openConnectionTab();

    fireEvent.change(screen.getByLabelText(/文本模型/i), {
      target: { value: 'deepseek-reasoner' },
    });
    fireEvent.change(screen.getByLabelText(/图片模型/i), {
      target: { value: 'gpt-image-1' },
    });
    fireEvent.change(screen.getByLabelText(/视频模型/i), {
      target: { value: 'veo-3' },
    });

    fireEvent.click(screen.getByRole('button', { name: /保存配置/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        'profile_1',
        expect.objectContaining({
          config: expect.objectContaining({
            model: 'deepseek-reasoner',
            generationParams: expect.objectContaining({
              imageModel: 'gpt-image-1',
              videoModel: 'veo-3',
            }),
          }),
        }),
      );
    });
  });
});

describe('ConfigDialog 加密密码设置', () => {
  it('应显示加密密码设置区域', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    expect(screen.getByText(/使用默认加密/i)).toBeInTheDocument();
  });

  it('未设置密码时应显示设置密码表单', () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    expect(screen.getByLabelText(/加密密码/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/确认密码/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /设置加密密码/i })).toBeInTheDocument();
  });

  it('密码不匹配时应显示错误', async () => {
    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
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

    openSecurityTab();
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

    openSecurityTab();
    const passwordInput = screen.getByLabelText(/加密密码/i);
    const confirmInput = screen.getByLabelText(/确认密码/i);
    const submitBtn = screen.getByRole('button', { name: /设置加密密码/i });

    fireEvent.change(passwordInput, { target: { value: 'secure-password-123' } });
    fireEvent.change(confirmInput, { target: { value: 'secure-password-123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(KeyManager.isInitialized()).toBe(true);
      expect(KeyManager.hasCustomPassword()).toBe(true);
      expect(mockLoadConfig).toHaveBeenCalled();
    });
  });

  it('已设置密码时应显示更换密码选项', async () => {
    // 先设置密码
    KeyManager.initialize('existing-password');

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    expect(screen.getByText(/已启用加密保护/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /更换密码/i })).toBeInTheDocument();
  });

  it('更换密码时应验证当前密码', async () => {
    KeyManager.initialize('current-password');

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    const changeBtn = screen.getByRole('button', { name: /更换密码/i });
    fireEvent.click(changeBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/当前密码/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/新密码/i)).toBeInTheDocument();
    });
  });

  it('更换密码时当前密码错误应提示', async () => {
    KeyManager.initialize('current-password');
    localStorage.setItem('aixs_key_check', KeyManager.encrypt('ok', KeyPurpose.GENERAL));

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    fireEvent.click(screen.getByRole('button', { name: /更换密码/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/当前密码/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/新密码/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/当前密码/i), { target: { value: 'wrong-password' } });
    fireEvent.change(screen.getByLabelText(/新密码/i), { target: { value: 'new-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: /确认更换/i }));

    await waitFor(() => {
      expect(screen.getByText(/当前密码不正确/i)).toBeInTheDocument();
    });
  });
});

describe('ConfigDialog 忘记密码', () => {
  it('已设置密码时应显示忘记密码选项', () => {
    KeyManager.initialize('my-password');

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    expect(screen.getByRole('button', { name: /忘记密码/i })).toBeInTheDocument();
  });

  it('点击忘记密码应显示确认提示', async () => {
    KeyManager.initialize('my-password');

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
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

    openSecurityTab();
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

    openSecurityTab();
    expect(screen.getByText(/使用默认加密/i)).toBeInTheDocument();
  });

  it('已设置密码时应显示安全状态', () => {
    KeyManager.initialize('my-password');

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    expect(screen.getByText(/已启用加密保护/i)).toBeInTheDocument();
  });
});

describe('ConfigDialog 解锁流程', () => {
  it('已设置密码但未解锁时应显示解锁表单并禁用编辑', () => {
    // 模拟“设置过密码但重启未解锁”的场景
    localStorage.setItem('aixs_has_custom_password', 'true');
    KeyManager.reset();

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByLabelText(/文本 API Key/i)).toBeDisabled();
    expect(screen.getByLabelText(/文本模型/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /测试连接/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /保存配置/i })).toBeDisabled();

    openSecurityTab();
    expect(screen.getByText(/配置已锁定/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /解锁/i })).toBeInTheDocument();
  });

  it('解锁密码错误应提示错误信息', async () => {
    // 先用正确密码初始化（写入校验标记），再模拟重启未解锁
    KeyManager.initialize('correct-password');
    localStorage.setItem('aixs_key_check', KeyManager.encrypt('ok', KeyPurpose.GENERAL));
    KeyManager.reset();

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    fireEvent.change(screen.getByLabelText(/^加密密码$/), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /解锁/i }));

    await waitFor(() => {
      expect(screen.getByText(/密码不正确/i)).toBeInTheDocument();
      expect(mockLoadConfig).not.toHaveBeenCalled();
    });
  });

  it('解锁成功后应调用 loadConfig 并解除禁用', async () => {
    KeyManager.initialize('correct-password');
    localStorage.setItem('aixs_key_check', KeyManager.encrypt('ok', KeyPurpose.GENERAL));
    KeyManager.reset();

    render(<ConfigDialog open={true} onOpenChange={() => {}} />);

    openSecurityTab();
    fireEvent.change(screen.getByLabelText(/^加密密码$/), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /解锁/i }));

    await waitFor(() => {
      expect(mockLoadConfig).toHaveBeenCalled();
    });

    openConnectionTab();
    await waitFor(() => {
      expect(screen.getByLabelText(/文本 API Key/i)).not.toBeDisabled();
      expect(screen.getByLabelText(/文本模型/i)).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /测试连接/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /保存配置/i })).not.toBeDisabled();
    });
  });
});
