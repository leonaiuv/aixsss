import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  generateImagesWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: vi.fn((encrypted: string) => {
    if (encrypted === 'image-key-encrypted') return 'image-key';
    return 'text-key';
  }),
}));

import { generateImagesWithProvider } from '../providers/index.js';
import { generateKeyframeImages } from './generateKeyframeImages.js';

describe('generateKeyframeImages - dual api keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [{ url: 'https://example.com/1.png' }],
    });
  });

  it('NanoBanana 模式应优先使用图片专用 key', async () => {
    type TaskArgs = Parameters<typeof generateKeyframeImages>[0];

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
          shotPrompt: 'a shot prompt',
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'gemini',
          model: 'gemini-1.5-pro',
          baseURL: null,
          apiKeyEncrypted: 'text-key-encrypted',
          imageApiKeyEncrypted: 'image-key-encrypted',
          generationParams: {
            imageProvider: 'nanobananapro-dmxapi',
            imageModel: 'gemini-3-pro-image-preview',
          },
        }),
      },
    };

    await generateKeyframeImages({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const firstCall = (generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall?.[0]).toMatchObject({
      kind: 'nanobanana_dmxapi',
      apiKey: 'image-key',
    });
  });

  it('图片专用 key 缺失时应回退文本 key', async () => {
    type TaskArgs = Parameters<typeof generateKeyframeImages>[0];

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
          shotPrompt: 'a shot prompt',
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'gemini',
          model: 'gemini-1.5-pro',
          baseURL: null,
          apiKeyEncrypted: 'text-key-encrypted',
          imageApiKeyEncrypted: null,
          generationParams: {
            imageProvider: 'nanobananapro-dmxapi',
            imageModel: 'gemini-3-pro-image-preview',
          },
        }),
      },
    };

    await generateKeyframeImages({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const firstCall = (generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall?.[0]).toMatchObject({
      kind: 'nanobanana_dmxapi',
      apiKey: 'text-key',
    });
  });
});
