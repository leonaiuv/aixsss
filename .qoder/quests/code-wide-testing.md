# 全面测试覆盖设计

## 设计目标

构建完善的单元测试体系，确保核心功能、多状态耦合的边界场景、多情况边缘场景的全面覆盖。测试驱动代码健壮性提升，减少bug，而非降低测试标准。

## 测试范围规划

### 优先级分层

#### P0 - 核心功能测试(必须)
- 状态管理层(所有Zustand stores)
- 数据持久化层(localStorage加密存储)
- AI服务工厂与适配器
- 关键业务逻辑(上下文构建、压缩、级联更新)

#### P1 - 边界与异常测试(重要)
- 多状态耦合场景
- 异步操作竞态条件
- 错误降级与容错机制
- 数据迁移与兼容性

#### P2 - 边缘场景测试(应当)
- 用户异常操作模拟
- 性能极限测试
- 内存泄漏检测
- 网络异常恢复

#### P3 - 集成与UI测试(可选)
- 组件交互流程
- 端到端工作流
- 可访问性测试

## 详细测试设计

### 一、状态管理层测试

#### 1.1 projectStore 测试增强

**现有覆盖**: 基本CRUD操作  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| 项目创建时自动生成ID唯一性 | 验证ID生成算法无冲突 | 连续创建1000个项目 |
| 项目更新的乐观锁机制 | 防止并发更新数据丢失 | 同时更新同一项目 |
| 画风配置迁移逻辑 | 旧版style字段正确迁移到artStyleConfig | 所有旧版预设值 |
| 当前项目为null时的操作容错 | 避免空指针错误 | updateProject/deleteProject传入不存在ID |
| localStorage满时的降级处理 | 优雅失败并提示用户 | 模拟存储已满异常 |
| 项目列表为空时的初始化 | 确保UI不崩溃 | 清空所有项目 |
| 工作流状态转换合法性验证 | 防止非法状态跳转 | 从IDLE直接跳到EXPORTING |
| 项目删除后的关联数据清理 | 级联删除分镜、角色、版本 | 删除包含大量数据的项目 |

**测试实现要点**:
- 使用vi.useFakeTimers模拟时间相关逻辑
- 通过setState直接注入边界状态进行测试
- mock localStorage抛出QuotaExceededError
- 验证store内部错误处理逻辑是否记录日志

#### 1.2 storyboardStore 测试增强

**现有覆盖**: 基本分镜CRUD  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| 分镜顺序重排的边界情况 | 确保order字段正确重新编号 | 移动到首位/末位/中间/同位置 |
| 分镜状态转换的原子性 | 状态更新失败时回滚 | 更新过程中模拟存储失败 |
| 并发添加分镜的顺序冲突 | 避免多个分镜占用同一order | 同时添加多个分镜 |
| 删除分镜后的顺序重排 | 删除后自动补齐顺序间隙 | 删除中间分镜 |
| 大批量分镜加载性能 | 验证性能不劣化 | 加载500+分镜 |
| 分镜上下文摘要为空时的处理 | 避免渲染错误 | contextSummary为null/undefined |
| 台词列表的增删改查 | 验证dialogues数组操作正确 | 添加/删除/重排台词 |
| 关键帧与时空提示词的联动更新 | 修改分镜描述时提示重新生成 | 更新sceneDescription后status变化 |

**测试实现要点**:
- 使用immer验证不可变更新
- 通过performance.now()测试性能
- 模拟并发操作使用Promise.all
- 验证saveScenes调用参数正确性

#### 1.3 configStore 测试增强

**现有覆盖**: 基本配置存取、testConnection  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| 加密配置存储的安全性 | 验证apiKey加密后无法直接读取 | 读取localStorage原始值 |
| 配置解密失败的降级 | 损坏数据不导致崩溃 | 手动修改localStorage为非法JSON |
| testConnection超时处理 | 避免无限等待 | mock fetch超时30s |
| 多个供应商的配置切换 | 切换provider时配置不混淆 | deepseek↔kimi↔gemini切换 |
| 配置变更时的store同步 | saveConfig后isConfigured立即更新 | 验证同步更新 |
| 无效model值的提前校验 | 防止向API发送非法请求 | model为空字符串 |

**测试实现要点**:
- 使用crypto-js验证加密解密逻辑
- mock AIFactory.createClient抛出各类错误
- 验证clearConfig后localStorage数据确实删除
- 测试并发loadConfig和saveConfig的竞态条件

