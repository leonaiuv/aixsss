import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  generateImagesWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: vi.fn(() => 'text-key'),
}));

import { generateImagesWithProvider } from '../providers/index.js';
import { generateKeyframeImages } from './generateKeyframeImages.js';

describe('generateKeyframeImages V2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled')));
    (generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [{ url: 'https://example.com/image.png' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应按 storyboard V2 的 9 个 shots 逐帧生成图片', async () => {
    type TaskArgs = Parameters<typeof generateKeyframeImages>[0];

    const shotPrompt = JSON.stringify({
      storyboard_config: {
        layout: '3x3_grid',
        aspect_ratio: '16:9',
        style: 'modern_thriller',
        visual_anchor: {
          character: '黑色短发，深灰风衣，左眉浅疤',
          environment: '废弃地铁站台，冷色调',
          lighting: '戏剧侧光',
          mood: '紧张',
        },
      },
      shots: Array.from({ length: 9 }).map((_, idx) => ({
        shot_number: `分镜${idx + 1}`,
        type: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'Low Angle', 'High Angle'][idx],
        type_cn: ['大远景', '远景', '中远景', '中景', '中近景', '近景', '特写', '仰拍', '俯拍'][idx],
        description: `镜头${idx + 1}，统一光影和氛围`,
        angle: 'Eye level',
        focus: '叙事推进',
      })),
      technical_requirements: {
        consistency: 'ABSOLUTE: Same character face, same costume, same lighting across all 9 panels',
        composition: "Label '分镜X' top-left corner, cinematic 2.39:1 ratio",
        quality: 'Photorealistic, 8K, film grain',
      },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1', style: 'cinematic', artStyleConfig: null }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          sceneDescription: '{"scene":{"zh":"地铁站台","en":"subway platform"}}',
          shotPrompt,
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'openai_compatible',
          model: 'gpt-image-1',
          baseURL: null,
          apiKeyEncrypted: 'enc',
          imageApiKeyEncrypted: null,
          generationParams: null,
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

    expect((generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(9);
    const firstPrompt = (generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? '';
    expect(String(firstPrompt)).toContain('visual_anchor');
    expect(String(firstPrompt)).toContain('technical_requirements');
  });

  it('单关键帧重生成时应仅调用一次并保留其他已存在图片', async () => {
    type TaskArgs = Parameters<typeof generateKeyframeImages>[0];

    const shotPrompt = JSON.stringify({
      storyboard_config: {
        layout: '3x3_grid',
        aspect_ratio: '16:9',
      },
      shots: Array.from({ length: 9 }).map((_, idx) => ({
        shot_number: `分镜${idx + 1}`,
        type: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'Low Angle', 'High Angle'][idx],
        type_cn: ['大远景', '远景', '中远景', '中景', '中近景', '近景', '特写', '仰拍', '俯拍'][idx],
        description: `镜头${idx + 1}`,
        angle: 'Eye level',
        focus: '叙事推进',
      })),
      technical_requirements: {},
    });

    const sceneUpdate = vi.fn().mockResolvedValue({ id: 's1' });
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1', style: 'cinematic', artStyleConfig: null }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          sceneDescription: '{"scene":{"zh":"地铁站台","en":"subway platform"}}',
          shotPrompt,
          generatedImages: [
            { keyframe: 'KF0', url: 'https://example.com/old-kf0.png' },
            { keyframe: 'KF3', url: 'https://example.com/old-kf3.png' },
          ],
        }),
        update: sceneUpdate,
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'openai_compatible',
          model: 'gpt-image-1',
          baseURL: null,
          apiKeyEncrypted: 'enc',
          imageApiKeyEncrypted: null,
          generationParams: null,
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
      keyframeKey: 'KF3',
    } as TaskArgs);

    expect((generateImagesWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    const lastUpdateArg = sceneUpdate.mock.calls.at(-1)?.[0]?.data?.generatedImages as Array<{
      keyframe: string;
      url: string;
    }>;
    expect(lastUpdateArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyframe: 'KF0', url: 'https://example.com/old-kf0.png' }),
        expect.objectContaining({ keyframe: 'KF3', url: 'https://example.com/image.png' }),
      ]),
    );
  });

  it('应将远程图片URL持久化为 data:image 以避免外链过期', async () => {
    type TaskArgs = Parameters<typeof generateKeyframeImages>[0];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
      }),
    );

    const sceneUpdate = vi.fn().mockResolvedValue({ id: 's1' });
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1', style: 'cinematic', artStyleConfig: null }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          sceneDescription: '{"scene":{"zh":"地铁站台","en":"subway platform"}}',
          shotPrompt: JSON.stringify({
            storyboard_config: { layout: '3x3_grid', aspect_ratio: '16:9' },
            shots: Array.from({ length: 9 }).map((_, idx) => ({
              shot_number: `分镜${idx + 1}`,
              type: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'Low Angle', 'High Angle'][idx],
              type_cn: ['大远景', '远景', '中远景', '中景', '中近景', '近景', '特写', '仰拍', '俯拍'][idx],
              description: `镜头${idx + 1}`,
              angle: 'Eye level',
              focus: '叙事推进',
            })),
            technical_requirements: {},
          }),
          generatedImages: [],
        }),
        update: sceneUpdate,
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'openai_compatible',
          model: 'gpt-image-1',
          baseURL: null,
          apiKeyEncrypted: 'enc',
          imageApiKeyEncrypted: null,
          generationParams: null,
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
      keyframeKey: 'KF0',
    } as TaskArgs);

    const lastUpdateArg = sceneUpdate.mock.calls.at(-1)?.[0]?.data?.generatedImages as Array<{
      keyframe: string;
      url: string;
      metadata?: { providerUrl?: string };
    }>;
    expect(lastUpdateArg?.[0]?.url).toMatch(/^data:image\/png;base64,/);
    expect(lastUpdateArg?.[0]?.metadata?.providerUrl).toBe('https://example.com/image.png');
  });
});
