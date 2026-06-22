# 健康测评 Funnel 全栈挑战

[![CI](https://github.com/Brandoo110/health-funnel/actions/workflows/ci.yml/badge.svg)](https://github.com/Brandoo110/health-funnel/actions/workflows/ci.yml)

这是一个健康测评 funnel 的全栈实现。重点不是复刻竞品页面，而是把核心后端闭环做完整：分步保存、进度恢复、服务端健康算法、结果持久化、模拟订阅鉴权、非会员脱敏、`/api/pay` 解锁完整结果，以及自动化测试证明关键路径和边界场景正确。

## 一、线上演示

- 线上地址：[https://health-funnel.vercel.app](https://health-funnel.vercel.app)
- GitHub 仓库：[Brandoo110/health-funnel](https://github.com/Brandoo110/health-funnel)
- 已支付测试 `sessionId`：`80e14ffa-dd7d-41fc-8406-d43fc2258e5e`
- 线上 `/api/pay` 验证时间：2026-06-20 22:27 AEST

说明：评审请优先使用上面的稳定 Production 地址。单次 Vercel Preview 地址可能受 Vercel 登录保护影响。

## 二、技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma 7.8
- Supabase PostgreSQL
- Zod
- Vitest
- GitHub Actions CI

## 三、本地启动

先创建 `.env`：

```bash
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

然后运行：

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

本地访问：

```txt
http://localhost:3000
```

## 四、一键测试与 CI

一键运行测试：

```bash
npm test
```

当前测试结果：

```txt
Test Files  5 passed (5)
Tests       39 passed (39)
```

补充检查：

```bash
npm run lint
npm run build
```

CI 文件位于 `.github/workflows/ci.yml`，在 push / pull request 时自动运行：

- 启动 PostgreSQL service
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm run lint`
- `npm test`
- `npm run build`

## 五、API 文档

所有接收 `sessionId` 的接口都会先校验 UUID。格式错误返回 `400 bad_request`，格式正确但数据库不存在返回 `404 not_found`。

### 1. 创建会话

`POST /api/sessions`

请求：

```json
{}
```

响应：

```json
{
  "sessionId": "uuid",
  "subscriptionStatus": "free"
}
```

### 2. 保存报告后的姓名 / 邮箱

`PATCH /api/sessions/lead`

这个接口只在报告生成后收集 lead 信息，避免一开始就打断用户填写 funnel。

```json
{
  "sessionId": "uuid",
  "name": "Junjie Li",
  "email": "junjie@example.com"
}
```

响应：

```json
{
  "ok": true,
  "sessionId": "uuid",
  "name": "Junjie Li",
  "email": "junjie@example.com"
}
```

兼容说明：`PATCH /api/sessions` 仍保留为旧路径别名，当前前端使用语义更清楚的 `/api/sessions/lead`。

### 3. 恢复测评进度

`GET /api/assessment?sessionId=...`

空进度响应：

```json
{
  "sessionId": "uuid",
  "healthDataConsent": false,
  "assessment": null,
  "step": 0,
  "completed": false,
  "version": 0
}
```

### 4. 分步保存测评数据

`PATCH /api/assessment`

`version` 可选；传入时用于乐观并发控制，防止旧页面覆盖新数据。

```json
{
  "sessionId": "uuid",
  "step": 3,
  "version": 2,
  "data": {
    "heightCm": 165,
    "weightKg": 72,
    "targetWeightKg": 62
  }
}
```

### 5. 提交测评并生成结果

`POST /api/assessment/submit`

```json
{
  "sessionId": "uuid"
}
```

接口会在服务端计算 BMI、BMI 分类、建议摄入量、目标日期，并把结果写入 `results` 表。

### 6. 查询结果

`GET /api/results?sessionId=...`

非会员只返回安全预览，不返回精确热量、目标日期和完整计划：

```json
{
  "subscriptionStatus": "free",
  "needPaywall": true,
  "result": {
    "bmi": 26.4,
    "bmiCategory": "overweight",
    "recommendedCaloriesRange": "<1500",
    "planPreview": []
  },
  "lockedFields": ["recommendedCalories", "targetDate"],
  "lockedSections": ["weeklyWorkoutPlan", "nutritionPlan", "recoveryPlan", "dailyActions"]
}
```

已支付会员返回完整结果：

```json
{
  "subscriptionStatus": "active",
  "needPaywall": false,
  "result": {
    "bmi": 26.4,
    "bmiCategory": "overweight",
    "recommendedCalories": 1467,
    "targetDate": "2026-09-22T00:00:00.000Z",
    "plan": {
      "summary": {},
      "sections": []
    }
  }
}
```

### 7. 模拟支付回调

`POST /api/pay`

这个接口模拟支付成功后的 webhook / callback。它会把 `users.subscriptionStatus` 更新为 `active`，并 upsert `subscriptions` 表中的订阅记录。

```json
{
  "sessionId": "uuid",
  "plan": "monthly"
}
```

## 六、可重放后端流程

下面这段 cURL 可以从创建 session 一直跑到支付解锁。

```bash
BASE="https://health-funnel.vercel.app"
# 本地调试时可改成：
# BASE="http://localhost:3000"

SESSION_ID=$(curl -sS -X POST "$BASE/api/sessions" \
  -H "content-type: application/json" \
  --data '{}' | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessionId')

curl -sS -X PATCH "$BASE/api/assessment" \
  -H "content-type: application/json" \
  --data "{
    \"sessionId\":\"$SESSION_ID\",
    \"step\":10,
    \"data\":{
      \"gender\":\"female\",
      \"goal\":\"lose_weight\",
      \"age\":32,
      \"heightCm\":165,
      \"weightKg\":72,
      \"targetWeightKg\":62,
      \"activityLevel\":\"light\",
      \"pacePreference\":\"standard\",
      \"workoutDaysPerWeek\":4,
      \"sessionMinutes\":30,
      \"workoutLocation\":\"home\",
      \"dietPreference\":\"high_protein\",
      \"sleepHours\":6.5,
      \"stressLevel\":\"medium\",
      \"mainBarrier\":\"no_time\",
      \"healthDataConsent\":true
    }
  }"

curl -sS -X POST "$BASE/api/assessment/submit" \
  -H "content-type: application/json" \
  --data "{\"sessionId\":\"$SESSION_ID\"}"

echo "支付前："
curl -sS "$BASE/api/results?sessionId=$SESSION_ID"

curl -sS -X POST "$BASE/api/pay" \
  -H "content-type: application/json" \
  --data "{\"sessionId\":\"$SESSION_ID\",\"plan\":\"monthly\"}"

echo "支付后："
curl -sS "$BASE/api/results?sessionId=$SESSION_ID"
```

已支付测试 session 可直接查看：

```bash
curl -sS "https://health-funnel.vercel.app/api/results?sessionId=80e14ffa-dd7d-41fc-8406-d43fc2258e5e"
```

## 七、数据库 Schema 图

```mermaid
erDiagram
  users ||--o| assessments : has
  users ||--o| results : has
  users ||--o| subscriptions : has

  users {
    uuid id PK
    datetime createdAt
    string name
    string email
    enum subscriptionStatus
    boolean healthDataConsent
  }

  assessments {
    uuid id PK
    uuid userId FK
    enum gender
    enum goal
    int age
    float heightCm
    float weightKg
    float targetWeightKg
    enum activityLevel
    enum pacePreference
    int workoutDaysPerWeek
    int sessionMinutes
    enum workoutLocation
    enum dietPreference
    float sleepHours
    enum stressLevel
    enum mainBarrier
    int step
    boolean completed
    int version
    datetime createdAt
    datetime updatedAt
  }

  results {
    uuid id PK
    uuid userId FK
    float bmi
    enum bmiCategory
    int recommendedCalories
    datetime targetDate
    datetime createdAt
    datetime updatedAt
  }

  subscriptions {
    uuid id PK
    uuid userId FK
    enum status
    string plan
    datetime paidAt
    datetime createdAt
  }
```

设计说明：

- `users` 是匿名会话主体，`id` 即前端使用的 `sessionId`。
- `assessments` 保存分步问卷、进度、完成状态和并发版本。
- `results` 保存服务端计算结果，避免每次进入结果页都重新计算。
- `subscriptions` 保存当前模拟订阅快照。
- `users.subscriptionStatus` 是结果查询时的快速鉴权状态。
- 当前只支持公制输入：`heightCm` 和 `weightKg`。

## 八、测试覆盖范围

测试目标是证明前三阶段真的成立，而不是只证明页面能点通。

| 要求 | 覆盖位置 |
|---|---|
| 健康算法单元测试 | `lib/health.test.ts` |
| BMI 分类边界 | `classifies_bmi_boundaries` |
| 极端合法年龄 / 身高 / 体重 | `accepts_min_max_valid_health_inputs` |
| 缺失健康字段 | `rejects_missing_runtime_health_fields` |
| 非法身高 / 体重 / 年龄 / 目标体重 | `rejects_invalid_health_inputs` |
| 不合理目标 BMI | `rejects_unreasonable_target_bmi` |
| 分步保存和进度恢复 | `tests/api/assessment.test.ts` |
| 中断后恢复 | `restores_progress_after_partial_patch` |
| 重复提交 / 同一步重复保存 | `deduplicates_repeated_patch_for_same_step` |
| 乱序更新 | `does_not_regress_step_on_out_of_order_patch` |
| 并发 stale version | `rejects_stale_concurrent_patch` |
| 非法 sessionId 提前拒绝 | `rejects_malformed_session_id_before_database_lookup` 等 |
| 非法数值注入 | `rejects_numeric_injection_and_null_numeric_values` |
| enum / range 校验 | `rejects_invalid_extended_questionnaire_values` |
| submit 缺必填字段 | `rejects_missing_required_health_fields` |
| 结果持久化 | `creates_result_for_complete_assessment` |
| 重复 submit 更新同一份结果 | `updates_existing_result_on_repeat_submit` |
| 未生成结果时访问结果页 | `returns_assessment_not_submitted_before_result_exists` |
| 非会员 vs 会员差异化返回 | `free_result_response_omits_all_protected_keys`、`unlocks_full_result_after_pay_for_same_session` |
| `/api/pay` 状态变化 | `unlocks_full_result_after_pay_for_same_session` |
| `/api/pay` 幂等 | `keeps_pay_idempotent_for_active_session` |
| 报告后保存姓名 / 邮箱 | `tests/api/sessions.test.ts` |
| lead 路径语义 | `persists_lead_contact_through_semantic_lead_alias` |
| 非法邮箱 | `rejects_invalid_lead_email` |
| 首次访问不显示重新开始入口 | `lib/landing-state.test.ts` |

暂未覆盖：

- `npm test` 暂未包含完整浏览器 E2E；页面流程已用 Playwright CLI 做过本地 smoke。
- 真实支付 provider 未覆盖，因为本题实现的是模拟 `/api/pay`。
- 未做 Vercel serverless 压测；关键 `/api/pay` 线上链路已手动验证。

## 九、AI 使用复盘

AI 复盘没有直接塞进 README，单独整理在仓库文件：[AI使用复盘.md](./AI使用复盘.md)。

复盘里包含：

- 如何用 AI 读取并分析 BetterMe 竞品数据流
- 如何基于竞品做取舍，而不是 1:1 复制
- 如何用 AI 辅助数据库建模、Mock 数据、健康算法、计划生成和测试用例设计
- 哪些方案被人工判断后否决或修正，以及原因
