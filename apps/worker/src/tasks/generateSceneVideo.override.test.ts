import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: vi.fn((encrypted: string) => {
    if (encrypted === 'video-key-encrypted') return 'video-key';
    return 'text-key';
  }),
}));

import { generateSceneVideo } from './generateSceneVideo.js';

function makeJsonResponse(data: unknown, init?: { status?: number; statusText?: string }): Response {
  const status = init?.status ?? 200;
  const statusText = init?.statusText ?? 'OK';
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

describe('generateSceneVideo - provider override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('当 videoProvider=doubao-ark 且文本 provider!=doubao_ark 时应使用 videoApiKeyEncrypted 与 videoBaseURL', async () => {
    type TaskArgs = Parameters<typeof generateSceneVideo>[0];

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('/content_generation/tasks') && init.method === 'POST') {
        return makeJsonResponse({ id: 'task_1' });
      }
      if (url.includes('/content_generation/tasks/task_1') && init.method === 'GET') {
        return makeJsonResponse({
          status: 'succeeded',
          content: { video_url: 'https://example.com/v.mp4' },
        });
      }
      throw new Error(`Unexpected fetch: ${init.method} ${url}`);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          style: '',
          artStyleConfig: null,
        }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          sceneDescription: 'scene',
          motionPrompt: 'motion',
          generatedVideos: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'deepseek',
          model: 'deepseek-chat',
          baseURL: 'https://api.deepseek.com',
          apiKeyEncrypted: 'text-key-encrypted',
          videoApiKeyEncrypted: 'video-key-encrypted',
          generationParams: {
            videoProvider: 'doubao-ark',
            videoModel: 'doubao-seedance-1-5-pro-251215',
            videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
          },
        }),
      },
    };

    const res = await generateSceneVideo({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(res.videos[0]?.url).toBe('https://example.com/v.mp4');

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain('https://ark.cn-beijing.volces.com/api/v3/content_generation/tasks');
    expect(firstInit.headers).toMatchObject({ Authorization: 'Bearer video-key' });
  });

  it('视频覆盖已启用但缺少 videoApiKeyEncrypted 时应抛错', async () => {
    type TaskArgs = Parameters<typeof generateSceneVideo>[0];

    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn() as unknown as typeof fetch;

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          style: '',
          artStyleConfig: null,
        }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          sceneDescription: 'scene',
          motionPrompt: 'motion',
          generatedVideos: null,
        }),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'deepseek',
          model: 'deepseek-chat',
          baseURL: 'https://api.deepseek.com',
          apiKeyEncrypted: 'text-key-encrypted',
          videoApiKeyEncrypted: null,
          generationParams: {
            videoProvider: 'doubao-ark',
            videoModel: 'doubao-seedance-1-5-pro-251215',
            videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
          },
        }),
      },
    };

    await expect(
      generateSceneVideo({
        prisma: prisma as unknown as TaskArgs['prisma'],
        teamId: 't1',
        projectId: 'p1',
        sceneId: 's1',
        aiProfileId: 'a1',
        apiKeySecret: 'secret',
        updateProgress: async () => {},
      }),
    ).rejects.toThrow(/视频 API Key/i);
  });
});
