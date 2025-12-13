# 漫剧创作助手

> 基于AIGC技术的智能提示词生成工具，帮助创作者将剧本转化为结构化的分镜脚本和AI绘图提示词。

## 📖 项目概述

漫剧创作助手是一个面向AI漫剧/短剧创作者的智能化创作引导系统，通过渐进式引导与智能上下文管理，将创意想法系统化地转化为高质量、连贯的AIGC提示词，确保整部作品的视觉一致性。

## ✨ 核心功能

### ✅ 已实现 (MVP Complete)

- **项目管理工作台** ✅
  - 项目列表展示(卡片式布局)
  - 创建、打开、删除项目
  - 项目进度可视化
  - LocalStorage持久化存储

- **API配置管理** ✅
  - 支持多AI供应商(DeepSeek/Kimi/Gemini/OpenAI兼容)
  - API Key加密存储(AES加密)
  - 连接测试功能
  - 快速切换配置

- **数据架构** ✅
  - 完整的TypeScript类型系统
  - Zustand状态管理(projectStore, configStore, storyboardStore)
  - LocalStorage持久化层(加密、版本迁移)
  - AI适配层(工厂模式、多供应商支持)

- **基础设定模块** ✅
  - 剧本梗概输入(50-300字,智能提示)
  - 风格选择(6种预设风格+自定义描述)
  - 主角描述(20-150字,结构化引导)
  - 实时字数统计与验证

- **分镜生成流程** ✅
  - AI智能拆解剧本为8-12个分镜节点
  - 分镜列表管理(增删改、手动排序)
  - 批量操作(重新生成、一键添加)
  - 实时编辑与保存

- **分镜细化工作流** ✅
  - 四阶段渐进生成(场景锚点→关键帧(KF0/KF1/KF2)→时空/运动→台词)
  - 上下文保持与连贯性(自动引用前一分镜)
  - 单独重新生成或一键生成全部
  - 手动编辑与优化每个阶段内容

- **提示词整合导出** ✅
  - Markdown格式化输出(完整项目信息)
  - JSON格式导出(程序化处理)
  - 纯提示词导出(直接用于AI绘画)
  - 一键复制到剪贴板
  - 批量下载功能
  - 分镜完成度统计

### 🎯 未来规划 (Phase 2+)

- **高级功能**
  - 历史版本管理与回溯
  - 世界观构建模块(场景库、道具库)
  - 角色管理系统(多角色一致性)
  - 批量生成优化(并发处理)

- **用户体验**
  - 拖拽排序分镜
  - 快捷键支持
  - 导出模板自定义
  - 云端同步(可选)

## 🛠️ 技术栈

### 前端框架
- **React 18.3** - UI框架
- **TypeScript 5.6** - 类型系统
- **Vite 5** - 构建工具

### UI组件
- **Shadcn/ui** - 基于Radix UI的组件库
- **Tailwind CSS 3.4** - 原子化CSS框架
- **Lucide React** - 图标库

### 状态管理
- **Zustand 4.5** - 轻量级状态管理

### 数据加密
- **crypto-js 4.2** - AES加密API Key

### AI集成
- 多供应商适配器(工厂模式)
- Agent Skill系统
- 上下文工程策略

## 📦 项目结构

```
manga-creator/
├── src/
│   ├── components/          # React组件
│   │   ├── ui/             # Shadcn UI组件(15+)
│   │   ├── editor/         # 编辑器子模块
│   │   │   ├── BasicSettings.tsx     # 基础设定
│   │   │   ├── SceneGeneration.tsx   # 分镜生成
│   │   │   ├── SceneRefinement.tsx   # 分镜细化
│   │   │   └── PromptExport.tsx      # 提示词导出
│   │   ├── ProjectCard.tsx  # 项目卡片
│   │   ├── ProjectList.tsx  # 项目列表
│   │   ├── ConfigDialog.tsx # API配置弹窗
│   │   └── Editor.tsx       # 编辑器主页(路由)
│   ├── stores/             # Zustand状态管理
│   │   ├── projectStore.ts  # 项目状态
│   │   ├── configStore.ts   # 配置状态
│   │   └── storyboardStore.ts # 分镜状态
│   ├── lib/                # 工具库
│   │   ├── storage.ts      # LocalStorage封装
│   │   ├── utils.ts        # 通用工具
│   │   └── ai/             # AI适配层
│   │       ├── types.ts    # AI类型定义
│   │       ├── factory.ts  # 工厂函数
│   │       ├── skills.ts   # Agent技能定义
│   │       └── providers/  # AI供应商适配器
│   ├── types/              # TypeScript类型定义
│   ├── hooks/              # 自定义Hooks
│   └── App.tsx             # 应用入口
├── tailwind.config.js      # Tailwind配置
├── components.json         # Shadcn配置
└── package.json            # 项目依赖
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173`

### 构建生产版本

```bash
npm run build
```

## 🎨 设计系统

### 色彩系统
- **主色调**: 紫蓝渐变 (#6366F1 → #8B5CF6)
- **背景色**: 深蓝灰 (#0F172A)
- **文字色**: Slate系列

### 设计原则
- **渐进式披露**: 只展示当前步骤所需的最小信息
- **卡片化布局**: Material Design风格
- **响应式设计**: 移动端优先

## 🔐 安全性

- API Key采用AES加密存储在LocalStorage
- 前端不向后端传输API Key明文
- 支持自定义BaseURL,数据不经过第三方服务器

## 📝 开发计划

- [x] Phase 1: 项目基础架构 ✅
- [x] Phase 1: 项目管理工作台 ✅
- [x] Phase 1: API配置管理 ✅
- [x] Phase 2: 基础设定模块 ✅
- [x] Phase 2: 分镜生成流程 ✅
- [x] Phase 3: 分镜细化工作流 ✅
- [x] Phase 3: 提示词导出功能 ✅
- [ ] Phase 4: 世界观构建模块 (未开始)
- [ ] Phase 4: 角色管理系统 (未开始)

**当前状态**: MVP功能已全部完成,可投入使用! 🎉

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request!

---

**Made with ❤️ for AI Creators**
