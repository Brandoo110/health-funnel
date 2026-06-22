# AI 使用复盘

这次挑战我没有把 AI 当成一次性代码生成器，而是把它拆成几个角色来用：研究员、实现者、审核员和测试设计助手。我的工作不是“让 AI 直接做完”，而是持续把它拉回题目原始要求、竞品真实数据流、后端闭环和可验证的工程边界。

## 1. 先让 AI 读取竞品数据流，而不是直接建表

题目明确要求先体验 BetterMe 这类产品，观察它的测评流程和数据结构，再开始设计后端。因此我没有一开始就让 AI 凭经验设计 schema，而是先让它打开 BetterMe Pilates funnel，用浏览器开发者工具观察真实网络请求和 localStorage。

这一步拿到的关键信息包括：

- BetterMe 在首屏选择年龄后调用 `POST /api/v3/questionnaires` 创建后端 questionnaire。
- 会话身份由服务端生成 UUID，前端 URL 里带 `order=<uuid>`。
- 服务端会自动补充 `country`、`ipCountry`、`ipRegion`、`platform`、`createdAt`、UTM 等元数据。
- 前端进度主要保存在 `localStorage.quiz_progress`，里面有 `step`、`answers`、`rawAnswers`、`healthDataConsent` 和 `meta.version`。
- `answers` 分成 `required`、`extra`、`optional/rawAnswers`，说明竞品既有标准健康字段，也有大量可扩展问卷字段。
- 未支付时接口里 `paidOrder:null`，完整计划和付费内容不会直接开放。

这一步的价值是让后续设计不靠猜。我们最终没有照搬 BetterMe 的几十个问题和复杂营销链路，但吸收了它真正有工程价值的部分：后端生成会话、记录进度 step、区分核心字段和扩展字段、保存健康数据同意状态、订阅前后差异化返回。

## 2. 基于竞品做取舍，而不是 1:1 复制

竞品很复杂，但这次任务是 3 天全栈挑战，评分重点在 API、数据库、持久化、模拟订阅和测试质量。所以我和 AI 讨论后做了几个取舍。

### 2.1 会话设计

BetterMe 用 `questionnaire/order` 表达一次测评。我们没有照搬命名，而是设计成：

- `POST /api/sessions` 创建匿名 session。
- 后端生成 UUID，返回给前端作为 `sessionId`。
- 后续所有接口都用这个 `sessionId` 识别用户。

原因是题目允许“随机生成 UserID 或简易 Session”，`sessions` 这个 API 名称比 `questionnaires` 更适合当前项目，也更容易让评审理解。

### 2.2 分步保存和恢复

BetterMe 很多进度存在 localStorage。这个做法对真实产品前端很方便，但题目要求的是后端分步保存和进度恢复，所以我们没有只学 localStorage。

我们的设计是：

- 每一步填写后调用 `PATCH /api/assessment`。
- 后端把答案、当前 `step`、`version` 写入数据库。
- 刷新或中断后用 `GET /api/assessment?sessionId=...` 恢复。

这样能证明数据真的持久化到了后端，而不是页面临时状态。

### 2.3 字段建模

BetterMe 前端里大量问题用数字 question id 存在 `answers.extra` 和 `rawAnswers`，灵活但不利于本题展示。我们最终没有把所有答案塞进一个 JSON 字段，而是把核心字段做成显式列：

- `gender`
- `goal`
- `age`
- `heightCm`
- `weightKg`
- `targetWeightKg`
- `activityLevel`
- `pacePreference`
- `workoutDaysPerWeek`
- `sessionMinutes`
- `workoutLocation`
- `dietPreference`
- `sleepHours`
- `stressLevel`
- `mainBarrier`

这样做的原因是：显式列更容易做 Zod 校验、Prisma 类型约束、数据库关系说明和自动化测试。对于这次挑战来说，清晰和可验证比无限动态扩展更重要。

### 2.4 订阅前后差异

BetterMe 未支付时不会返回完整 paid plan。我们把这个逻辑转成题目需要的模拟订阅体系：

- 免费用户可以看到 BMI、BMI 分类、宽泛热量区间和计划预览。
- 免费用户拿不到精确 `recommendedCalories`、`targetDate` 和完整 `plan`。
- 调用 `POST /api/pay` 后，用户状态变为 `active`。
- 同一个 `sessionId` 再查 `GET /api/results`，返回完整结果。

这比前端简单跳转到“已解锁页面”更合理，因为权限差异来自后端状态，而不是前端按钮。

## 3. AI 如何辅助数据库建模

数据库建模阶段，我先让 AI 根据竞品数据流提出候选表结构，再按题目要求压缩成 4 张核心表：

- `users`
- `assessments`
- `results`
- `subscriptions`

### 3.1 `users`

`users` 不是传统登录用户，而是匿名会话主体。它保存：