#### 1.4 其他store测试补充

**characterStore**:
- 角色色彩(primaryColor/secondaryColor)传递到AI生成
- 角色出场记录(appearances)的增删改
- 角色关系(relationships)的双向同步
- 定妆照提示词(portraitPrompts)的三种格式完整性

**worldViewStore**:
- 按type分组查询的正确性
- 世界观上下文字符串合成逻辑
- 世界观要素顺序调整
- 多选世界观元素注入AI上下文

**themeStore**:
- system模式下跟随系统主题变化
- 快速切换主题时className更新正确
- localStorage持久化与初始化加载
- matchMedia事件监听的正确清理

**templateStore**:
- 模板使用次数(usageCount)正确递增
- 内置模板不可删除的校验
- 模板分类查询和模糊搜索
- 模板变量替换逻辑

**versionStore**:
- 版本快照创建与恢复
- 版本历史超出maxVersions时自动清理
- 版本diff计算正确性
- 按targetId过滤版本历史

**searchStore**:
- 模糊搜索的匹配算法
- 多条件过滤器组合
- 搜索历史的持久化与清理
- 空查询时的处理

**statisticsStore**:
- 统计数据计算的准确性
- 日期范围过滤
- Token消耗统计
- 生成成功率计算

**aiProgressStore**:
- 任务创建、启动、完成、失败的状态转换
- 进度更新的实时性
- 任务取消逻辑
- 错误重试机制
- 事件订阅与取消订阅
- 统计数据刷新

### 二、数据持久化层测试

#### 2.1 storage.ts 测试增强

**现有覆盖**: 基本加密解密、CRUD操作  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| 加密数据版本兼容 | 旧版加密数据可正常解密 | 模拟v1.0加密格式 |
| 存储空间不足的提前检测 | 保存前检查剩余空间 | getStorageUsage接近5MB |
| 数据迁移的幂等性 | 多次迁移不破坏数据 | 连续调用迁移函数 |
| 并发存储操作的数据一致性 | 防止覆盖冲突 | 同时saveProject和saveScene |
| 导出数据的完整性校验 | 导出的JSON可重新导入 | exportData→importData往返 |
| 导入数据的版本校验 | 拒绝不兼容版本的数据 | 导入未来版本数据 |
| 清空数据的确认机制 | clearAllData不可误触发 | 验证需要明确确认 |
| 特殊字符在key中的处理 | 项目ID包含特殊字符 | ID包含/、\、:等 |

**测试实现要点**:
- 创建不同版本的mock数据进行兼容性测试
- 使用Object.defineProperty模拟localStorage.length
- 通过spy验证存储调用顺序
- 测试pako压缩后的数据可正确解压

#### 2.2 storageManager.ts 测试

**需新增测试**:
- 批量操作的事务性(全部成功或全部失败)
- 存储配额监控与告警
- 自动备份机制
- 数据恢复点(checkpoint)创建

### 三、AI服务层测试

#### 3.1 factory.ts 测试增强

**现有覆盖**: 工厂创建、基本chat、stream  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| 不支持provider的明确错误提示 | 用户友好的错误信息 | provider为'claude' |
| 配置参数缺失的详细校验 | 精确指出缺失字段 | 分别缺失provider/apiKey/model |
| baseURL格式验证 | 避免非法URL导致请求失败 | baseURL缺少协议/末尾有多余斜杠 |
| 流式响应中断恢复 | 网络中断后可继续 | 模拟ReadableStream中断 |
| 超大Token响应处理 | 不阻塞主线程 | 模拟10万Token响应 |
| API限流时的自动重试 | 429错误触发exponential backoff | mock连续3次429响应 |
| 响应JSON解析失败容错 | 非法JSON不崩溃 | 返回格式错误的JSON |

**测试实现要点**:
- 使用vi.spyOn(globalThis, 'fetch')精确控制响应
- 测试各provider的错误码映射一致性
- 验证retry逻辑的延迟时间计算
- 测试streamChat的异步迭代器正确性

#### 3.2 providers 测试增强

**deepseek/kimi/gemini/openai适配器**:
- 每个适配器的请求体结构符合官方文档
- 响应解析的容错性(缺失字段、类型错误)
- Token统计的准确性
- 流式与非流式响应的一致性
- 自定义模型参数的透传

#### 3.3 AI辅助模块测试

