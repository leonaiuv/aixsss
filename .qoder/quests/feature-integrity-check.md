# 漫剧创作助手功能完整性排查设计文档

## 文档概述

### 背景
根据项目文档(FEATURES.md、IMPLEMENTATION_SUMMARY.md、FINAL_REPORT.md)显示,项目已开发27个核心功能模块,但部分新增功能模块尚未集成到主应用界面中,导致功能无法被用户访问和使用。需要全面排查功能完整性,识别未联调功能,并规划集成方案。

### 目标
1. 识别所有已开发但未集成到主界面的功能模块
2. 评估每个功能的集成优先级和技术可行性
3. 设计集成方案,确保用户能够访问所有已开发功能
4. 规划测试验证策略,保证集成后的功能可用性

### 范围
- 涵盖27个核心功能模块的集成状态检查
- 包括8个完善功能和19个新增功能
- 聚焦于UI组件集成、状态管理联调、用户交互流程

---

## 功能集成状态分析

### 核心工作流功能(已集成 ✅)

这些功能已完整集成到Editor.tsx主流程中:

| 功能模块 | 集成位置 | 状态 | 说明 |
|---------|---------|------|------|
| 基础设定 | Editor.tsx → BasicSettings.tsx | ✅ 已集成 | 剧本梗概、画风选择、主角描述 |
| 分镜生成 | Editor.tsx → SceneGeneration.tsx | ✅ 已集成 | AI生成分镜列表、手动编辑 |
| 分镜细化 | Editor.tsx → SceneRefinement.tsx | ✅ 已集成 | 三阶段生成(场景/动作/提示词) |
| 提示词导出 | Editor.tsx → PromptExport.tsx | ✅ 已集成 | 多格式导出(JSON/Markdown/TXT) |
| 项目管理 | App.tsx → ProjectList.tsx | ✅ 已集成 | 创建、打开、删除项目 |
| API配置 | App.tsx → ConfigDialog.tsx | ✅ 已集成 | 多供应商支持、加密存储 |

**集成方式**: 通过Editor.tsx的步骤导航系统,与工作流状态(workflowState)紧密绑定

---

### 后台功能模块(已实现但无UI ⚠️)

这些功能已开发完成并有测试覆盖,但缺少独立的UI入口:

#### 1. 上下文压缩机制
- **文件**: `src/lib/ai/contextCompressor.ts`
- **状态**: ⚠️ 后台运行,无独立UI
- **当前使用**: 在AI调用时自动应用,用户无感知
- **集成建议**: 
  - 优先级: 低
  - 在AI参数调优面板中增加压缩策略选择(aggressive/balanced/conservative)
  - 显示Token消耗对比数据

#### 2. 级联更新策略
- **文件**: `src/lib/ai/cascadeUpdater.ts`
- **状态**: ⚠️ 已实现但未主动使用
- **当前使用**: 未在界面中触发
- **集成建议**:
  - 优先级: 高
  - 在基础设定修改时,显示受影响分镜预警
  - 提供批量更新选项(类似BatchOperations)
  - 集成位置: BasicSettings.tsx保存时弹窗提示

#### 3. 流式响应处理
- **文件**: `src/lib/ai/streamingHandler.ts`
- **状态**: ⚠️ 已开发但未替换现有chat调用
- **当前使用**: SceneRefinement.tsx仍使用同步chat方法
- **集成建议**:
  - 优先级: 中
  - 替换所有AI调用为流式响应
  - 显示实时生成进度(打字机效果)
  - 支持中断生成操作

---

### 新增功能模块(未集成 ❌)

以下9个已开发的新功能模块未集成到主界面:

#### 高优先级(核心功能增强)

##### 1. 世界观构建模块 🌍
- **文件**: 
  - Store: `src/stores/worldViewStore.ts`
  - UI: `src/components/editor/WorldViewBuilder.tsx`
- **状态**: ❌ 完整实现但未集成
- **功能价值**: 为奇幻/科幻题材提供世界观设定支持
- **集成方案**:
  - **位置**: 在Editor.tsx中增加新的标签页"世界观"
  - **时机**: 基础设定完成后,分镜生成前可选填写
  - **交互流程**:
    1. 在Editor左侧步骤导航中添加"世界观"可选步骤
    2. 使用Tabs组件切换"基础设定/世界观/分镜生成"
    3. 世界观要素自动注入到AI生成上下文中
  - **技术要点**:
    - 修改Editor.tsx,添加`<WorldViewBuilder />`组件
    - 在contextCompressor中引用世界观要素
    - 工作流状态无需强制校验(可选功能)

##### 2. 角色管理系统 👥
- **文件**:
  - Store: `src/stores/characterStore.ts`(含测试)
  - UI: `src/components/editor/CharacterManager.tsx`
- **状态**: ❌ 完整实现但未集成
- **功能价值**: 管理多角色设定,确保角色一致性
- **集成方案**:
  - **位置**: 与世界观并列,作为独立标签页
  - **时机**: 基础设定后可选创建角色
  - **交互流程**:
    1. 在Editor中添加"角色"标签页
    2. 角色卡片展示外貌/性格/关系网
    3. 分镜生成时可快速引用已创建角色
  - **技术要点**:
    - 在BasicSettings或SceneRefinement中增加角色引用按钮
    - 角色信息注入到AI提示词模板中
    - 支持角色出场统计

##### 3. 版本历史和撤销功能 ⏮️
- **文件**:
  - Store: `src/stores/versionStore.ts`
  - UI: `src/components/editor/VersionHistory.tsx`
- **状态**: ❌ 完整实现但未集成
- **功能价值**: 防止误操作,支持回滚
- **集成方案**:
  - **位置1**: 在Editor顶部工具栏添加"历史版本"按钮
  - **位置2**: 在项目卡片(ProjectCard)中添加版本历史入口
  - **交互流程**:
    1. 点击按钮弹出Dialog
    2. 展示版本时间线
    3. 支持版本对比和一键恢复
  - **技术要点**:
    - 在项目/分镜修改时自动创建版本快照
    - 使用Dialog组件承载VersionHistory组件
    - 恢复后刷新Editor状态

