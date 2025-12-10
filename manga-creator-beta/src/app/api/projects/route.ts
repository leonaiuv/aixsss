import { NextResponse } from 'next/server';
import { getCheckpointStore } from '@/lib/checkpoint/store';

/**
 * GET /api/projects
 * 
 * 获取所有项目列表
 */
export async function GET() {
  try {
    const store = await getCheckpointStore();
    const projects = await store.list();

    // 转换为列表项格式
    const projectList = projects.map((p) => ({
      id: p.projectId,
      title: p.title || '未命名项目',
      summary: p.summary,
      workflowState: p.workflowState,
      scenesCount: p.scenes.length,
      updatedAt: p.updatedAt,
    }));

    // 按更新时间倒序排序
    projectList.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({
      success: true,
      data: projectList,
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取项目列表失败',
      },
      { status: 500 }
    );
  }
}