- `id`：后端生成的 UUID，也就是 `sessionId`
- `name` / `email`：报告生成后再收集的 lead 信息
- `subscriptionStatus`：当前订阅状态
- `healthDataConsent`：健康数据同意状态

这里借鉴了竞品的“后端生成身份”和健康数据合规字段，但没有做真实登录，因为题目不要求。

### 3.2 `assessments`

`assessments` 存用户分步填写的问卷数据。它包含核心健康字段、扩展问卷字段、`step`、`completed` 和 `version`。

AI 一开始更容易给出普通表单式 schema，但我要求它围绕“分步保存、恢复、乱序、并发”去设计，所以最终加入：

- `step`：当前进度
- `completed`：是否提交完成
- `version`：乐观并发控制

这几个字段直接对应任务中“中断恢复、乱序 / 重复提交、并发更新”的测试要求。

### 3.3 `results`

`results` 存服务端计算结果，而不是把结果塞回 `assessments`。

原因是输入和输出职责不同：

- `assessments` 是用户填写的原始数据
- `results` 是服务端计算出来的产物

拆开之后，结果页可以直接读取持久化结果，重复 submit 也能更新同一份结果。

### 3.4 `subscriptions`

`subscriptions` 存当前模拟订阅快照，`users.subscriptionStatus` 则作为结果接口快速鉴权字段。

这是有意识的冗余：真实系统可能会有完整订单表、支付事件表、退款记录等，但本题只要求模拟订阅闭环。当前设计既能解释订阅状态，又不会为了不存在的真实支付系统过度工程化。

## 4. AI 如何生成 Mock 数据和测试数据

AI 在测试数据生成上很有用，但我没有让它随便堆 payload，而是让它按题目风险来构造数据。

有效数据主要覆盖：

- 完整健康测评用户
- 不同 `goal`
- 不同 `activityLevel`
- 不同训练频率、饮食偏好、睡眠、压力和主要阻碍
- 免费用户和已支付用户

异常数据主要覆盖：

- 缺失核心健康字段
- 非法 `sessionId`
- 存在但未知的 UUID
- 非法 enum
- 身高、体重、年龄、目标体重越界
- 数字字段传字符串
- 数字字段传 `null`
- 字符串注入式输入
- 乱序 step
- 重复 step
- stale version 并发冲突

这些测试数据不是为了凑数量，而是对应题目第四阶段要求的“边界、极端、缺失、非法输入、恢复、重复、并发和支付状态变化”。

## 5. AI 如何辅助复杂逻辑实现

健康算法部分我要求 AI 拆成纯函数，而不是直接写在 API route 里。

这样拆分后，核心逻辑包括：

- BMI 计算
- BMI 分类
- BMR / TDEE 估算
- 根据目标和节奏调整建议热量
- 安全下限保护
- 根据目标体重和每周变化速度计算目标日期
- 生成训练、饮食、恢复和每日行动计划

这样做有两个好处：

1. 算法不依赖数据库，可以单独测试。
2. API route 只负责校验、读写数据库和鉴权，职责更清楚。

扩展问卷字段也不是只存在数据库里。计划生成会使用：

- `workoutDaysPerWeek` 决定训练频率
- `sessionMinutes` 决定单次训练长度
- `workoutLocation` 决定 home / gym / mixed 计划风格
- `dietPreference` 决定饮食建议表达
- `sleepHours` 和 `stressLevel` 决定恢复建议
- `mainBarrier` 决定每日行动建议

这能说明：前端问的问题不是装饰，而是会影响后端生成的计划内容。

## 6. AI 如何辅助测试用例和边界场景

测试阶段我让 AI 先按模块列测试矩阵，再落成 Vitest。

最终测试分成三层：

### 6.1 健康算法单元测试

位置：`lib/health.test.ts`

覆盖：

- BMI 分类边界
- 极端但合法的年龄 / 身高 / 体重
- 非法年龄 / 身高 / 体重 / 目标体重
- 缺失运行时字段
- 不合理目标 BMI
- 热量下限
- 不同目标节奏

### 6.2 测评保存和恢复测试

位置：`tests/api/assessment.test.ts`

覆盖：

- 空进度恢复
- 分步保存
- 中断后恢复
- 同一步重复保存
- 乱序提交不会让 step 倒退
- stale version 返回冲突
- 非法 UUID 提前返回 400
- 不存在 UUID 返回 404
- 非法 enum 和越界数字
- 数字注入和 `null` 数值

### 6.3 提交、结果和支付闭环测试

位置：`tests/api/submit-results-pay.test.ts`

覆盖：

- 缺必填字段不能生成结果
- 完整测评可以生成结果
- 重复 submit 更新同一份结果
- 未 submit 时查结果返回业务错误
- 免费用户拿不到受保护字段
- `/api/pay` 后同一个 session 返回完整结果
- `/api/pay` 幂等
- 不存在的合法 UUID 返回 404
- 非法 UUID 返回 400