##### 4. 批量操作模块 ⚡
- **文件**: `src/components/editor/BatchOperations.tsx`
- **状态**: ❌ 已开发但未集成
- **功能价值**: 提升多分镜处理效率
- **集成方案**:
  - **位置**: SceneGeneration.tsx和SceneRefinement.tsx
  - **时机**: 分镜列表页和细化页
  - **交互流程**:
    1. 在SceneGeneration中添加"批量操作"按钮
    2. 弹出Dialog展示BatchOperations组件
    3. 支持批量生成/编辑/删除/导出
  - **技术要点**:
    - 使用Checkbox组件支持多选
    - 批量生成时显示进度条
    - 支持暂停/继续操作

##### 5. 提示词模板系统 📝
- **文件**:
  - Store: `src/stores/templateStore.ts`(含测试)
  - Templates: `src/lib/templates.ts`
  - UI: `src/components/editor/TemplateGallery.tsx`
- **状态**: ❌ 完整实现但未集成
- **功能价值**: 提供专业提示词模板,降低使用门槛
- **集成方案**:
  - **位置**: SceneRefinement.tsx中的提示词编辑区
  - **时机**: 生成镜头提示词时可选应用模板
  - **交互流程**:
    1. 在SceneRefinement添加"使用模板"按钮
    2. 弹出Dialog展示TemplateGallery
    3. 选择模板后自动填充变量
  - **技术要点**:
    - 模板变量替换系统(`{{variable}}`)
    - 分类管理(场景/动作/镜头/风格)
    - 使用统计追踪

#### 中优先级(用户体验增强)

##### 6. 项目搜索和过滤 🔍
- **文件**:
  - Store: `src/stores/searchStore.ts`
  - UI: `src/components/editor/ProjectSearch.tsx`
- **状态**: ❌ 已开发但未集成
- **功能价值**: 快速定位项目和分镜
- **集成方案**:
  - **位置**: ProjectList.tsx顶部工具栏
  - **交互流程**:
    1. 在项目列表添加搜索框
    2. 支持实时搜索和高级过滤
    3. 搜索历史记录
  - **技术要点**:
    - 集成到ProjectList组件
    - 快捷键Ctrl+K触发
    - 多维度过滤(状态/日期/标签)

##### 7. 数据导入导出 📤
- **文件**: `src/components/editor/DataExporter.tsx`
- **状态**: ❌ 已开发但未集成
- **功能价值**: 数据备份和迁移
- **集成方案**:
  - **位置1**: ProjectList工具栏(批量导出)
  - **位置2**: ProjectCard菜单(单项目导出)
  - **位置3**: Editor工具栏(当前项目导出)
  - **交互流程**:
    1. 点击导出按钮弹出Dialog
    2. 选择格式(JSON/Markdown/ZIP)
    3. 配置导出选项
    4. 显示进度并下载
  - **技术要点**:
    - 支持多格式导出
    - 导入时数据校验
    - 冲突处理策略

##### 8. 统计分析面板 📈
- **文件**:
  - Store: `src/stores/statisticsStore.ts`
  - UI: `src/components/editor/StatisticsPanel.tsx`
- **状态**: ❌ 完整实现但未集成
- **功能价值**: 数据可视化,创作效率分析
- **集成方案**:
  - **位置**: Editor中新增"统计"标签页
  - **交互流程**:
    1. 与世界观/角色并列的独立标签页
    2. 展示项目统计和全局统计
    3. 使用recharts图表展示趋势
  - **技术要点**:
    - 实时计算统计数据
    - Token消耗和成本估算
    - 创作活跃度趋势图

##### 9. 主题切换系统 🌗
- **文件**:
  - Store: `src/stores/themeStore.ts`
  - UI: `src/components/ThemeToggle.tsx`
- **状态**: ❌ 已开发但未集成
- **功能价值**: 支持暗色/亮色主题
- **集成方案**:
  - **位置**: App.tsx顶部导航栏
  - **交互流程**:
    1. 在设置按钮旁添加主题切换按钮
    2. 点击切换亮色/暗色/系统
    3. 主题立即生效并持久化
  - **技术要点**:
    - 集成ThemeToggle组件到App.tsx
    - 使用CSS变量支持主题切换
    - 跟随系统主题模式

#### 低优先级(辅助功能)

##### 10. 分镜对比和合并 🔀
- **文件**: `src/components/editor/SceneComparison.tsx`
- **状态**: ❌ 已开发但未集成
- **集成方案**: 在VersionHistory或BatchOperations中作为子功能

##### 11. AI参数调优 🎛️
- **文件**: `src/components/editor/AIParameterTuner.tsx`
- **状态**: ❌ 已开发但未集成
- **集成方案**: 在ConfigDialog中新增"高级设置"标签页

##### 12. 分镜拖拽排序 🖱️
- **文件**: `src/components/editor/SceneSortable.tsx`
- **状态**: ❌ 已开发但未集成
- **集成方案**: 替换SceneGeneration中现有的排序逻辑

---

## 集成架构设计

### 整体架构调整

#### 1. Editor组件扩展方案

当前Editor使用线性步骤流(基础设定→分镜生成→分镜细化→导出),需扩展为Tab式布局以容纳更多功能模块。

**设计方案**:

采用两级导航结构:
- **一级导航**: 保持现有步骤流(主流程)
- **二级导航**: 在步骤内部使用Tabs组件切换辅助功能

```
Editor
├── 主流程步骤导航(左侧,保留)
│   ├── 基础设定 ← 扩展为Tabs
│   │   ├── [Tab] 基本信息
│   │   ├── [Tab] 世界观(可选)
│   │   └── [Tab] 角色管理(可选)
│   ├── 分镜生成
│   ├── 分镜细化 ← 扩展功能按钮
│   │   ├── [按钮] 使用模板
│   │   ├── [按钮] 批量操作
│   │   └── [按钮] 分镜对比
│   └── 提示词导出
├── 顶部工具栏(新增)
│   ├── [按钮] 版本历史
│   ├── [按钮] 统计分析
│   └── [按钮] 导出数据
└── 右侧内容区
    └── 动态渲染当前步骤组件
```

