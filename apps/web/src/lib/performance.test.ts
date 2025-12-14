/**
 * 性能优化工具库测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  debounce,
  throttle,
  SimpleCache,
  BatchQueue,
  perfMarker,
  trackRender,
  getRenderCounts,
  resetRenderCounts,
} from './performance';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应延迟执行函数', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应合并多次调用', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应传递正确的参数', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('应在每次调用后重置定时器', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn(); // 重置定时器
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应立即执行第一次调用', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应在节流期间忽略调用', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    throttledFn();
    throttledFn();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应在节流结束后执行最后一次调用', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn('first');
    throttledFn('second');
    throttledFn('last');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('last');
  });
});

describe('SimpleCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应存储和获取值', () => {
    const cache = new SimpleCache<string, number>();
    cache.set('key', 42);
    expect(cache.get('key')).toBe(42);
  });

  it('应返回 undefined 对于不存在的键', () => {
    const cache = new SimpleCache<string, number>();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('应正确检查键是否存在', () => {
    const cache = new SimpleCache<string, number>();
    cache.set('key', 42);
    expect(cache.has('key')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('应删除键', () => {
    const cache = new SimpleCache<string, number>();
    cache.set('key', 42);
    cache.delete('key');
    expect(cache.has('key')).toBe(false);
  });

  it('应清空缓存', () => {
    const cache = new SimpleCache<string, number>();
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.clear();
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
  });

  it('应在 TTL 后过期', () => {
    const cache = new SimpleCache<string, number>(100, 100);
    cache.set('key', 42);

    expect(cache.get('key')).toBe(42);

    vi.advanceTimersByTime(101);
    expect(cache.get('key')).toBeUndefined();
  });

  it('应限制最大大小', () => {
    const cache = new SimpleCache<string, number>(3, 60000);
    cache.set('key1', 1);
    cache.set('key2', 2);
    cache.set('key3', 3);
    cache.set('key4', 4); // 应该触发清理

    // 至少应该有最新的项
    expect(cache.has('key4')).toBe(true);
  });
});

describe('BatchQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应在延迟后批量处理项目', () => {
    const processor = vi.fn();
    const queue = new BatchQueue<number>(processor, 100);

    queue.add(1);
    queue.add(2);
    queue.add(3);

    expect(processor).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(processor).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('应在达到最大大小时立即处理', () => {
    const processor = vi.fn();
    const queue = new BatchQueue<number>(processor, 1000, 3);

    queue.add(1);
    queue.add(2);
    queue.add(3); // 达到 maxSize

    expect(processor).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('应支持手动刷新', () => {
    const processor = vi.fn();
    const queue = new BatchQueue<number>(processor, 1000);

    queue.add(1);
    queue.add(2);
    queue.flush();

    expect(processor).toHaveBeenCalledWith([1, 2]);
  });

  it('应支持清空队列', () => {
    const processor = vi.fn();
    const queue = new BatchQueue<number>(processor, 100);

    queue.add(1);
    queue.add(2);
    queue.clear();

    vi.advanceTimersByTime(100);
    expect(processor).not.toHaveBeenCalled();
  });

  it('空队列刷新不应调用处理器', () => {
    const processor = vi.fn();
    const queue = new BatchQueue<number>(processor, 100);

    queue.flush();
    expect(processor).not.toHaveBeenCalled();
  });
});

describe('perfMarker', () => {
  it('应创建性能标记', () => {
    // 在非生产环境下应该正常工作
    expect(() => {
      perfMarker.start('test');
      perfMarker.end('test');
    }).not.toThrow();
  });
});

describe('trackRender', () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  it('应追踪组件渲染次数', () => {
    trackRender('TestComponent');
    trackRender('TestComponent');
    trackRender('TestComponent');

    const counts = getRenderCounts();
    expect(counts.get('TestComponent')).toBe(3);
  });

  it('应支持重置计数', () => {
    trackRender('TestComponent');
    resetRenderCounts();

    const counts = getRenderCounts();
    expect(counts.get('TestComponent')).toBeUndefined();
  });
});
