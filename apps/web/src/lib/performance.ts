/**
 * 性能优化工具库
 * 提供防抖、节流、缓存等通用性能优化工具
 */

/**
 * 防抖函数
 * @param fn 需要防抖的函数
 * @param delay 延迟时间（毫秒）
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * 节流函数
 * @param fn 需要节流的函数
 * @param limit 节流间隔（毫秒）
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

/**
 * 简单的内存缓存
 */
export class SimpleCache<K, V> {
  private cache = new Map<K, { value: V; expiry: number }>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 100, defaultTTL = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, ttl = this.defaultTTL): void {
    // 清理过期项
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    // 如果仍然超过最大大小，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * 批量操作队列
 * 用于合并多个操作减少存储写入
 */
export class BatchQueue<T> {
  private queue: T[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private processor: (items: T[]) => void;
  private delay: number;
  private maxSize: number;

  constructor(processor: (items: T[]) => void, delay = 300, maxSize = 50) {
    this.processor = processor;
    this.delay = delay;
    this.maxSize = maxSize;
  }

  add(item: T): void {
    this.queue.push(item);

    // 达到最大大小立即处理
    if (this.queue.length >= this.maxSize) {
      this.flush();
      return;
    }

    // 重置定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => this.flush(), this.delay);
  }

  flush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.queue.length > 0) {
      const items = [...this.queue];
      this.queue = [];
      this.processor(items);
    }
  }

  clear(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.queue = [];
  }
}

/**
 * 请求空闲回调的 polyfill
 */
export const requestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: IdleRequestCallback) =>
        setTimeout(
          () =>
            cb({
              didTimeout: false,
              timeRemaining: () => 50,
            }),
          1,
        );

export const cancelIdleCallback =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? window.cancelIdleCallback
    : clearTimeout;

/**
 * 延迟执行非关键任务
 */
export function scheduleIdleTask<T>(task: () => T, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    requestIdleCallback(
      () => {
        try {
          resolve(task());
        } catch (error) {
          reject(error);
        }
      },
      { timeout },
    );
  });
}

/**
 * 性能标记工具
 */
export const perfMarker = {
  start(name: string): void {
    if (typeof performance !== 'undefined' && import.meta.env.MODE !== 'production') {
      performance.mark(`${name}-start`);
    }
  },

  end(name: string): number {
    if (typeof performance !== 'undefined' && import.meta.env.MODE !== 'production') {
      performance.mark(`${name}-end`);
      try {
        const measure = performance.measure(name, `${name}-start`, `${name}-end`);
        console.log(`[Perf] ${name}: ${measure.duration.toFixed(2)}ms`);
        return measure.duration;
      } catch {
        return 0;
      }
    }
    return 0;
  },
};

/**
 * 组件渲染计数器（开发环境）
 */
const renderCounts = new Map<string, number>();

export function trackRender(componentName: string): void {
  if (import.meta.env.MODE !== 'production') {
    const count = (renderCounts.get(componentName) || 0) + 1;
    renderCounts.set(componentName, count);

    // 每10次渲染输出一次警告
    if (count % 10 === 0) {
      console.warn(`[Render Warning] ${componentName} has rendered ${count} times`);
    }
  }
}

export function getRenderCounts(): Map<string, number> {
  return new Map(renderCounts);
}

export function resetRenderCounts(): void {
  renderCounts.clear();
}