**技术实现**:

修改Editor.tsx结构:
- 在顶部添加工具栏CardHeader
- 基础设定步骤内嵌套Tabs组件
- 分镜细化步骤增加浮动操作按钮
- 使用Dialog承载辅助功能面板

#### 2. App组件增强方案

在顶部导航栏添加全局功能入口:

```
App Header
├── 左侧: Logo + 标题
├── 中间: 项目面包屑(可选)
└── 右侧工具栏
    ├── [按钮] 搜索(Ctrl+K)
    ├── [按钮] 主题切换
    └── [按钮] API配置
```

**技术实现**:
- 在App.tsx的header中添加ThemeToggle组件
- 集成ProjectSearch为全局搜索(Command+K快捷键)
- 使用Dialog弹窗承载搜索界面

#### 3. ProjectList组件增强方案

在项目列表页添加批量操作和搜索功能:

```
ProjectList
├── 顶部操作栏
│   ├── [搜索框] 实时搜索
│   ├── [按钮] 批量导出
│   └── [按钮] 新建项目
└── 项目卡片网格
    └── ProjectCard
        ├── [菜单] 打开
        ├── [菜单] 导出
        ├── [菜单] 版本历史
        └── [菜单] 删除
```

**技术实现**:
- 在ProjectList顶部集成ProjectSearch组件
- 在ProjectCard的DropdownMenu中添加"导出"和"版本历史"选项
- 使用DataExporter处理导出逻辑

---

### 状态管理集成

#### Store联调策略

以下Store已创建但未在组件中使用,需建立数据流连接:

| Store | 当前状态 | 集成方式 |
|-------|---------|---------|
| worldViewStore | 独立运行 | 在AI提示词生成时注入世界观要素 |
| characterStore | 独立运行 | 在分镜细化时引用角色信息 |
| versionStore | 独立运行 | 在项目/分镜修改时自动创建版本快照 |
| templateStore | 独立运行 | 在SceneRefinement中提供模板选择 |
| searchStore | 独立运行 | 在ProjectList中绑定搜索逻辑 |
| statisticsStore | 独立运行 | 监听项目操作事件,实时更新统计数据 |
| themeStore | 独立运行 | 在App根组件初始化时加载主题 |

#### 数据流联调

**世界观与分镜生成联调**:

流程描述:
1. 用户在WorldViewBuilder中创建世界观要素
2. worldViewStore保存要素数据
3. 分镜生成时,contextCompressor读取世界观要素
4. 将要素注入到AI提示词中
5. 生成的分镜自动包含世界观元素

技术要点:
- 修改`contextCompressor.ts`的`buildOptimizedContext`方法
- 从`worldViewStore.getElements(projectId)`获取世界观
- 压缩世界观文本并拼接到系统提示中

**角色与分镜细化联调**:

流程描述:
1. 用户在CharacterManager中创建角色
2. characterStore保存角色档案
3. 分镜细化时显示角色引用按钮
4. 点击按钮弹出角色列表
5. 选择角色后自动填充到提示词中

技术要点:
- 在SceneRefinement添加角色引用UI
- 从`characterStore.getCharacters(projectId)`获取角色列表
- 将角色外貌/性格拼接到场景描述中

**版本管理联调**:

流程描述:
1. 监听projectStore和storyboardStore的修改事件
2. 在updateProject/updateScene时自动触发版本快照
3. versionStore保存差异数据(增量存储)
4. 用户点击"版本历史"查看时间线
5. 恢复版本时更新对应的Store

技术要点:
- 在projectStore.updateProject中调用`versionStore.createVersion`
- 使用immer计算数据差异
- 恢复时调用projectStore/storyboardStore的set方法

---

## 用户交互流程设计

### 扩展后的完整工作流

#### 阶段1: 项目创建与基础设定

```
用户操作流程:
1. [ProjectList] 点击"新建项目" 
   → 弹出Dialog输入项目名称
   → 进入Editor

2. [Editor/基础设定] 切换到"基本信息"Tab
   → 填写剧本梗概
   → 选择画风
   → 描述主角

3. [可选] 切换到"世界观"Tab
   → 创建时代/地理/科技等要素
   → AI辅助生成世界观描述

4. [可选] 切换到"角色管理"Tab
   → 添加主要角色
   → 设置角色关系

5. 点击"确认并生成分镜"
   → 进入分镜生成步骤
```

交互要点:
- 使用Tabs组件切换基本信息/世界观/角色
- 世界观和角色为可选步骤,不阻塞流程
- 保存时自动创建版本快照

#### 阶段2: 分镜生成与编辑

```
用户操作流程:
1. [Editor/分镜生成] 点击"AI生成分镜"
   → AI自动生成8-12个分镜
   → 上下文包含世界观和角色信息

2. [可选] 手动调整分镜
   → 编辑分镜文本
   → 拖拽排序(SceneSortable)
   → 添加/删除分镜

3. [可选] 点击"批量操作"
   → 弹出BatchOperations Dialog
   → 批量编辑/删除

4. 点击"确认分镜列表"
   → 进入分镜细化步骤
```

交互要点:
- 集成SceneSortable支持拖拽排序
- BatchOperations弹窗提供批量能力
- 基础设定修改后显示级联更新提示

#### 阶段3: 分镜细化与模板应用

```
用户操作流程:
1. [Editor/分镜细化] 选择当前分镜
   → 点击"生成场景描述"

2. [可选] 点击"使用模板"
   → 弹出TemplateGallery Dialog
   → 选择场景模板
   → 自动填充变量

3. 生成动作描述和镜头提示词
   → 可手动编辑每个阶段

4. [可选] 点击"引用角色"
   → 弹出角色列表
   → 选择角色后自动填充

5. 完成所有分镜
   → 进入导出步骤
```

交互要点:
- TemplateGallery提供专业模板
- 角色引用快捷按钮
- 流式响应显示生成进度