**contextBuilder.ts**:
- 多上下文类型组合的优先级
- 上下文总长度超限时的截断策略
- 世界观/角色信息的正确注入
- 前后分镜摘要的关联性

**contextCompressor.ts**:
- 三种压缩策略(aggressive/balanced/conservative)的压缩率
- 关键信息不丢失的验证
- 压缩后可读性检查
- 压缩性能测试(1000字符压缩耗时)

**cascadeUpdater.ts**:
- 项目基础信息变更时分镜的级联更新范围
- 角色信息变更时相关分镜的标记
- 画风变更时的全局提示词更新
- 用户手动确认级联更新的流程

**multiModalPrompts.ts**:
- 关键帧提示词的画风注入
- 时空提示词的镜头语言
- 转场指令的生成
- 音频提示词的BGM标注

**worldViewInjection.ts**:
- 分镜生成时注入世界观
- 角色生成时注入世界观
- 世界观变更后的提示重新生成

**skills.ts**:
- 各技能的必需上下文验证
- 输出格式校验(text/json)
- Token限制的遵守
- 提示词模板变量替换

**debugLogger.ts**:
- AI调用日志的完整记录
- 日志导出功能
- 性能统计准确性
- 错误分类与建议

**progressBridge.ts**:
- AI调用与进度面板的事件桥接
- 进度百分比计算正确性
- 任务取消信号传递
- 多任务并发时的进度隔离

#### 3.4 streamingHandler.ts 测试

**需新增测试**:
- 流式响应的分块处理
- SSE格式解析
- 流式中断的优雅处理
- 流式完成的回调触发

### 四、组件层测试

#### 4.1 关键组件测试补充

**Editor.tsx**:
- 工作流状态驱动的步骤切换
- 步骤间数据传递的完整性
- 返回上一步时的状态恢复
- 快捷键响应

**SceneGeneration.tsx**:
- 批量生成分镜的进度展示
- 生成失败时的错误提示与重试
- 生成过程中的取消操作
- 生成结果的自动保存

**SceneRefinement.tsx**:
- 分镜细化的多步骤流程
- 台词编辑的实时保存
- 关键帧预览的加载状态
- 细化完成的确认流程

**CharacterManager.tsx**:
- 角色批量生成定妆照
- 角色色彩选择器
- 角色关系图的渲染
- 角色出场统计

**WorldViewBuilder.tsx**:
- 世界观元素的拖拽排序
- 多选世界观元素
- 世界观注入时机选择
- 世界观预览

**PromptExport.tsx**:
- 多格式导出(MD/JSON/TXT)
- 导出内容的完整性
- 复制到剪贴板
- 下载文件

**DevPanel.tsx**:
- AI任务列表展示
- 任务详情查看
- 日志导出
- 性能统计

#### 4.2 UI组件测试

**所有ui组件**:
- props传递的正确性
- 事件回调的触发
- 可访问性属性(aria-*)
- 键盘导航
- 样式类名应用

#### 4.3 Hooks测试

**useKeyboardShortcut**:
- 单键快捷键
- 组合键快捷键
- 多个快捷键数组
- 快捷键冲突检测
- disabled状态

**useToast**:
- toast添加与移除
- 多个toast的队列管理
- toast超时自动关闭
- 不同variant的渲染

### 五、工具函数测试

#### 5.1 utils.ts 测试增强

**cn函数**:
- 条件类名合并
- falsy值过滤
- Tailwind冲突类名合并

#### 5.2 performance.ts 测试增强

**现有覆盖**: debounce、throttle、SimpleCache、BatchQueue  
**需补充**:

| 测试场景 | 测试目的 | 边界条件 |
|---------|---------|---------|
| debounce的immediate选项 | 首次立即执行 | immediate=true时的行为 |
| throttle的trailing选项 | 节流结束后是否执行 | trailing=false时的最后调用 |
| SimpleCache的LRU淘汰策略 | 缓存容量管理 | 缓存满时的淘汰顺序 |
| BatchQueue的批量执行时机 | 批量大小与延迟控制 | batchSize/delay组合测试 |
| perfMarker的嵌套测量 | 性能标记的层级关系 | 嵌套调用perfMarker |
| trackRender的内存泄漏检测 | 组件卸载后停止追踪 | 大量组件mount/unmount |

**测试实现要点**:
- 使用vi.useFakeTimers精确控制时间
- 通过performance.getEntriesByName验证标记
- 模拟大量渲染验证内存稳定性

