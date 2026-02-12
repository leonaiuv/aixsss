import { describe, expect, it } from 'vitest';
import { mergeGeneratedImages } from './mergeGeneratedImages';

describe('mergeGeneratedImages', () => {
  it('应在同 keyframe 时覆盖旧图并保留 metadata.providerUrl', () => {
    const out = mergeGeneratedImages(
      [
        { keyframe: 'KF0', url: 'https://old/kf0.png' },
        { keyframe: 'KF3', url: 'https://old/kf3.png' },
      ],
      {
        keyframe: 'KF3',
        url: 'data:image/png;base64,abcd',
        metadata: { providerUrl: 'https://provider/new-kf3.png' },
      },
    );

    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyframe: 'KF0', url: 'https://old/kf0.png' }),
        expect.objectContaining({
          keyframe: 'KF3',
          url: 'data:image/png;base64,abcd',
          metadata: expect.objectContaining({
            providerUrl: 'https://provider/new-kf3.png',
          }),
        }),
      ]),
    );
  });

  it('应按 KF0-KF8 顺序输出，新增 keyframe 也能插入正确位置', () => {
    const out = mergeGeneratedImages(
      [{ keyframe: 'KF7', url: 'https://old/kf7.png' }],
      { keyframe: 'KF2', url: 'https://new/kf2.png' },
    );

    expect(out.map((item) => item.keyframe)).toEqual(['KF2', 'KF7']);
  });
});