#### 阶段4: 导出与数据管理

```
用户操作流程:
1. [Editor/提示词导出] 预览所有分镜
   → 选择导出格式
   → 一键复制或下载

2. [可选] 点击顶部"统计分析"
   → 查看Token消耗
   → 查看创作效率

3. [可选] 点击"版本历史"
   → 查看修改记录
   → 对比不同版本
   → 回滚到历史版本

4. [可选] 点击"导出数据"
   → 选择导出范围
   → 打包下载项目
```

交互要点:
- StatisticsPanel提供数据洞察
- VersionHistory支持时间旅行
- DataExporter支持多格式导出

---

### 快捷键与无障碍支持

#### 快捷键扩展

已实现快捷键系统(`useKeyboardShortcut.ts`),需集成到新功能:

| 快捷键 | 功能 | 集成位置 |
|-------|------|---------|
| `Ctrl+K` | 全局搜索 | ProjectList(ProjectSearch) |
| `Ctrl+H` | 版本历史 | Editor工具栏 |
| `Ctrl+T` | 模板库 | SceneRefinement |
| `Ctrl+Shift+E` | 导出数据 | Editor/ProjectList |
| `Ctrl+Shift+S` | 统计面板 | Editor工具栏 |
| `Ctrl+Shift+T` | 主题切换 | 全局 |

技术实现:
- 在各组件中调用`useKeyboardShortcut`
- 在KeyboardShortcuts.tsx中添加快捷键说明
- 确保快捷键不冲突

---

## 技术实施方案

### 分阶段实施计划

#### 第一阶段(核心功能集成)

目标: 集成高优先级核心功能,提升用户体验

| 序号 | 功能模块 | 工作项 | 预估工作量 |
|-----|---------|-------|-----------|
| 1 | 世界观构建 | 修改Editor.tsx,添加Tabs结构,集成WorldViewBuilder | 3小时 |
| 2 | 角色管理 | 在Tabs中添加角色Tab,集成CharacterManager | 2小时 |
| 3 | 版本历史 | 在Editor顶部添加工具栏,集成VersionHistory Dialog | 2小时 |
| 4 | 提示词模板 | 在SceneRefinement添加模板按钮,集成TemplateGallery | 2小时 |
| 5 | 批量操作 | 在SceneGeneration添加批量按钮,集成BatchOperations | 2小时 |
| 6 | 主题切换 | 在App.tsx添加ThemeToggle组件 | 1小时 |

**总计**: 12小时

**交付物**:
- 修改后的Editor.tsx组件
- 修改后的App.tsx组件
- 集成测试报告

#### 第二阶段(数据流联调)

目标: 建立Store之间的数据流连接,确保功能可用

| 序号 | 联调项 | 工作项 | 预估工作量 |
|-----|-------|-------|-----------|
| 1 | 世界观注入 | 修改contextCompressor,读取worldViewStore | 2小时 |
| 2 | 角色引用 | 在SceneRefinement添加角色引用按钮 | 2小时 |
| 3 | 版本自动快照 | 在projectStore/storyboardStore修改时触发 | 2小时 |
| 4 | 统计数据收集 | 在各操作点触发statisticsStore更新 | 3小时 |
| 5 | 级联更新触发 | 在BasicSettings修改时调用cascadeUpdater | 2小时 |

**总计**: 11小时

**交付物**:
- 修改后的contextCompressor.ts
- 修改后的projectStore.ts
- 数据流测试用例

#### 第三阶段(用户体验优化)

目标: 集成中低优先级功能,完善细节

| 序号 | 功能模块 | 工作项 | 预估工作量 |
|-----|---------|-------|-----------|
| 1 | 项目搜索 | 在ProjectList集成ProjectSearch | 2小时 |
| 2 | 数据导出 | 在多处添加导出入口,集成DataExporter | 3小时 |
| 3 | 统计分析 | 在Editor添加统计Tab,集成StatisticsPanel | 2小时 |
| 4 | AI参数调优 | 在ConfigDialog添加高级设置Tab | 2小时 |
| 5 | 分镜拖拽 | 替换SceneGeneration的排序逻辑 | 2小时 |
| 6 | 分镜对比 | 在VersionHistory中集成SceneComparison | 2小时 |
| 7 | 流式响应 | 替换AI调用为streamChat | 3小时 |

**总计**: 16小时

**交付物**:
- 完整功能集成
- 用户手册更新
- 端到端测试报告

---

### 代码修改清单

#### 1. Editor.tsx修改要点

**当前结构**:
```
Editor
└── 左侧步骤导航 + 右侧单一组件渲染
```

**目标结构**:
```
Editor
├── 顶部工具栏(新增)
│   └── 版本历史/统计/导出按钮
├── 左侧步骤导航(保留)
└── 右侧内容区
    ├── 基础设定(修改为Tabs)
    │   ├── Tab: 基本信息
    │   ├── Tab: 世界观
    │   └── Tab: 角色管理
    ├── 分镜生成(增加按钮)
    │   └── 批量操作按钮
    ├── 分镜细化(增加按钮)
    │   ├── 使用模板按钮
    │   └── 引用角色按钮
    └── 提示词导出(保留)
```

关键修改点:
- 在return顶部添加CardHeader工具栏
- 修改BasicSettings为Tabs结构
- 在SceneRefinement添加浮动ActionButton
- 使用Dialog承载辅助功能

#### 2. App.tsx修改要点

**当前结构**:
```
Header
└── Logo + 设置按钮
```

**目标结构**:
```
Header
├── Logo
├── 面包屑(可选)
└── 右侧工具栏
    ├── 搜索按钮
    ├── 主题切换
    └── 设置按钮
```

关键修改点:
- 在header右侧添加ThemeToggle组件
- 添加全局搜索Dialog
- 使用useKeyboardShortcut绑定Ctrl+K

#### 3. BasicSettings.tsx修改要点

**修改策略**: 将单一表单改为Tabs结构

实现要点:
- 保留原有基本信息表单为第一个Tab
- 新增世界观Tab,渲染WorldViewBuilder组件
- 新增角色Tab,渲染CharacterManager组件
- Tab切换不影响数据保存

