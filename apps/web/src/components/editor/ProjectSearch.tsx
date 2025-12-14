// ==========================================
// 项目搜索和过滤组件
// ==========================================
// 功能：
// 1. 全文搜索
// 2. 高级过滤（状态、日期、标签）
// 3. 排序
// 4. 搜索历史
// ==========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { Project } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getWorkflowStateLabel } from '@/lib/workflowLabels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, X, Clock, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ProjectSearchProps {
  projects: Project[];
  onSelect?: (project: Project) => void;
}

export function ProjectSearch({ projects, onSelect }: ProjectSearchProps) {
  const { addSearchHistory, getSearchHistory, clearSearchHistory } = useSearchStore();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const searchHistory = getSearchHistory();

  // 执行搜索和过滤
  const filteredProjects = useMemo(() => {
    let results = [...projects];

    // 文本搜索
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(
        (project) =>
          project.title.toLowerCase().includes(lowerQuery) ||
          project.summary.toLowerCase().includes(lowerQuery) ||
          project.style.toLowerCase().includes(lowerQuery) ||
          project.protagonist.toLowerCase().includes(lowerQuery),
      );
    }

    // 状态过滤
    if (statusFilter.length > 0) {
      results = results.filter((project) => statusFilter.includes(project.workflowState));
    }

    // 排序
    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'name':
          comparison = a.title.localeCompare(b.title, 'zh-CN');
          break;
        case 'status':
          comparison = a.workflowState.localeCompare(b.workflowState);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return results;
  }, [projects, query, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, statusFilter, sortBy, sortOrder]);

  const handleSearch = (value: string) => {
    setQuery(value);
  };

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
    setShowHistory(false);
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter([]);
    setSortBy('date');
    setSortOrder('desc');
  };

  const hasActiveFilters = query || statusFilter.length > 0;

  const selectProject = (project: Project) => {
    if (query.trim()) {
      addSearchHistory(query.trim());
    }
    onSelect?.(project);
  };

  return (
    <div className="space-y-4">
      {/* 搜索栏 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            placeholder="搜索项目名称、剧情、风格..."
            className="pl-10 pr-10"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIndex((i) => Math.min(i + 1, Math.max(0, filteredProjects.length - 1)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === 'Enter') {
                if (filteredProjects.length === 0) return;
                e.preventDefault();
                const project = filteredProjects[highlightIndex];
                if (project) selectProject(project);
              }
            }}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* 搜索历史下拉 */}
          {showHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50">
              <ScrollArea className="max-h-60">
                <div className="p-2">
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      搜索历史
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={clearSearchHistory}
                    >
                      清除
                    </Button>
                  </div>
                  <Separator className="mb-2" />
                  {searchHistory.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded"
                      onClick={() => handleHistoryClick(item.query)}
                    >
                      {item.query}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* 高级过滤 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              过滤
              {statusFilter.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {statusFilter.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-3">状态筛选</h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'IDLE', label: '空闲' },
                    { value: 'DATA_COLLECTING', label: '收集数据' },
                    { value: 'SCENE_LIST_GENERATING', label: '生成分镜列表' },
                    { value: 'SCENE_PROCESSING', label: '处理分镜' },
                    { value: 'ALL_SCENES_COMPLETE', label: '全部完成' },
                  ].map((status) => (
                    <Badge
                      key={status.value}
                      variant={statusFilter.includes(status.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleStatusFilter(status.value)}
                    >
                      {status.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-3">排序</h4>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">更新时间</SelectItem>
                        <SelectItem value="name">项目名称</SelectItem>
                        <SelectItem value="status">工作流状态</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asc">升序</SelectItem>
                        <SelectItem value="desc">降序</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 清除按钮 */}
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="h-4 w-4 mr-2" />
            清除
          </Button>
        )}
      </div>

      {/* 结果统计 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          找到 <span className="font-semibold">{filteredProjects.length}</span> 个项目
          {projects.length !== filteredProjects.length && ` (共 ${projects.length} 个)`}
        </span>

        {statusFilter.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">筛选:</span>
            {statusFilter.map((status) => (
              <Badge
                key={status}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggleStatusFilter(status)}
              >
                {status}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* 结果列表 */}
      <ScrollArea className="max-h-[360px] pr-2">
        {filteredProjects.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">没有找到匹配的项目</div>
        ) : (
          <div className="space-y-2">
            {filteredProjects.slice(0, 50).map((project, index) => (
              <button
                key={project.id}
                type="button"
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  index === highlightIndex ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                }`}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => selectProject(project)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{project.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {project.summary || '暂无描述'}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    <span title={project.workflowState}>
                      {getWorkflowStateLabel(project.workflowState)}
                    </span>
                  </Badge>
                </div>
              </button>
            ))}
            {filteredProjects.length > 50 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                仅显示前 50 条结果
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
