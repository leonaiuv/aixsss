import { describe, expect, it } from 'vitest';
import { resolveRefineSceneAllOptions } from './refineSceneAll.js';

describe('resolveRefineSceneAllOptions', () => {
  it('should enable sound design and duration estimate by default', () => {
    expect(resolveRefineSceneAllOptions(undefined)).toEqual({
      includeSoundDesign: true,
      includeDurationEstimate: true,
    });
  });

  it('should respect explicit options', () => {
    expect(
      resolveRefineSceneAllOptions({
        includeSoundDesign: false,
        includeDurationEstimate: true,
      }),
    ).toEqual({
      includeSoundDesign: false,
      includeDurationEstimate: true,
    });
  });
});