#### 4. SceneRefinement.tsx修改要点

**修改策略**: 在现有布局中增加功能按钮

实现要点:
- 在生成按钮旁添加"使用模板"按钮
- 在动作描述区添加"引用角色"按钮
- 点击弹出对应Dialog
- 模板/角色数据自动填充到Textarea

#### 5. contextCompressor.ts修改要点

**修改策略**: 扩展上下文构建逻辑,注入世界观和角色

实现要点:
- 修改`buildOptimizedContext`函数签名
- 添加`projectId`参数
- 从worldViewStore和characterStore读取数据
- 压缩世界观和角色信息
- 拼接到返回的上下文中

伪代码示例:
```
function buildOptimizedContext(options, projectId) {
  // 现有逻辑...
  
  // 新增: 获取世界观
  worldView = worldViewStore.getElements(projectId)
  worldViewText = compressWorldView(worldView, strategy)
  
  // 新增: 获取角色
  characters = characterStore.getCharacters(projectId)
  charactersText = compressCharacters(characters, strategy)
  
  // 拼接到上下文
  context += worldViewText + charactersText
  
  return context
}
```

#### 6. projectStore.ts修改要点

**修改策略**: 在修改操作时自动创建版本快照

实现要点:
- 在updateProject方法中调用versionStore
- 保存修改前的数据快照
- 添加版本标签(自动/手动)

伪代码示例:
```
updateProject(id, updates) {
  // 新增: 创建版本快照
  currentProject = projects.find(p => p.id === id)
  versionStore.createVersion(
    projectId: id,
    type: 'project',
    targetId: id,
    snapshot: currentProject,
    label: 'auto',
    notes: '自动保存'
  )
  
  // 现有逻辑: 更新项目
  // ...
}
```

---

### Dialog弹窗统一管理

为避免多个Dialog同时打开导致的z-index问题,采用统一管理策略:

**设计原则**:
- 同一时间最多一个Modal Dialog
- 使用状态机管理Dialog开关
- 提供Dialog优先级机制

**实现方案**:

在Editor中使用状态管理Dialog:
```
状态定义:
- activeDialog: 'none' | 'version' | 'template' | 'batch' | 'statistics' | 'export'

打开Dialog:
setActiveDialog('template')

关闭Dialog:
setActiveDialog('none')

渲染逻辑:
{activeDialog === 'template' && <TemplateGallery />}
{activeDialog === 'version' && <VersionHistory />}
```

优势:
- 避免z-index冲突
- 统一管理弹窗状态
- 便于快捷键控制(ESC关闭)

---

## 测试验证策略

### 集成测试场景

#### 场景1: 世界观与分镜生成联调测试

测试目标: 验证世界观要素是否正确注入到AI提示词中

测试步骤:
1. 创建新项目
2. 填写基础设定(梗概/风格/主角)
3. 切换到"世界观"Tab
4. 创建3个世界观要素(时代/地理/科技)
5. 保存并进入分镜生成
6. 点击"AI生成分镜"
7. 验证: 检查AI请求日志,确认世界观文本在提示词中
8. 验证: 检查生成的分镜是否包含世界观元素

预期结果:
- contextCompressor正确读取worldViewStore数据
- AI提示词包含压缩后的世界观描述
- 生成的分镜体现世界观特征

#### 场景2: 角色引用测试

测试目标: 验证角色管理与分镜细化的联动

测试步骤:
1. 在"角色管理"Tab创建2个角色
2. 进入分镜细化步骤
3. 点击"引用角色"按钮
4. 验证: 弹出角色列表,显示已创建角色
5. 选择角色后点击确认
6. 验证: 角色外貌和性格自动填充到场景描述中
7. 生成动作描述和提示词
8. 验证: 后续生成保留角色特征

预期结果:
- 角色列表正确显示
- 角色信息正确填充
- AI生成内容符合角色设定

#### 场景3: 版本历史与回滚测试

测试目标: 验证版本自动创建和恢复功能

测试步骤:
1. 创建项目并填写基础设定
2. 修改剧本梗概
3. 验证: versionStore自动创建版本快照
4. 生成分镜并编辑第一个分镜
5. 验证: 再次创建版本快照
6. 点击顶部"版本历史"按钮
7. 验证: 显示版本时间线,包含2个版本
8. 选择第一个版本并恢复
9. 验证: 项目回滚到初始状态,分镜消失

预期结果:
- 每次修改自动创建版本
- 版本时间线正确显示
- 恢复功能正常工作

#### 场景4: 模板应用测试

测试目标: 验证提示词模板系统

测试步骤:
1. 进入分镜细化步骤
2. 点击"使用模板"按钮
3. 验证: 弹出TemplateGallery,显示20+内置模板
4. 筛选"场景描述"分类
5. 选择"赛博朋克"模板
6. 验证: 模板内容显示,包含变量占位符
7. 点击"应用"
8. 验证: 变量自动替换为当前项目数据
9. 生成提示词
10. 验证: templateStore的使用次数+1

预期结果:
- 模板库正确加载
- 变量替换准确
- 使用统计正确更新

#### 场景5: 级联更新测试

测试目标: 验证基础设定修改后的影响分析

测试步骤:
1. 创建项目并完成所有分镜细化
2. 返回基础设定步骤
3. 修改画风从"日式动漫"改为"赛博朋克"
4. 点击保存
5. 验证: 弹出级联更新提示Dialog
6. 验证: 显示受影响的分镜列表(场景描述和提示词)
7. 验证: 显示预估更新时间
8. 选择"批量更新"
9. 验证: 逐个重新生成受影响内容
10. 验证: 生成内容符合新画风

预期结果:
- cascadeUpdater正确分析影响
- 提示Dialog显示准确信息
- 批量更新正常执行

---

### 单元测试补充

需要为新集成的组件编写单元测试:

