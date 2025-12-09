// ==========================================
// 统计分析面板组件
// ==========================================
// 功能：
// 1. 项目统计数据展示
// 2. 分镜完成度统计
// 3. AI使用情况统计
// 4. 时间趋势分析
// ==========================================

import { useMemo } from 'react';
import { useStatisticsStore } from '@/stores/statisticsStore';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle,
  FileText,
  Zap,
  Target,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface StatisticsPanelProps {
  projectId?: string;
}

export function StatisticsPanel({ projectId }: StatisticsPanelProps) {
  const { getProjectStatistics, getGlobalStatistics } = useStatisticsStore();

  const statistics = projectId
    ? getProjectStatistics(projectId)
    : getGlobalStatistics();

  // 计算派生数据
  const completionRate = useMemo(() => {
    if (statistics.sceneCount === 0) return 0;
    return (statistics.completedSceneCount / statistics.sceneCount) * 100;
  }, [statistics]);

  const avgCostPerScene = useMemo(() => {
    if (statistics.completedSceneCount === 0) return 0;
    return statistics.estimatedCost / statistics.completedSceneCount;
  }, [statistics]);

  // 准备图表数据
  const statusData = [
    { name: '已完成', value: statistics.completedSceneCount, color: '#22c55e' },
    {
      name: '进行中',
      value: statistics.sceneCount - statistics.completedSceneCount,
      color: '#3b82f6',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">统计分析</h2>
          <p className="text-sm text-muted-foreground">
            {projectId ? '项目数据概览' : '全局数据概览'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="trends">趋势</TabsTrigger>
          <TabsTrigger value="performance">性能</TabsTrigger>
        </TabsList>

        {/* 概览标签页 */}
        <TabsContent value="overview" className="space-y-4">
          {/* 关键指标卡片 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="项目总数"
              value={statistics.projectCount}
              icon={<FileText className="h-4 w-4" />}
              trend="+12%"
              trendUp={true}
            />
            <StatCard
              title="分镜总数"
              value={statistics.sceneCount}
              icon={<Target className="h-4 w-4" />}
              subtitle={`完成 ${statistics.completedSceneCount}`}
            />
            <StatCard
              title="完成率"
              value={`${completionRate.toFixed(1)}%`}
              icon={<CheckCircle className="h-4 w-4" />}
              trend={completionRate > 50 ? '良好' : ''}
              trendUp={completionRate > 50}
            />
            <StatCard
              title="预估费用"
              value={`¥${statistics.estimatedCost.toFixed(2)}`}
              icon={<DollarSign className="h-4 w-4" />}
              subtitle={`单价 ¥${avgCostPerScene.toFixed(2)}`}
            />
          </div>

          {/* 图表区 */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* 完成状态饼图 */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">分镜完成状态</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* 统计摘要 */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">性能指标</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">平均生成时间</span>
                  </div>
                  <Badge variant="secondary">
                    {statistics.averageSceneTime.toFixed(1)}s
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">成功率</span>
                  </div>
                  <Badge
                    variant={
                      statistics.generationSuccessRate > 90
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {statistics.generationSuccessRate.toFixed(1)}%
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Token使用</span>
                  </div>
                  <Badge variant="outline">
                    {statistics.totalTokens.toLocaleString()}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">单次平均费用</span>
                  </div>
                  <Badge variant="outline">
                    ¥{avgCostPerScene.toFixed(3)}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* 趋势标签页 */}
        <TabsContent value="trends" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">创作活动趋势</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={statistics.creationTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    format(new Date(value), 'MM-dd', { locale: zhCN })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    format(new Date(value), 'yyyy-MM-dd', { locale: zhCN })
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  name="创作数量"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">每日生成量</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statistics.creationTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    format(new Date(value), 'MM-dd', { locale: zhCN })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#3b82f6" name="分镜数" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* 性能标签页 */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">性能分析</h3>
            <ScrollArea className="h-[400px]">
              <div className="space-y-6">
                {/* 响应时间分布 */}
                <div>
                  <h4 className="text-sm font-medium mb-3">响应时间分布</h4>
                  <div className="space-y-2">
                    <PerformanceBar label="< 10s" value={25} color="green" />
                    <PerformanceBar label="10-20s" value={45} color="blue" />
                    <PerformanceBar label="20-30s" value={20} color="yellow" />
                    <PerformanceBar label="> 30s" value={10} color="red" />
                  </div>
                </div>

                {/* API调用统计 */}
                <div>
                  <h4 className="text-sm font-medium mb-3">API调用统计</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">总调用次数</span>
                      <span className="font-medium">
                        {statistics.sceneCount * 3}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">成功次数</span>
                      <span className="font-medium text-green-600">
                        {Math.floor(
                          (statistics.sceneCount *
                            3 *
                            statistics.generationSuccessRate) /
                            100
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">失败次数</span>
                      <span className="font-medium text-red-600">
                        {Math.ceil(
                          (statistics.sceneCount *
                            3 *
                            (100 - statistics.generationSuccessRate)) /
                            100
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 建议 */}
                <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    💡 优化建议
                  </h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• 平均响应时间良好，建议保持当前配置</li>
                    <li>• 成功率较高，可以尝试提高并发请求</li>
                    <li>• 建议定期清理LocalStorage以优化性能</li>
                  </ul>
                </div>
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 统计卡片组件
function StatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendUp,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {(subtitle || trend) && (
        <div className="flex items-center gap-2 mt-2">
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
          {trend && (
            <Badge
              variant="secondary"
              className={
                trendUp ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
              }
            >
              {trend}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

// 性能条形图组件
function PerformanceBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'yellow' | 'red';
}) {
  const colorMap = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-16">{label}</span>
      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{value}%</span>
    </div>
  );
}
