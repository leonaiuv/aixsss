import { describe, expect, it, vi } from 'vitest';
import { parseArgs, migrateShotPromptToV2 } from './migrate-shotprompt-v2.js';

function makeLegacyShotPrompt(): string {
  const keyframes = Object.fromEntries(
    Array.from({ length: 9 }).map((_, idx) => [
      `KF${idx}`,
      {
        zh: {
          subjects: [{ name: '主角', position: `位置${idx + 1}`, action: `动作${idx + 1}` }],
          usedAnchors: ['站台灯箱', '轨道线'],
          composition: `构图${idx + 1}`,
          bubbleSpace: '右上',
        },
      },
    ]),
  );
  return JSON.stringify({
    camera: { type: 'MS', angle: 'eye_level', aspectRatio: '16:9' },
    keyframes,
    avoid: { zh: '不要水印', en: 'no watermark' },
  });
}

function makeV2ShotPrompt(): string {
  return JSON.stringify({
    storyboard_config: {
      layout: '3x3_grid',
      aspect_ratio: '16:9',
      style: 'modern_thriller',
      visual_anchor: {
        character: '角色锚点',
        environment: '环境锚点',
        lighting: '灯光锚点',
        mood: '紧张',
      },
    },
    shots: [
      { shot_number: '分镜1', type: 'ELS', type_cn: '大远景', description: 'd1', angle: 'Eye level', focus: '建立环境' },
      { shot_number: '分镜2', type: 'LS', type_cn: '远景', description: 'd2', angle: 'Eye level', focus: '动作展示' },
      { shot_number: '分镜3', type: 'MLS', type_cn: '中远景', description: 'd3', angle: 'Slight low angle', focus: '人物关系' },
      { shot_number: '分镜4', type: 'MS', type_cn: '中景', description: 'd4', angle: 'Eye level', focus: '肢体语言' },
      { shot_number: '分镜5', type: 'MCU', type_cn: '中近景', description: 'd5', angle: 'Slight high angle', focus: '情绪表达' },
      { shot_number: '分镜6', type: 'CU', type_cn: '近景', description: 'd6', angle: 'Straight on', focus: '眼神细节' },
      { shot_number: '分镜7', type: 'ECU', type_cn: '特写', description: 'd7', angle: 'Macro', focus: '关键道具' },
      { shot_number: '分镜8', type: 'Low Angle', type_cn: '仰拍', description: 'd8', angle: 'Extreme low angle', focus: '权力关系' },
      { shot_number: '分镜9', type: 'High Angle', type_cn: '俯拍', description: 'd9', angle: 'Top-down', focus: '上帝视角' },
    ],
    technical_requirements: {
      consistency: 'ABSOLUTE',
      composition: 'Label',
      quality: '8K',
    },
  });
}

describe('migrate-shotprompt-v2 script', () => {
  it('parseArgs 应正确处理 dry-run/apply/limit/project-id', () => {
    expect(parseArgs([])).toEqual({
      dryRun: true,
      apply: false,
      limit: 0,
    });
    expect(parseArgs(['--apply', '--limit', '10', '--project-id', 'p1'])).toEqual({
      dryRun: false,
      apply: true,
      limit: 10,
      projectId: 'p1',
    });
  });

  it('dry-run 模式不应写库', async () => {
    const rows = [{ id: 's1', projectId: 'p1', shotPrompt: makeLegacyShotPrompt() }];
    const sceneModel = {
      findMany: vi.fn(async () => rows),
      update: vi.fn(async () => ({})),
    };

    const stats = await migrateShotPromptToV2(sceneModel, {
      dryRun: true,
      apply: false,
      limit: 0,
      projectId: 'p1',
    });

    expect(stats.mode).toBe('dry-run');
    expect(stats.scanned).toBe(1);
    expect(stats.migrated).toBe(1);
    expect(sceneModel.update).not.toHaveBeenCalled();
  });

  it('apply 模式应写入，且二次执行幂等', async () => {
    const rows = [
      { id: 'legacy', projectId: 'p1', shotPrompt: makeLegacyShotPrompt() },
      { id: 'v2', projectId: 'p1', shotPrompt: makeV2ShotPrompt() },
    ];
    const sceneModel = {
      findMany: vi.fn(async () => rows),
      update: vi.fn(async (args: { where: { id: string }; data: { shotPrompt: string } }) => {
        const row = rows.find((item) => item.id === args.where.id);
        if (row) row.shotPrompt = args.data.shotPrompt;
        return {};
      }),
    };

    const first = await migrateShotPromptToV2(sceneModel, {
      dryRun: false,
      apply: true,
      limit: 0,
      projectId: 'p1',
    });

    expect(first.mode).toBe('apply');
    expect(first.scanned).toBe(2);
    expect(first.migrated).toBe(1);
    expect(sceneModel.update).toHaveBeenCalledTimes(1);

    const updated = JSON.parse(rows[0].shotPrompt ?? '{}') as { shots?: Array<{ type?: string }> };
    expect(updated.shots).toHaveLength(9);
    expect(updated.shots?.[0]?.type).toBe('ELS');
    expect(updated.shots?.[8]?.type).toBe('High Angle');

    sceneModel.update.mockClear();

    const second = await migrateShotPromptToV2(sceneModel, {
      dryRun: false,
      apply: true,
      limit: 0,
      projectId: 'p1',
    });

    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(2);
    expect(sceneModel.update).not.toHaveBeenCalled();
  });
});