| 测试文件 | 测试重点 | 覆盖率目标 |
|---------|---------|-----------|
| Editor.test.tsx | Tabs切换,Dialog状态管理 | >80% |
| WorldViewBuilder.test.tsx | 要素CRUD,AI生成调用 | >80% |
| CharacterManager.test.tsx | 角色创建,关系管理 | >80% |
| VersionHistory.test.tsx | 版本列表,恢复功能 | >80% |
| TemplateGallery.test.tsx | 模板筛选,变量替换 | >80% |
| BatchOperations.test.tsx | 批量选择,进度控制 | >80% |

测试工具:
- Vitest作为测试运行器
- Testing Library用于组件测试
- MSW模拟AI API调用

---

### 端到端测试用例

使用Playwright或Cypress编写E2E测试:

#### E2E-1: 完整创作流程

测试步骤:
1. 打开应用,点击"新建项目"
2. 填写基础设定
3. 创建世界观和角色
4. 生成分镜列表
5. 使用模板细化分镜
6. 导出提示词
7. 验证导出文件内容

预期结果: 端到端流程无阻塞,数据一致性

#### E2E-2: 多功能联合使用

测试步骤:
1. 创建项目
2. 完成分镜细化
3. 打开统计面板,验证数据
4. 修改基础设定,触发级联更新
5. 查看版本历史,回滚版本
6. 批量导出项目

预期结果: 功能之间无冲突,状态同步正确

---

## 性能与兼容性

### 性能考量

#### 1. LocalStorage容量监控

问题: 新增世界观/角色/版本等数据会增加存储占用

解决方案:
- 使用storageManager的分块存储
- 版本历史限制最多50个快照
- 使用gzip压缩大数据
- 在统计面板显示存储使用情况

实施要点:
- 在StatisticsPanel中调用`getStorageUsage()`
- 超过80%时显示警告
- 提供一键清理功能

#### 2. 大量分镜渲染优化

问题: 批量操作时可能渲染数百个分镜卡片

解决方案:
- 使用虚拟滚动(react-window)
- 分页加载分镜列表
- 懒加载非可视区域组件

实施要点:
- 在SceneGeneration中集成虚拟列表
- 每页显示20个分镜
- 滚动到底部加载更多

#### 3. AI调用并发控制

问题: 批量生成时可能同时发起多个AI请求

解决方案:
- 限制并发数为2-3个
- 使用队列管理请求
- 显示全局进度条

实施要点:
- 在BatchOperations中实现请求队列
- 使用p-limit库控制并发
- 显示"正在处理 3/10"进度

---

### 浏览器兼容性

目标浏览器:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

关键兼容性问题:

#### 1. CSS变量主题切换

问题: 老版本Safari不完全支持CSS变量

解决方案:
- 提供降级方案(固定暗色主题)
- 检测浏览器支持度

#### 2. 拖拽API

问题: 移动端不支持HTML5拖拽

解决方案:
- SceneSortable使用@dnd-kit(支持touch)
- 提供上移/下移按钮作为fallback

#### 3. LocalStorage同步

问题: 多标签页可能导致数据冲突

解决方案:
- 使用storage事件监听变化
- 实现乐观锁机制
- 冲突时提示用户刷新

---

## 风险与缓解

### 技术风险

#### 风险1: 功能集成导致界面复杂度过高

影响: 用户学习成本增加,操作效率降低

缓解措施:
- 渐进式披露原则,高级功能默认隐藏
- 提供新手引导(onboarding tour)
- 快捷键减少点击次数
- 统一的视觉语言和交互模式

#### 风险2: Store数据同步冲突

影响: 版本历史恢复后其他Store状态不一致

缓解措施:
- 恢复版本时同步清空关联Store
- 使用事务机制批量更新
- 增加数据校验和修复逻辑

#### 风险3: AI调用成本激增

影响: 级联更新和批量操作导致API费用增加

缓解措施:
- 级联更新前显示预估费用
- 提供"仅标记需更新"选项,由用户手动触发
- 实现请求去重和缓存
- 在statisticsStore中追踪成本

#### 风险4: 性能下降

影响: 功能增多后应用响应变慢

缓解措施:
- 使用React.lazy懒加载组件
- 虚拟滚动长列表
- 防抖节流用户输入
- 使用Web Worker处理大数据

---

### 用户体验风险

#### 风险1: 功能发现性差

影响: 用户不知道新功能存在

缓解措施:
- 在Editor中显示"新功能"徽章
- 首次使用时显示引导提示
- 提供功能演示视频
- 更新帮助文档

#### 风险2: 学习曲线陡峭

影响: 用户难以理解复杂功能(如级联更新)

缓解措施:
- 提供tooltips解释功能
- 使用图标+文字提升可理解性
- 在Dialog中显示操作说明
- 提供示例项目模板

#### 风险3: 数据丢失恐惧

影响: 用户不敢尝试版本恢复等高风险操作

缓解措施:
- 版本恢复前显示二次确认
- 提供"预览"功能(对比模式)
- 强调版本历史的不可逆性
- 提供导出备份功能

---

## 后续优化方向

### 短期优化(1-2周)

#### 1. 流式响应全面替换

当前状态: streamingHandler已开发但未使用

优化方案:
- 替换所有AI调用为流式API
- 显示实时打字机效果
- 支持中断生成(AbortController)

技术实施:
- 修改SceneRefinement中的所有`client.chat()`调用
- 使用`streamChat()`替代
- 添加"停止生成"按钮

#### 2. 级联更新智能化

当前状态: cascadeUpdater已开发但未主动触发

优化方案:
- 在基础设定修改时自动弹出影响分析
- 提供"智能更新"模式(只更新冲突部分)
- 显示更新前后对比

技术实施:
- 在BasicSettings保存时调用`analyzeProjectSettingsImpact`
- 显示影响分析Dialog
- 提供批量更新和选择性更新选项

#### 3. 快捷键系统完善

当前状态: useKeyboardShortcut已开发,部分功能未绑定

优化方案:
- 为所有主要功能配置快捷键
- 显示快捷键提示面板(Ctrl+/)
- 支持自定义快捷键

