import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    process.env.ANALYZE
      ? (visualizer({
          filename: 'dist/bundle-report.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
        }) as any)
      : null,
  ].filter(Boolean) as any,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // 本地开发：前端走同源 /api，由 Vite 代理到 NestJS (默认 3001)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // 性能优化配置
  build: {
    // 代码分割策略
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心库
          'react-vendor': ['react', 'react-dom'],
          // UI 组件库 (Radix)
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
          ],
          // 图表库
          'charts': ['recharts'],
          // 拖拽库
          'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // 工具库
          'utils': ['date-fns', 'clsx', 'class-variance-authority', 'immer', 'zustand'],
          // 加密和压缩
          'crypto': ['crypto-js', 'pako'],
        },
      },
    },
    // 压缩选项
    minify: 'esbuild',
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 设置 chunk 大小警告阈值
    chunkSizeWarningLimit: 500,
    // 生成 sourcemap 用于生产调试
    sourcemap: false,
    // 目标浏览器
    target: 'es2020',
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'immer',
      'lucide-react',
      'date-fns',
    ],
  },
  // esbuild 优化
  esbuild: {
    // 移除 console.log (生产环境)
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})
