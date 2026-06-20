@AGENTS.md

# health-funnel — Claude Code 工作指南

## 项目背景
睿迄科技全栈挑战交付项目：健康测评 funnel 的**后端骨架 + 自动化测试**。
- 完整实施计划 / 数据库设计 / API 设计 / 时间线见 Brain：
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Brain/Wiki/Self/Job/睿迄科技-全栈开发 3 天挑战/实施计划书.md`
- **ddl：2026-06-22 24:00**

## 技术栈（前沿版本 — 写代码前务必查实际文档，别凭记忆）
- Next.js **16.2.9**（App Router）+ React **19.2.4** + TypeScript 5
- Prisma **7.8**：`datasource.url` 在 `prisma.config.ts`（不在 schema）；generator 是 `prisma-client`，client 输出到 `app/generated/prisma`；靠 `dotenv` 读 `.env`
- Supabase 托管 PostgreSQL
- Zod **4** 做请求校验
- Vitest **4** 做单元 + 集成测试
- 部署：Vercel + GitHub Actions CI

## Do NOT
- ❌ 不凭训练记忆写 Next 16 / Prisma 7 / Zod 4 代码 —— 都是 breaking 新版。写前查 `node_modules/next/dist/docs/` 和官方文档
- ❌ 不把 `.env` / 连接串提交 git（已 gitignore）
- ❌ 不自动启动 `npm run dev` 长跑服务 —— 验收让用户自己起
- ❌ 健康算法不碰数据库 —— 放 `lib/` 纯函数，方便单测
- ❌ 测试不只测 happy path —— 边界 / 异常 / 非法输入必须覆盖（题目硬要求）

## 角色分工
- **Claude Code**：代码作者，端到端实现 + 测试
- **用户（工程师）**：架构 / 字段 / API 命名决策、审查并否决 AI 错误产出、定测试边界、GUI 操作（注册 / 部署）、最终验收

## 关键命令
- `npm run dev` — 本地起服务（用户手动）
- `npx prisma migrate dev` — 建表迁移
- `npx vitest` — 跑测试