技术实施:
- 在KeyboardShortcuts组件中添加新功能
- 使用LocalStorage保存自定义配置
- 冲突检测和提示

---

### 中期优化(1-2月)

#### 1. 协作功能

功能描述:
- 支持多用户协作编辑
- 实时同步分镜修改
- 评论和批注系统

技术方案:
- 使用WebSocket建立实时连接
- 采用CRDT算法解决冲突
- 集成Yjs协作框架

#### 2. 云端同步

功能描述:
- 项目数据云端存储
- 跨设备同步
- 自动备份

技术方案:
- 提供可选的云端后端
- 使用IndexedDB + 云端双层存储
- 增量同步策略

#### 3. 智能推荐

功能描述:
- 基于历史数据推荐画风和模板
- 分镜质量评分
- 优化建议

技术方案:
- 分析用户使用习惯
- 使用简单的机器学习模型
- 提供个性化推荐

---

### 长期规划(3-6月)

#### 1. 图像生成集成

功能描述:
- 直接调用Midjourney/SD API
- 从提示词生成分镜预览图
- 图像编辑和优化

技术方案:
- 集成多个图像生成API
- 显示生成进度和队列
- 图像本地缓存

#### 2. 视频生成

功能描述:
- 基于分镜生成视频动画
- 自动配音和字幕
- 视频编辑和导出

技术方案:
- 集成Runway/Pika等视频生成API
- 使用ffmpeg处理视频
- 提供时间线编辑器

#### 3. 社区分享平台

功能描述:
- 用户上传作品
- 浏览和收藏优秀项目
- 模板交易市场

技术方案:
- 构建社区后端
- 实现作品展示和搜索
- 支持模板买卖和打赏

---

## 总结

### 关键发现

通过全面排查,发现以下关键问题:

1. **功能开发与集成脱节**: 19个新功能模块已完成开发和测试,但未集成到主界面,用户无法访问

2. **文档与实现不一致**: 文档(FEATURES.md)显示功能已完成,但实际使用时发现缺少入口

3. **Store孤岛现象**: 7个新Store已创建,但与现有业务逻辑未联调,导致数据流断裂

4. **后台功能未暴露**: 级联更新、流式响应等后台功能已实现,但用户无法感知和控制

### 核心价值主张

完成本设计方案后,将实现:

1. **功能完整性**: 用户可访问所有27个已开发功能,物尽其用

2. **工作流完整性**: 世界观→角色→分镜→导出形成完整闭环

3. **数据价值最大化**: 版本历史、统计分析让数据产生洞察

4. **用户体验提升**: 模板系统、批量操作大幅提升创作效率

### 实施建议

#### 优先级排序

根据用户价值和开发成本,建议按以下顺序实施:

**第一优先级**(立即实施):
1. 主题切换(1小时,即时价值)
2. 世界观构建(3小时,核心功能)
3. 角色管理(2小时,核心功能)
4. 提示词模板(2小时,高频使用)

**第二优先级**(本周完成):
5. 版本历史(2小时,风险防控)
6. 批量操作(2小时,效率提升)
7. 级联更新联调(2小时,数据一致性)

**第三优先级**(下周完成):
8. 统计分析(2小时,数据洞察)
9. 数据导出(3小时,备份需求)
10. 项目搜索(2小时,大量项目场景)
11. 流式响应(3小时,体验优化)

#### 质量保障

- 每个功能集成后立即编写集成测试
- 每阶段结束后进行端到端测试
- 发布前进行用户验收测试(UAT)
- 收集用户反馈并迭代优化

#### 文档同步

- 更新README.md功能清单
- 更新FEATURES.md集成状态
- 编写用户使用手册
- 录制功能演示视频

---

## 附录

### 附录A: 组件依赖关系图

```
App.tsx
├── imports ThemeToggle (新增)
├── imports ProjectSearch Dialog (新增)
└── imports Editor
    ├── imports VersionHistory Dialog (新增)
    ├── imports StatisticsPanel Dialog (新增)
    └── imports BasicSettings
        ├── imports WorldViewBuilder (新增)
        └── imports CharacterManager (新增)
    └── imports SceneRefinement
        ├── imports TemplateGallery Dialog (新增)
        ├── imports BatchOperations Dialog (新增)
        └── imports SceneComparison Dialog (新增)
```

### 附录B: Store数据流图

```
用户操作
    ↓
projectStore/storyboardStore
    ├→ 触发 versionStore.createVersion (自动快照)
    ├→ 触发 statisticsStore.updateStats (统计更新)
    └→ 触发 cascadeUpdater.analyze (影响分析)

AI生成调用
    ↓
contextCompressor.buildContext
    ├→ 读取 worldViewStore.getElements
    ├→ 读取 characterStore.getCharacters
    └→ 读取 templateStore.getTemplate
    ↓
生成结果
    ↓
更新 storyboardStore
```

### 附录C: 快捷键清单

| 快捷键 | 功能 | 作用域 |
|-------|------|-------|
| `Ctrl+N` | 新建项目 | 全局 |
| `Ctrl+S` | 保存 | Editor |
| `Ctrl+K` | 搜索 | 全局 |
| `Ctrl+H` | 版本历史 | Editor |
| `Ctrl+T` | 模板库 | SceneRefinement |
| `Ctrl+G` | AI生成 | Editor |
| `Ctrl+E` | 导出 | Editor |
| `Ctrl+Z` | 撤销 | Editor |
| `Ctrl+Shift+Z` | 重做 | Editor |
| `Ctrl+Shift+T` | 主题切换 | 全局 |
| `Ctrl+Shift+S` | 统计面板 | Editor |
| `Ctrl+→` | 下一分镜 | SceneRefinement |
| `Ctrl+←` | 上一分镜 | SceneRefinement |
| `Ctrl+/` | 快捷键帮助 | 全局 |
| `Escape` | 关闭Dialog | 全局 |

### 附录D: 测试清单

