import type { EmotionArcPoint } from '@/types';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function EmotionArcChart(props: { points: EmotionArcPoint[]; height?: number }) {
  const { points, height = 260 } = props;

  if (!points.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        暂无情绪弧线数据。
      </div>
    );
  }

  const data = points.map((point, index) => ({
    index: index + 1,
    beat: point.beat,
    value: point.value,
    note: point.note ?? '',
  }));

  return (
    <div className="rounded-lg border bg-card p-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="beat" interval={0} tick={{ fontSize: 12 }} />
          <YAxis domain={[-10, 10]} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => [`${value}`, '情绪值']}
            labelFormatter={(label) => `节点：${label}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