#### 5.3 templates.ts 测试

**需新增测试**:
- 内置模板的完整性
- 模板变量提取
- 模板渲染
- 模板分类

### 六、边界与异常测试

#### 6.1 多状态耦合场景

| 场景 | 状态组合 | 预期行为 |
|-----|---------|---------|
| 用户在AI生成中切换项目 | currentProject变更 + isGenerating=true | 取消当前生成任务 |
| 删除正在编辑的分镜 | currentSceneId存在 + 该分镜被删除 | currentSceneId重置为null |
| 修改项目画风后分镜未更新 | artStyleConfig变更 + 分镜status=completed | 分镜status变为needs_update |
| 配置清空时正在测试连接 | clearConfig调用 + testConnection进行中 | 测试中断并返回false |
| 同时编辑同一分镜的台词 | 两个标签页打开 + 同时saveScene | 后写入覆盖前写入(显示警告) |

**测试实现策略**:
- 使用setState强制注入特定状态组合
- 通过Promise.race模拟并发操作
- 验证状态转换的顺序与原子性

#### 6.2 异步竞态条件

| 场景 | 竞态条件 | 预期处理 |
|-----|---------|---------|
| 快速切换分镜 | loadScenes尚未完成时再次loadScenes | 取消前一次请求 |
| 并发生成多个分镜 | 多个generateScene同时调用 | 串行化处理或限流 |
| 存储写入冲突 | saveProject和saveScene同时写localStorage | 写入队列化 |
| AI流式响应中断 | streamChat进行中时组件卸载 | 清理流并释放资源 |

**测试实现策略**:
- 使用AbortController测试取消逻辑
- 模拟网络延迟验证竞态处理
- 验证cleanup函数的调用时机

#### 6.3 错误降级测试

| 错误类型 | 触发条件 | 降级策略 |
|---------|---------|---------|
| AI调用失败 | 网络错误/401/500 | 显示错误信息+提供重试按钮 |
| localStorage满 | QuotaExceededError | 提示清理数据+禁用自动保存 |
| 数据解密失败 | 加密数据损坏 | 清空配置+要求重新输入 |
| JSON解析失败 | localStorage被外部修改 | 重置为初始状态 |
| 画风迁移失败 | 旧数据格式无法识别 | 使用默认画风 |

**测试实现策略**:
- mock各类异常并验证降级路径
- 检查错误日志是否记录
- 验证用户提示信息的友好性

#### 6.4 数据迁移兼容性

**需测试的迁移场景**:
- v1.0项目(只有style字符串)迁移到v2.0(ArtStyleConfig)
- 旧版台词格式(字符串数组)迁移到新版(DialogueLine对象)
- 角色themeColor迁移到primaryColor/secondaryColor
- 分镜actionDescription迁移到shotPrompt/motionPrompt

**测试实现要点**:
- 准备各版本的mock数据
- 验证迁移后数据结构正确
- 确保迁移过程无数据丢失
- 测试向后兼容性

### 七、边缘操作场景测试

#### 7.1 用户异常操作模拟

| 操作 | 预期系统响应 |
|-----|-------------|
| 连续快速点击"生成分镜"按钮 | 防抖处理,只触发一次 |
| 在AI生成过程中刷新页面 | 保存进度,下次加载时恢复或提示继续 |
| 输入超长文本(10万字) | 截断或提示超出限制 |
| 粘贴特殊字符(emoji/零宽字符) | 正确保存和显示 |
| 删除所有项目后立即创建新项目 | 不崩溃,正确初始化 |
| 在离线状态下操作 | 本地操作正常,AI调用时提示网络错误 |
| 浏览器窗口最小化时AI生成 | 后台继续生成,完成后通知 |
| 同时打开多个标签页 | 数据同步或显示冲突警告 |

**测试实现策略**:
- 使用user-event模拟真实用户操作
- 通过navigator.onLine模拟离线
- 使用visibilitychange事件测试后台行为
- 模拟localStorage的storage事件测试多标签

#### 7.2 性能边界测试

| 测试项 | 测试数据规模 | 性能指标 |
|-------|------------|---------|
| 项目列表渲染 | 100个项目 | 初始渲染<200ms |
| 分镜列表渲染 | 500个分镜 | 滚动流畅(60fps) |
| 搜索响应速度 | 1000个分镜中搜索 | <100ms |
| 导出大型项目 | 500个分镜+50个角色 | <5s |
| 批量生成分镜 | 50个分镜 | 队列管理不阻塞UI |