这部分最重要的是证明“支付前后差异化返回”来自后端，而不是前端状态伪造。

## 7. AI 如何辅助 API 设计

AI 给过多个 API 命名方案，我最后选择了更贴合题目语义的一组：

- `POST /api/sessions`：创建匿名会话
- `PATCH /api/sessions/lead`：报告后保存姓名和邮箱
- `GET /api/assessment`：恢复进度
- `PATCH /api/assessment`：分步保存
- `POST /api/assessment/submit`：提交并生成结果
- `GET /api/results`：按订阅状态返回结果
- `POST /api/pay`：模拟支付回调

这里没有加 `/api/v1`、真实登录、rate limit 或真实 Stripe。原因是它们可以是真实生产系统的后续方向，但不是本题核心。当前 API 已经能清楚证明路径语义、请求响应结构、校验、持久化、鉴权和支付闭环。

## 8. AI 如何辅助文档和交付物整理

AI 还被用来整理交付材料，包括：

- 技术设计书
- 竞品数据流分析
- README
- 数据库 Schema 图
- 测试覆盖矩阵
- `/api/pay` 可重放 cURL
- 已支付测试 sessionId
- 本文 AI 使用复盘

这里我要求 README 不只写“怎么启动”，而是直接对齐交付物：

- 线上可访问 URL
- GitHub 链接
- API 文档
- `/api/pay` 重放方式
- 已支付测试 sessionId
- 自动化测试运行方式
- CI 状态
- Schema 图
- AI 使用复盘链接

这样评审打开 README 就能直接验收，而不是去代码里猜。

## 9. 我否决或纠正过的 AI 方案

### 9.1 否决“只按已有测试概括第四阶段已完成”

在后端闭环跑通后，AI 一开始倾向于总结“已经有测试覆盖主流程”。我没有接受这个说法，而是要求回到原始任务文件逐条核对第四阶段。

原因是题目说的是“证明上面三个阶段是对的”，不是“本地点了一遍没问题”。如果缺少边界和异常路径，或者 README 没写覆盖范围，评审会认为质量保障不扎实。

最终修正：

- 补缺失运行时字段测试
- 补非法数值注入测试
- 补 UUID 格式校验测试
- 补 GitHub Actions CI
- README 增加测试覆盖矩阵和未覆盖说明

### 9.2 删除 `measureSystem`，不保留半成品字段

竞品有 `preferredMeasureSystem`，AI 最开始也倾向于保留 `measureSystem` 字段，显得更贴近竞品。

我最后否决了这个设计。原因是当前产品没有真正实现英制输入、单位换算、英制校验和对应测试。如果 schema 里留着 `measureSystem`，面试时很容易被追问“imperial 怎么处理”，而答案会变成半成品。

最终处理：

- 删除 `measureSystem`
- 通过 migration 从数据库里移除
- README 明确当前只支持公制 `heightCm / weightKg`

这个取舍比盲目追求字段完整更稳。

### 9.3 加宽非会员热量脱敏，避免反推精确值

AI 初版把免费用户的卡路里区间做得太窄，看起来像脱敏，但实际可能反推出精确 `recommendedCalories`。

我判断这不符合“非会员拿不到受保护字段”的要求，所以要求改成更宽的固定桶。

最终结果：

- 免费用户只拿到宽泛 `recommendedCaloriesRange`
- 精确 `recommendedCalories` 只在订阅状态为 `active` 后返回
- 测试中显式断言免费响应没有受保护字段

### 9.4 没有现在接真实 Stripe / 登录 / rate limit

AI 和审核建议里都出现过一些更生产化的方向，例如真实 Stripe、真实登录、API version、rate limit。

我没有把这些放进当前版本。原因是这次题目要求的是模拟订阅体系和后端基础设施，不是完整商业支付系统。把这些都加上会显得过度工程化，反而分散 API、DB、测试这些核心评分点。

最终设计保留后续扩展空间，但当前版本只实现：

- 匿名 session
- 模拟 `/api/pay`
- 订阅状态差异化返回
- 自动化测试证明闭环

## 10. 总结

这次 AI 协作真正有价值的地方，不是让 AI 一次性生成完整项目，而是让它快速产出候选方案、竞品数据流、schema 草案、测试矩阵和实现草稿。我的主要工作是判断哪些方案符合题目，哪些只是看起来专业但不闭合。

最终项目的设计原则是：

- 参考竞品的数据流，但不盲目复制复杂营销系统。
- API 路径保持语义清楚，避免无关工程化。
- 数据库显式建模，优先可解释、可测试、可扩展。
- 后端状态是真相源，前端只负责体验。
- 非会员和会员结果差异必须由 API 返回保证。
- 测试要覆盖边界和异常，而不是只测 happy path。

这个过程更接近真实工程中的 AI 协作：AI 提效，人来判断边界和质量。
