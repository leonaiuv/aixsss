import { describe, expect, it } from 'vitest';
import { getWorkflowStateLabel } from './workflowLabels';

describe('workflowLabels', () => {
  it('should map newly added workflow states to Chinese labels', () => {
    expect(getWorkflowStateLabel('SCRIPT_WRITING')).toBe('分场脚本中');
    expect(getWorkflowStateLabel('sound_design_generating')).toBe('声音设计生成中');
    expect(getWorkflowStateLabel('sound_design_confirmed')).toBe('声音设计已确认');
  });

  it('should fallback to raw state text for unknown states', () => {
    expect(getWorkflowStateLabel('UNKNOWN_STATE')).toBe('UNKNOWN_STATE');
  });
});
