export const WORKFLOW_STATE_LABELS: Record<string, string> = {
  IDLE: '未开始',
  DATA_COLLECTING: '填写基础设定',
  DATA_COLLECTED: '基础设定已完成',
  WORLD_VIEW_BUILDING: '世界观构建',
  CHARACTER_MANAGING: '角色管理',
  EPISODE_PLANNING: '剧集规划中',
  EPISODE_PLAN_EDITING: '编辑剧集规划',
  EPISODE_CREATING: '单集创作中',
  SCENE_LIST_GENERATING: '生成分镜列表中',
  SCENE_LIST_EDITING: '编辑分镜列表',
  SCENE_LIST_CONFIRMED: '分镜列表已确认',
  SCENE_PROCESSING: '细化分镜中',
  ALL_SCENES_COMPLETE: '分镜已全部完成',
  ALL_EPISODES_COMPLETE: '剧集已全部完成',
  EXPORTING: '导出中',
  SCRIPT_WRITING: '分场脚本中',
  sound_design_generating: '声音设计生成中',
  sound_design_confirmed: '声音设计已确认',
};

export function getWorkflowStateLabel(state: string): string {
  return WORKFLOW_STATE_LABELS[state] || state;
}
