<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# health-funnel — Codex 工作指南

## 项目定位

这是睿迄科技全栈挑战项目：健康测评 funnel 的后端骨架、数据持久化、模拟订阅闭环和自动化测试。

后续分工：

- Codex：主要执行者，负责实现、测试、验证、README 和交付物整理。
- Claude：审核者，只做设计/代码/测试审查，不作为主要实现者。
- 用户：工程决策者，负责拍板 API、字段、脱敏边界、部署账号和最终验收。

## 必读上下文

开始任何实现前，先读：

- `CLAUDE.md`
- `prisma/schema.prisma`
- `package.json`
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Brain/Wiki/Self/Job/睿迄科技-全栈开发 3 天挑战/任务描述.md`
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Brain/Wiki/Self/Job/睿迄科技-全栈开发 3 天挑战/技术设计书.md`
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Brain/Wiki/Self/Job/睿迄科技-全栈开发 3 天挑战/竞品数据流分析.md`

## 技术栈事实

- Next.js 16.2.9 App Router
- React 19.2.4
- TypeScript 5
- Prisma 7.8
- Supabase PostgreSQL
- Zod 4
- Vitest 4
- Vercel + GitHub Actions

不要按旧版 Next.js / Prisma / Zod 记忆写代码。涉及框架 API 时，优先看当前项目依赖和 `node_modules/next/dist/docs/`。

## 实现原则

- 先按 `技术设计书.md` 做，不临时发明新架构。
- 保持轻量，不做真实登录、不接真实 Stripe、不 1:1 复刻 BetterMe。
- 核心健康算法放在纯函数里，不依赖数据库，方便单测。
- API 入参必须经过 Zod 校验。
- 每步保存用后端持久化，不能只靠 localStorage。
- 非会员结果必须脱敏，不能返回受保护字段。
- `/api/pay` 是模拟支付回调，更新用户订阅状态后结果接口要从脱敏变完整。
- 不提交 `.env`、数据库连接串、真实密钥。

## 子智能体使用

适合使用子智能体的场景：

- 并行审设计、API、DB、测试覆盖。
- 分块实现互不重叠的代码。
- 最终 review 查漏项。

实现阶段推荐分工：

- Worker A：`lib/health.ts`、`lib/health.test.ts`
- Worker B：`app/api/sessions/route.ts`、`app/api/assessment/route.ts`
- Worker C：`app/api/assessment/submit/route.ts`、`app/api/results/route.ts`、`app/api/pay/route.ts`

主 agent 负责公共契约和集成：

- `lib/prisma.ts`
- `lib/validation.ts`
- `lib/errors.ts`
- `vitest.config.ts`
- `package.json`
- `README.md`

多个 worker 不要改同一批文件。

## 测试要求

测试不是加分项，是基本盘。至少覆盖：

- 健康算法边界：极端、缺失、非法身高体重年龄、目标体重不合理。
- 分步保存和恢复：中断恢复、乱序提交、重复提交、并发版本冲突。
- 鉴权差异化：非会员响应不包含 `targetDate` 和精确 `recommendedCalories`。
- `/api/pay` 闭环：支付前脱敏，支付后完整。
- 数据验证：非法 enum、越界数字、字符串注入、缺 sessionId。

`package.json` 必须提供：

```bash
npm test
```

交付前至少跑：

```bash
npm test
npm run build
```

如果改了 schema，还要确认：

```bash
npx prisma generate
```

## 文档与交付

README 必须包含：

- 项目简介和线上 URL
- 本地启动方式
- API 文档：路径、方法、请求、响应
- `/api/pay` cURL
- 已支付测试 sessionId
- 测试运行方式
- 测试覆盖了什么、为什么覆盖这些、哪些没覆盖及原因
- Schema 图或链接
- AI 使用复盘

AI 复盘必须包含：

- 如何用 AI 做竞品数据流分析
- 如何用 AI 辅助 DB 建模
- 如何用 AI 生成 Mock 数据和测试数据
- 如何用 AI 处理健康算法和复杂逻辑
- 如何用 AI 生成测试用例和边界场景
- 至少一次否决 AI 方案或测试的例子和原因

## 沟通规则

- 默认中文回复。
- 用户明确说“不改资料/只问问题”时，只回答，不写文件。
- 做代码任务时主动执行到验证完成；无法验证要说明原因。
- 不做无关重构，不扩大 scope。
- 发现 `CLAUDE.md` 和 `技术设计书.md` 冲突时，以 `技术设计书.md` 为当前实现准绳，并在回复里说明冲突点。
