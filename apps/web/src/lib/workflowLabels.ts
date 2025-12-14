export const WORKFLOW_STATE_LABELS: Record<string, string> = {
  IDLE: '未开始',
  DATA_COLLECTING: '填写基础设定',
  DATA_COLLECTED: '基础设定已完成',
  WORLD_VIEW_BUILDING: '世界观构建',
  CHARACTER_MANAGING: '角色管理',
  SCENE_LIST_GENERATING: '生成分镜列表中',
  SCENE_LIST_EDITING: '编辑分镜列表',
  SCENE_LIST_CONFIRMED: '分镜列表已确认',
  SCENE_PROCESSING: '细化分镜中',
  ALL_SCENES_COMPLETE: '分镜已全部完成',
  EXPORTING: '导出中',
};

export function getWorkflowStateLabel(state: string): string {
  return WORKFLOW_STATE_LABELS[state] || state;
}

