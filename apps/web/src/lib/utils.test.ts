import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

// ==========================================
// cn 函数基本测试
// ==========================================

describe('cn 函数', () => {
  describe('基本功能', () => {
    it('应正确合并单个类名', () => {
      expect(cn('class1')).toBe('class1');
    });

    it('应正确合并多个类名', () => {
      const result = cn('class1', 'class2', 'class3');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('应处理空字符串', () => {
      expect(cn('')).toBe('');
    });

    it('应处理 undefined', () => {
      expect(cn(undefined)).toBe('');
    });

    it('应处理 null', () => {
      expect(cn(null)).toBe('');
    });

    it('应处理 false', () => {
      expect(cn(false)).toBe('');
    });

    it('应处理混合的假值', () => {
      expect(cn('valid', undefined, null, false, '')).toBe('valid');
    });
  });

  describe('条件类名', () => {
    it('应支持对象形式的条件类名', () => {
      expect(cn({ class1: true, class2: false })).toBe('class1');
    });

    it('应支持多个条件类名', () => {
      const result = cn({
        active: true,
        disabled: false,
        primary: true,
      });
      expect(result).toContain('active');
      expect(result).toContain('primary');
      expect(result).not.toContain('disabled');
    });

    it('应支持混合字符串和对象', () => {
      const result = cn('base', { active: true, hidden: false });
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('hidden');
    });
  });

  describe('数组形式', () => {
    it('应支持数组形式的类名', () => {
      const result = cn(['class1', 'class2']);
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('应支持嵌套数组', () => {
      const result = cn(['class1', ['class2', 'class3']]);
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('应支持数组中的条件对象', () => {
      const result = cn(['base', { active: true }]);
      expect(result).toContain('base');
      expect(result).toContain('active');
    });
  });

  describe('Tailwind 类名合并', () => {
    it('应合并冲突的 Tailwind 类', () => {
      const result = cn('px-2', 'px-4');
      expect(result).toBe('px-4');
    });

    it('应合并冲突的 padding 类', () => {
      const result = cn('p-2', 'p-4');
      expect(result).toBe('p-4');
    });

    it('应合并冲突的 margin 类', () => {
      const result = cn('m-2', 'm-4');
      expect(result).toBe('m-4');
    });

    it('应合并冲突的 text 颜色类', () => {
      const result = cn('text-red-500', 'text-blue-500');
      expect(result).toBe('text-blue-500');
    });

    it('应合并冲突的 bg 颜色类', () => {
      const result = cn('bg-red-500', 'bg-blue-500');
      expect(result).toBe('bg-blue-500');
    });

    it('应保留不冲突的 Tailwind 类', () => {
      const result = cn('px-2', 'py-4', 'text-sm');
      expect(result).toContain('px-2');
      expect(result).toContain('py-4');
      expect(result).toContain('text-sm');
    });

    it('应合并冲突的 flex 类', () => {
      const result = cn('flex-row', 'flex-col');
      expect(result).toBe('flex-col');
    });

    it('应合并冲突的 width 类', () => {
      const result = cn('w-10', 'w-20');
      expect(result).toBe('w-20');
    });

    it('应合并冲突的 height 类', () => {
      const result = cn('h-10', 'h-20');
      expect(result).toBe('h-20');
    });
  });

  describe('边界情况', () => {
    it('应处理空调用', () => {
      expect(cn()).toBe('');
    });

    it('应处理只有假值的调用', () => {
      expect(cn(undefined, null, false, '')).toBe('');
    });

    it('应处理包含空格的类名', () => {
      expect(cn('class1 class2')).toBe('class1 class2');
    });

    it('应处理重复的类名', () => {
      const result = cn('class1', 'class1');
      // tailwind-merge 不会去重普通类名，只会合并冲突的 Tailwind 类
      expect(result).toContain('class1');
    });

    it('应处理数字值', () => {
      // clsx 会忽略 0 但会将其他数字转换为字符串
      expect(cn(0)).toBe('');
      expect(cn(1)).toBe('1');
    });

    it('应处理非常长的类名列表', () => {
      const classes = Array.from({ length: 100 }, (_, i) => `class${i}`);
      const result = cn(...classes);
      expect(result).toContain('class0');
      expect(result).toContain('class99');
    });

    it('应处理特殊字符类名', () => {
      expect(cn('hover:bg-red-500')).toBe('hover:bg-red-500');
      expect(cn('focus:ring-2')).toBe('focus:ring-2');
      expect(cn('md:flex')).toBe('md:flex');
    });

    it('应处理响应式类名合并', () => {
      const result = cn('md:px-2', 'md:px-4');
      expect(result).toBe('md:px-4');
    });

    it('应处理状态类名合并', () => {
      const result = cn('hover:bg-red-500', 'hover:bg-blue-500');
      expect(result).toBe('hover:bg-blue-500');
    });

    it('应处理暗色模式类名', () => {
      expect(cn('dark:bg-slate-900')).toBe('dark:bg-slate-900');
    });

    it('应处理组合变体类名', () => {
      const result = cn('md:hover:bg-red-500', 'md:hover:bg-blue-500');
      expect(result).toBe('md:hover:bg-blue-500');
    });
  });

  describe('实际使用场景', () => {
    it('应支持按钮变体场景', () => {
      const baseStyles = 'px-4 py-2 rounded-md font-medium';
      const variantStyles = 'bg-blue-500 text-white hover:bg-blue-600';
      const sizeStyles = 'text-sm';
      const disabledStyles = { 'opacity-50 cursor-not-allowed': false };

      const result = cn(baseStyles, variantStyles, sizeStyles, disabledStyles);

      expect(result).toContain('px-4');
      expect(result).toContain('py-2');
      expect(result).toContain('rounded-md');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-sm');
      expect(result).not.toContain('opacity-50');
    });

    it('应支持卡片组件场景', () => {
      const result = cn(
        'rounded-lg shadow-md',
        'p-6',
        { 'border border-red-500': false, 'border border-gray-200': true }
      );

      expect(result).toContain('rounded-lg');
      expect(result).toContain('shadow-md');
      expect(result).toContain('p-6');
      expect(result).toContain('border-gray-200');
      expect(result).not.toContain('border-red-500');
    });

    it('应支持动态类名覆盖场景', () => {
      const defaultClasses = 'text-gray-900 bg-white';
      const overrideClasses = 'text-white bg-blue-500';

      const result = cn(defaultClasses, overrideClasses);

      expect(result).toContain('text-white');
      expect(result).toContain('bg-blue-500');
      expect(result).not.toContain('text-gray-900');
      expect(result).not.toContain('bg-white');
    });

    it('应支持条件渲染场景', () => {
      const isActive = true;
      const isDisabled = false;
      const isLoading = false;

      const result = cn(
        'base-class',
        isActive && 'active-class',
        isDisabled && 'disabled-class',
        isLoading && 'loading-class'
      );

      expect(result).toContain('base-class');
      expect(result).toContain('active-class');
      expect(result).not.toContain('disabled-class');
      expect(result).not.toContain('loading-class');
    });

    it('应支持复杂组件场景', () => {
      const variant = 'primary';
      const size = 'lg';

      const variants: Record<string, string> = {
        primary: 'bg-blue-500 text-white',
        secondary: 'bg-gray-500 text-white',
      };

      const sizes: Record<string, string> = {
        sm: 'px-2 py-1 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      };

      const result = cn('rounded-md', variants[variant], sizes[size]);

      expect(result).toContain('rounded-md');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-lg');
      expect(result).toContain('px-6');
    });
  });
});