**测试实现要点**:
- 使用performance.measure测量耗时
- 通过React DevTools Profiler检测渲染性能
- 验证虚拟滚动的实现

#### 7.3 内存泄漏检测

**需检测的泄漏点**:
- 组件卸载时未清理的事件监听器
- 未取消的setTimeout/setInterval
- 未关闭的AI流式连接
- Zustand store订阅未取消
- 大对象未释放(版本快照、AI响应缓存)

**测试实现策略**:
- 使用React DevTools检测组件重复挂载
- 验证cleanup函数的调用
- 检查WeakMap/WeakSet的使用
- 模拟组件频繁挂载卸载监控内存

#### 7.4 网络异常恢复

| 异常场景 | 恢复策略 |
|---------|---------|
| AI请求超时(30s) | 自动重试3次,失败后提示 |
| 网络间歇性中断 | 流式响应断点续传 |
| API限流(429) | 指数退避重试 |
| 服务端错误(500) | 显示错误详情,提供反馈入口 |
| DNS解析失败 | 提示检查网络连接 |

**测试实现策略**:
- 使用msw(Mock Service Worker)模拟各类网络错误
- 验证重试次数和延迟时间
- 检查错误日志的记录

### 八、集成测试设计

#### 8.1 工作流端到端测试

**测试流程**: 项目创建 → 基础设定 → 分镜生成 → 分镜细化 → 导出

**验证点**:
- 每个步骤的数据正确传递到下一步
- 工作流状态转换符合预期
- 中途退出可恢复进度
- 跳步操作的合法性校验

#### 8.2 跨模块交互测试

| 交互场景 | 涉及模块 | 验证点 |
|---------|---------|-------|
| 角色创建后注入分镜 | characterStore + storyboardStore + contextBuilder | 分镜描述包含角色信息 |
| 画风变更触发级联更新 | projectStore + storyboardStore + cascadeUpdater | 分镜状态更新为needs_update |
| 世界观注入AI上下文 | worldViewStore + contextBuilder + AI service | 生成内容符合世界观设定 |
| AI调用进度显示 | AI service + aiProgressStore + DevPanel | 进度实时同步 |

**测试实现策略**:
- 不mock底层模块,测试真实集成
- 验证模块间的数据契约
- 检查异步操作的串联

### 九、测试基础设施

#### 9.1 测试环境配置增强

**需补充的setup.ts配置**:
- mock window.crypto用于测试加密
- mock IntersectionObserver用于虚拟滚动测试
- mock ClipboardAPI用于复制功能测试
- mock File/Blob API用于导出功能测试
- 配置全局错误边界捕获测试中的错误

#### 9.2 测试工具函数库

**需创建的测试辅助函数**:
- createMockProject(): 生成测试项目数据
- createMockScene(): 生成测试分镜数据
- createMockCharacter(): 生成测试角色数据
- setupStoreWithData(): 初始化store并填充数据
- waitForAsyncUpdate(): 等待异步状态更新完成
- mockAIResponse(): 模拟AI调用响应
- resetAllStores(): 重置所有store到初始状态

#### 9.3 测试数据管理

**测试数据集**:
- fixtures/projects.json: 各类项目测试数据
- fixtures/scenes.json: 各状态分镜测试数据
- fixtures/characters.json: 角色测试数据
- fixtures/legacy-data.json: 旧版数据用于迁移测试
- fixtures/edge-cases.json: 边界情况测试数据

#### 9.4 CI/CD集成

**测试流程**:
1. 代码提交 → 运行单元测试
2. 测试通过 → 生成覆盖率报告
3. 覆盖率检查: 新代码覆盖率>80%,整体覆盖率>70%
4. 测试失败 → 阻止合并,通知开发者

**覆盖率目标**:
- 语句覆盖率(Statement): ≥75%
- 分支覆盖率(Branch): ≥70%
- 函数覆盖率(Function): ≥80%
- 行覆盖率(Line): ≥75%

### 十、测试驱动的代码健壮性提升

#### 10.1 错误处理增强

**当前问题**: 部分代码缺少错误处理  
**改进方向**:
- 所有async函数添加try-catch
- 关键操作添加参数校验
- 用户输入添加格式验证
- API调用添加超时控制

