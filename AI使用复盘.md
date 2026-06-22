# AI 使用复盘

这次项目里，我主要用了两个 AI 工具：

- **OpenAI Codex**：作为主要执行代理，用来读题、拆任务、改代码、跑测试、整理 README 和交付物。
- **Anthropic Claude**：作为审核助手，用来审技术设计书、数据库 schema、API 设计、测试清单和前端设计方向。

我的分工不是“把题目丢给 AI 让它自动完成”，而是把 AI 当成工程协作对象：Codex 负责快速执行和落地，Claude 负责从旁边挑问题，我负责判断哪些建议符合题目、哪些建议需要砍掉或改写。

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

## 7. AI 如何辅助项目管理文档维护

这个项目时间很短，过程中需求也一直在变，所以我没有只让 AI 写代码。每一轮实现、审核、纠正和验证后，我都会让 AI 把状态同步到项目管理文档，避免最后交付时靠记忆拼材料。

整个过程中主要维护了这些文件：

- `任务描述.md`：作为原始题目来源，后续所有设计和测试覆盖都回到这里核对。
- `竞品数据流分析.md`：记录 BetterMe funnel 里观察到的真实数据流、localStorage、接口和订阅前后差异。
- `技术设计书.md`：记录 API、数据库 schema、持久化、订阅闭环、计划生成规则和测试设计。
- `实施计划书.md`：把任务拆成阶段，明确先做后端闭环、再做前端、最后补测试和交付物。
- `AI协作日志.md`：记录我和 AI 在竞品分析、方案取舍、Claude 审核、Codex 实现中的关键决策。
- `devlog.md`：记录每次实际改了什么、验证了什么、哪些反馈导致了新调整。
- `README.md`：整理成最终交付入口，包含线上链接、启动方式、API 文档、`/api/pay` cURL、已支付 sessionId、测试和 CI 说明。
- `AI使用复盘.md`：也就是本文，用来说明 AI 在整个项目中的具体参与方式和我做过的判断。

这部分工作的价值是让项目过程可追溯。评审看到的不只是最终代码，还有我怎么从题目、竞品、设计、实现、测试一路收口到交付。

## 8. 我否决或纠正过的 AI 方案

### 8.1 否决“前端假解锁”，坚持用后端状态做订阅真相源

在做订阅前后差异时，AI 曾经给过一个更快的做法：用户点击订阅按钮后，前端直接切到完整报告页面，或者前端一次性拿到完整数据，只是在未支付状态下把部分内容模糊处理。

我否决了这个方案。原因很简单：题目要求的是“模拟订阅体系：鉴权、差异化返回、支付回调闭环”。如果完整数据一开始就到了前端，只靠 CSS blur 或按钮状态遮住，那只是视觉 paywall，不是后端闭环。评审用接口一查就会发现未支付用户其实已经拿到了受保护字段。

最后我要求改成：

- `/api/results` 根据数据库里的 `subscriptionStatus` 返回不同结构。
- 未支付用户响应里根本不返回精确 `recommendedCalories`、`targetDate` 和完整 `plan`。
- `/api/pay` 作为模拟支付回调，更新订阅状态。
- 同一个 `sessionId` 支付前后再次请求 `/api/results`，才能看到脱敏版变成完整版。
- 自动化测试显式断言“非会员拿不到受保护字段，会员才能拿到”。

这个取舍是项目里最核心的技术边界之一。前端可以做得像竞品，但权限不能只靠前端演。

### 8.2 否决“一张 JSON 大表”方案，改成可解释的关系模型

竞品的问卷数据里有很多 `answers.extra`、`rawAnswers` 和 question id。AI 最开始也倾向于把这个模式复制过来：把所有问卷答案都塞进一个 JSON 字段，后端按 key 读取，schema 会很灵活。

我没有采用这个方案。因为这次题目考的是 API 设计、数据库建模、字段选择和测试质量。全塞 JSON 确实快，但会带来几个问题：

- Schema 图看不出核心业务字段。
- 数据库字段选择无法体现专业判断。
- Zod 校验和 Prisma 类型约束会变弱。
- 边界值测试更难对应到具体字段。
- 面试时很难解释哪些数据是核心计算字段，哪些只是扩展问卷字段。

最后我让 AI 改成显式字段建模：

- `users` 存匿名 session、lead 信息、订阅状态和健康数据同意。
- `assessments` 存用户填写的核心健康字段、扩展问卷字段、step、completed、version。
- `results` 存服务端计算后的结果。
- `subscriptions` 存模拟订阅状态。

这样牺牲了一点动态扩展能力，但换来了更清楚的数据库关系、更严谨的校验和更好写的测试。对这道题来说，这是更合理的取舍。

### 8.3 纠正“脱敏只是改展示文案”的方案，改成接口级脱敏

AI 初版把非会员热量写成一个比较窄的区间，甚至有些页面只是把精确数字换成模糊文案。这个方案看起来像脱敏，但本质上还不够。

我要求重新定义非会员可见范围：未支付用户只能拿宽泛区间，不能通过区间倒推精确热量，也不能拿到完整计划里的执行细节。也就是说，脱敏不只是前端文案问题，而是 API 响应结构问题。

最终处理是：

- 免费用户只返回 `recommendedCaloriesRange`，不返回 `recommendedCalories`。
- 免费用户只返回 `planPreview`，不返回完整 `plan.sections`。
- 付费后才返回精确目标日期、精确热量和完整计划。
- 测试里直接检查免费响应不存在受保护字段。

这个地方如果不纠正，项目表面上有 paywall，实际上后端数据边界会很虚。

## 9. 总结

这次 AI 协作真正有价值的地方，不是让 AI 一次性生成完整项目，而是让它快速产出候选方案、竞品数据流、schema 草案、测试矩阵和实现草稿。我的主要工作是判断哪些方案符合题目，哪些只是看起来专业但不闭合。

最终项目的设计原则是：

- 参考竞品的数据流，但不盲目复制复杂营销系统。
- API 路径保持语义清楚，避免无关工程化。
- 数据库显式建模，优先可解释、可测试、可扩展。
- 后端状态是真相源，前端只负责体验。
- 非会员和会员结果差异必须由 API 返回保证。
- 测试要覆盖边界和异常，而不是只测 happy path。

这个过程更接近真实工程中的 AI 协作：AI 提效，人来判断边界和质量。
