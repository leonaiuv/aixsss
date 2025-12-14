import { create } from 'zustand';
import { Statistics, Project, Scene } from '@/types';
import { format, subDays } from 'date-fns';

interface StatisticsStore {
  statistics: Statistics | null;
  dateRange: {
    start: string;
    end: string;
  };
  
  // 操作方法
  calculate: (projects: Project[], scenesMap: Record<string, Scene[]>) => void;
  setDateRange: (start: string, end: string) => void;
  getProjectStatistics: (projectId: string) => Statistics;
  getGlobalStatistics: () => Statistics;
}

export const useStatisticsStore = create<StatisticsStore>((set, get) => ({
  statistics: null,
  dateRange: {
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  },
  
  calculate: (projects: Project[], scenesMap: Record<string, Scene[]>) => {
    const { dateRange } = get();
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    // 过滤日期范围内的项目
    const filteredProjects = projects.filter(p => {
      const createdAt = new Date(p.createdAt);
      return createdAt >= startDate && createdAt <= endDate;
    });
    
    // 计算总分镜数和完成数
    let totalScenes = 0;
    let completedScenes = 0;
    
    filteredProjects.forEach(project => {
      const scenes = scenesMap[project.id] || [];
      totalScenes += scenes.length;
      completedScenes += scenes.filter(s => s.status === 'completed').length;
    });
    
    // 估算Token消耗（简化计算）
    const estimatedTokens = completedScenes * 2000; // 每个完成的分镜约2000 tokens
    
    // 估算成本（假设每1M tokens = $0.002）
    const estimatedCost = (estimatedTokens / 1000000) * 0.002;
    
    // 计算平均分镜完成时间（简化为30分钟）
    const averageSceneTime = 30 * 60; // 秒
    
    // 计算生成成功率（简化为95%）
    const generationSuccessRate = 95;
    
    // 生成创作时间数据（最近7天）
    const creationTimeData = [];
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      const count = filteredProjects.filter(p =>
        format(new Date(p.createdAt), 'yyyy-MM-dd') === date
      ).length;
      creationTimeData.push({ date, count });
    }
    
    const statistics: Statistics = {
      projectCount: filteredProjects.length,
      sceneCount: totalScenes,
      completedSceneCount: completedScenes,
      totalTokens: estimatedTokens,
      estimatedCost,
      averageSceneTime,
      generationSuccessRate,
      creationTimeData,
    };
    
    set({ statistics });
  },
  
  setDateRange: (start: string, end: string) => {
    set({ dateRange: { start, end } });
  },
  
  getProjectStatistics: (_projectId: string): Statistics => {
    // 返回默认统计数据
    return get().statistics || {
      projectCount: 1,
      sceneCount: 0,
      completedSceneCount: 0,
      totalTokens: 0,
      estimatedCost: 0,
      averageSceneTime: 0,
      generationSuccessRate: 95,
      creationTimeData: [],
    };
  },
  
  getGlobalStatistics: (): Statistics => {
    return get().statistics || {
      projectCount: 0,
      sceneCount: 0,
      completedSceneCount: 0,
      totalTokens: 0,
      estimatedCost: 0,
      averageSceneTime: 0,
      generationSuccessRate: 95,
      creationTimeData: [],
    };
  },
}));