**示例场景**:
| 位置 | 问题 | 解决方案 |
|-----|------|---------|
| projectStore.updateProject | 未校验projectId是否存在 | 添加存在性检查,不存在时抛出错误 |
| AIFactory.createClient | model为空字符串时行为未定义 | 添加非空校验 |
| storage.encrypt | 输入为null/undefined时崩溃 | 添加类型守卫 |
| contextBuilder.build | 超长上下文未截断 | 添加maxLength参数并截断 |

#### 10.2 类型安全增强

**当前问题**: 部分any类型和类型断言  
**改进方向**:
- 消除不必要的any
- 使用泛型增强类型推导
- 添加类型守卫函数
- 使用Zod进行运行时类型校验

**示例位置**:
- AI响应解析处的any类型
- localStorage数据反序列化的类型断言
- 事件处理器的event类型

#### 10.3 并发安全增强

**当前问题**: 部分并发场景未处理竞态  
**改进方向**:
- 关键操作添加防抖/节流
- 使用AbortController取消过期请求
- 实现乐观锁机制
- 添加操作队列

**示例场景**:
- saveScene添加防抖避免频繁写入
- AI生成添加取消机制
- 配置更新添加版本号校验

#### 10.4 资源管理增强

**当前问题**: 部分资源清理不彻底  
**改进方向**:
- 所有useEffect添加cleanup函数
- 组件卸载时取消pending的异步操作
- 定时清理过期缓存
- 监控内存使用

**示例位置**:
- AI流式响应的清理
- 事件监听器的移除
- setTimeout/setInterval的清除
- store订阅的取消

### 十一、测试执行计划

#### 阶段一: 核心功能测试(1-2周)
1. 补充所有store的测试用例
2. 完善storage层的边界测试
3. 增强AI服务层的异常测试
4. 建立测试数据和工具函数库

#### 阶段二: 边界与异常测试(1周)
1. 多状态耦合场景测试
2. 异步竞态条件测试
3. 错误降级测试
4. 数据迁移测试

#### 阶段三: 边缘场景测试(1周)
1. 用户异常操作模拟
2. 性能边界测试
3. 内存泄漏检测
4. 网络异常恢复测试

#### 阶段四: 集成测试(可选,1周)
1. 工作流端到端测试
2. 跨模块交互测试
3. UI组件集成测试

#### 阶段五: 代码健壮性提升(持续)
1. 根据测试发现的问题修复代码
2. 添加缺失的错误处理
3. 优化类型定义
4. 改进资源管理

### 十二、测试规范与最佳实践

#### 12.1 测试文件组织

**文件命名规范**:
- 单元测试: `*.test.ts` / `*.test.tsx`
- 集成测试: `*.integration.test.ts`
- E2E测试: `*.e2e.test.ts`

**测试分组规范**:
```typescript
describe('ModuleName', () => {
  describe('FeatureName', () => {
    describe('边界情况', () => {});
    describe('异常情况', () => {});
    describe('性能测试', () => {});
  });
});
```

#### 12.2 测试命名规范

**测试用例命名**: `should + 预期行为 + when + 条件`

示例:
- `should throw error when projectId does not exist`
- `should debounce multiple rapid calls`
- `should cleanup listeners on component unmount`

#### 12.3 断言规范

**优先使用语义化断言**:
- `expect(value).toBeNull()` 优于 `expect(value).toBe(null)`
- `expect(array).toHaveLength(5)` 优于 `expect(array.length).toBe(5)`
- `expect(fn).toHaveBeenCalledWith(arg)` 精确验证参数

**避免过度断言**:
- 一个测试只验证一个行为
- 避免在一个it中写多个逻辑无关的expect

#### 12.4 Mock使用规范

**Mock原则**:
- 只mock外部依赖(localStorage, fetch, AI服务)
- 不mock被测试模块的内部函数
- Mock后要验证调用(toHaveBeenCalled)
- 每个测试后恢复Mock(vi.restoreAllMocks)

**Mock策略**:
- 使用vi.spyOn保留原实现
- 使用vi.mock完全替换模块
- 使用vi.fn创建mock函数
- 使用vi.useFakeTimers控制时间

#### 12.5 测试隔离性

**确保测试独立**:
- 每个测试前重置状态(beforeEach)
- 不依赖测试执行顺序
- 不共享可变状态
- 清理副作用(afterEach)

#### 12.6 测试可维护性