#### 单元测试(Vitest)
- [ ] Editor.test.tsx - Tabs切换和Dialog管理
- [ ] WorldViewBuilder.test.tsx - 要素CRUD
- [ ] CharacterManager.test.tsx - 角色管理
- [ ] VersionHistory.test.tsx - 版本恢复
- [ ] TemplateGallery.test.tsx - 模板应用
- [ ] BatchOperations.test.tsx - 批量操作
- [ ] contextCompressor.test.ts - 世界观注入(更新现有)
- [ ] cascadeUpdater.test.ts - 影响分析(更新现有)

#### 集成测试
- [ ] 世界观与分镜生成联调
- [ ] 角色引用功能联调
- [ ] 版本自动快照和恢复
- [ ] 模板变量替换
- [ ] 级联更新触发

#### E2E测试(Playwright)
- [ ] 完整创作流程(从创建到导出)
- [ ] 多功能联合使用
- [ ] 版本恢复和回滚
- [ ] 批量操作性能测试

#### 手动测试
- [ ] 跨浏览器兼容性测试
- [ ] 移动端响应式测试
- [ ] 快捷键全覆盖测试
- [ ] LocalStorage容量压测
- [ ] AI调用成本统计验证

---

**设计文档版本**: v1.0  
**创建日期**: 2025-12-09  
**状态**: 待评审  
**预估总工作量**: 39小时(3个阶段)  
**预期交付时间**: 2周内完成所有集成

4. **用户体验提升**: 模板系统、批量操作大幅提升创作效率

### 实施建议

#### 优先级排序

根据用户价值和开发成本,建议按以下顺序实施:

**第一优先级**(立即实施):
1. 主题切换(1小时,即时价值)
2. 世界观构建(3小时,核心功能)
3. 角色管理(2小时,核心功能)
4. 提示词模板(2小时,高频使用)

**第二优先级**(本周完成):
5. 版本历史(2小时,风险防控)
6. 批量操作(2小时,效率提升)
7. 级联更新联调(2小时,数据一致性)

**第三优先级**(下周完成):
8. 统计分析(2小时,数据洞察)
9. 数据导出(3小时,备份需求)
10. 项目搜索(2小时,大量项目场景)
11. 流式响应(3小时,体验优化)

#### 质量保障

- 每个功能集成后立即编写集成测试
- 每阶段结束后进行端到端测试
- 发布前进行用户验收测试(UAT)
- 收集用户反馈并迭代优化

#### 文档同步

- 更新README.md功能清单
- 更新FEATURES.md集成状态
- 编写用户使用手册
- 录制功能演示视频

---

## 附录

### 附录A: 组件依赖关系图

```
App.tsx
├── imports ThemeToggle (新增)
├── imports ProjectSearch Dialog (新增)
└── imports Editor
    ├── imports VersionHistory Dialog (新增)
    ├── imports StatisticsPanel Dialog (新增)
    └── imports BasicSettings
        ├── imports WorldViewBuilder (新增)
        └── imports CharacterManager (新增)
    └── imports SceneRefinement
        ├── imports TemplateGallery Dialog (新增)
        ├── imports BatchOperations Dialog (新增)
        └── imports SceneComparison Dialog (新增)
```

### 附录B: Store数据流图

```
用户操作
    ↓
projectStore/storyboardStore
    ├→ 触发 versionStore.createVersion (自动快照)
    ├→ 触发 statisticsStore.updateStats (统计更新)
    └→ 触发 cascadeUpdater.analyze (影响分析)

AI生成调用
    ↓
contextCompressor.buildContext
    ├→ 读取 worldViewStore.getElements
    ├→ 读取 characterStore.getCharacters
    └→ 读取 templateStore.getTemplate
    ↓
生成结果
    ↓
更新 storyboardStore
```

### 附录C: 快捷键清单

| 快捷键 | 功能 | 作用域 |
|-------|------|-------|
| `Ctrl+N` | 新建项目 | 全局 |
| `Ctrl+S` | 保存 | Editor |
| `Ctrl+K` | 搜索 | 全局 |
| `Ctrl+H` | 版本历史 | Editor |
| `Ctrl+T` | 模板库 | SceneRefinement |
| `Ctrl+G` | AI生成 | Editor |
| `Ctrl+E` | 导出 | Editor |
| `Ctrl+Z` | 撤销 | Editor |
| `Ctrl+Shift+Z` | 重做 | Editor |
| `Ctrl+Shift+T` | 主题切换 | 全局 |
| `Ctrl+Shift+S` | 统计面板 | Editor |
| `Ctrl+→` | 下一分镜 | SceneRefinement |
| `Ctrl+←` | 上一分镜 | SceneRefinement |
| `Ctrl+/` | 快捷键帮助 | 全局 |
| `Escape` | 关闭Dialog | 全局 |

### 附录D: 测试清单

#### 单元测试(Vitest)
- [ ] Editor.test.tsx - Tabs切换和Dialog管理
- [ ] WorldViewBuilder.test.tsx - 要素CRUD
- [ ] CharacterManager.test.tsx - 角色管理
- [ ] VersionHistory.test.tsx - 版本恢复
- [ ] TemplateGallery.test.tsx - 模板应用
- [ ] BatchOperations.test.tsx - 批量操作
- [ ] contextCompressor.test.ts - 世界观注入(更新现有)
- [ ] cascadeUpdater.test.ts - 影响分析(更新现有)

#### 集成测试
- [ ] 世界观与分镜生成联调
- [ ] 角色引用功能联调
- [ ] 版本自动快照和恢复
- [ ] 模板变量替换
- [ ] 级联更新触发

#### E2E测试(Playwright)
- [ ] 完整创作流程(从创建到导出)
- [ ] 多功能联合使用
- [ ] 版本恢复和回滚
- [ ] 批量操作性能测试

#### 手动测试
- [ ] 跨浏览器兼容性测试
- [ ] 移动端响应式测试
- [ ] 快捷键全覆盖测试
- [ ] LocalStorage容量压测
- [ ] AI调用成本统计验证

---

**设计文档版本**: v1.0  
**创建日期**: 2025-12-09  
**状态**: 待评审  
**预估总工作量**: 39小时(3个阶段)  
**预期交付时间**: 2周内完成所有集成