**提高可维护性**:
- 提取通用测试逻辑为辅助函数
- 使用测试数据工厂生成数据
- 避免硬编码测试数据
- 添加清晰的注释说明测试意图

### 十三、测试覆盖率监控

#### 13.1 覆盖率配置优化

**vitest.config.ts增强**:
```
覆盖率阈值设置:
- statements: 75%
- branches: 70%
- functions: 80%
- lines: 75%

覆盖率报告格式:
- text: 控制台摘要
- lcov: CI/CD集成
- html: 本地查看
- json: 数据分析

排除文件:
- 测试文件本身
- 类型定义文件
- Mock数据文件
- 配置文件
```

#### 13.2 未覆盖代码分析

**定期检查**:
- 哪些分支未覆盖
- 哪些异常处理未触发
- 哪些边界条件未测试
- 哪些函数从未调用

**优先级排序**:
1. 核心业务逻辑未覆盖 → P0
2. 错误处理未覆盖 → P1
3. 边界条件未覆盖 → P2
4. 工具函数未覆盖 → P3

### 十四、测试文档与知识沉淀

#### 14.1 测试用例文档

**为复杂测试添加文档**:
- 测试目的
- 前置条件
- 测试步骤
- 预期结果
- 注意事项

#### 14.2 测试问题记录

**记录测试过程中发现的问题**:
- 问题描述
- 复现步骤
- 根因分析
- 修复方案
- 回归测试

#### 14.3 测试最佳实践总结

**持续总结经验**:
- 哪些Mock策略最有效
- 哪些测试模式可复用
- 哪些坑需要避免
- 哪些工具提升效率

## 实施检查清单

### 阶段一完成标准
- [ ] 所有store测试覆盖率>85%
- [ ] storage层所有函数有边界测试
- [ ] AI服务层所有provider有异常测试
- [ ] 测试工具函数库建立完成
- [ ] 测试数据fixtures准备完成

### 阶段二完成标准
- [ ] 至少10个多状态耦合场景测试
- [ ] 至少5个异步竞态条件测试
- [ ] 所有错误降级路径有测试
- [ ] 数据迁移的向后兼容性验证

### 阶段三完成标准
- [ ] 至少8个用户异常操作测试
- [ ] 性能测试覆盖所有关键操作
- [ ] 内存泄漏检测通过
- [ ] 网络异常恢复测试完成

### 阶段四完成标准(可选)
- [ ] 至少1个完整工作流E2E测试
- [ ] 至少4个跨模块交互测试
- [ ] 关键UI组件的集成测试

### 代码健壮性提升标准
- [ ] 所有async函数有错误处理
- [ ] 用户输入有格式校验
- [ ] 并发操作有防抖/节流
- [ ] 组件有cleanup函数
- [ ] 消除不必要的any类型
- [ ] localStorage操作有容错

### 整体质量标准
- [ ] 整体测试覆盖率≥75%
- [ ] 核心模块覆盖率≥85%
- [ ] 0个已知严重bug
- [ ] 所有测试在CI中通过
- [ ] 测试执行时间<2分钟

## 风险与挑战

### 技术风险
- **测试复杂度高**: 多状态耦合和异步竞态测试难度大
  - **缓解**: 使用成熟的测试模式,参考开源项目
- **Mock维护成本**: AI服务Mock需要与API保持同步
  - **缓解**: 定期检查API文档更新Mock

### 资源风险
- **测试用例数量多**: 可能超出预期工作量
  - **缓解**: 按优先级分阶段实施,P0/P1优先

### 质量风险
- **过度测试**: 测试本身可能有bug
  - **缓解**: Code Review测试代码,定期清理过时测试
- **测试脆弱**: UI变更导致大量测试失败
  - **缓解**: 使用Testing Library的语义化查询,避免实现细节依赖

## 成功指标

### 量化指标
- 测试覆盖率从当前~60%提升至≥75%
- 核心模块覆盖率达到85%+
- 测试用例数量从~100增加至~500+
- 代码库中any类型减少50%
- 已知bug数量降低80%

### 质量指标
- 新功能开发前先写测试(TDD)
- 代码变更后测试通过率100%
- 回归bug发生率<5%
- 线上严重bug数量为0

### 效率指标
- 测试执行时间<2分钟
- CI/CD测试通过率>95%
- bug修复平均耗时减少50%
- 新人上手理解代码时间减少30%
