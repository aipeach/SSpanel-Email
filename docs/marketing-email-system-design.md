# SSPanel 邮件系统设计文档

## 1. 文档说明

本文档描述当前仓库中已经实现的 SSPanel 邮件系统，包括：
- 管理员登录与会话鉴权
- SSPanel 用户筛选与任务化发信
- SendGrid / Resend / SMTP 发件
- 异步队列发送
- 发送日志查询

本文档不包含产品预研、待确认项和里程碑计划，仅记录现状。

## 2. 系统目标

系统用于面向 SSPanel 用户进行邮件发送管理，提供两条发送路径：
- 任务发送：先筛选收件人，创建任务，再异步队列发送。
- 直接发送：对一个或多个邮箱立即发送。

核心要求：
- 所有后台能力需要登录。
- 收件人数据源来自 SSPanel 的 MySQL `user` 表。
- 发信通道支持 SendGrid、Resend、SMTP。
- 支持可追踪的发送记录和筛选回溯。

## 3. 技术架构

- 框架：Next.js App Router + TypeScript
- UI：Tailwind CSS + shadcn/ui
- MySQL 访问：`mysql2/promise`
- 邮件发送：`@sendgrid/mail`、Resend API、`nodemailer`（SMTP）
- 参数校验：`zod`
- 会话签名：`jose`
- 队列存储：SQLite（Node 内置 `node:sqlite`）

存储分层：
- SSPanel MySQL：`user`（只读）
- 系统 MySQL：任务、收件人发送结果、直接发送日志
- 系统 SQLite：异步队列作业与队列项

## 4. 配置项

系统通过环境变量读取配置：

- 管理员登录
  - `ADMIN_PASSWORD_HASH`（优先，SHA-256）
  - `ADMIN_PASSWORD`（仅当未配置 hash 时使用）
- 会话
  - `SESSION_SECRET`（至少 32 位）
- MySQL
  - `MYSQL_HOST`
  - `MYSQL_PORT`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`
  - `MYSQL_DATABASE`
  - `MYSQL_TIMEZONE`（默认 `+08:00`）
- SendGrid
  - `SENDGRID_API_KEY`
  - `SENDGRID_FROM_EMAIL`
  - `SENDGRID_FROM_NAME`
- Resend
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `RESEND_FROM_NAME`
- SMTP
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM_EMAIL`
  - `SMTP_FROM_NAME`
- 异步队列
  - `QUEUE_SQLITE_PATH`
  - `DEFAULT_SEND_RATE_PER_MINUTE`
  - `DEFAULT_MAIL_PROVIDER`（`sendgrid` / `resend` / `smtp`）

## 5. 鉴权与访问控制

### 5.1 登录

- `POST /api/auth/login` 校验管理员密码。
- 成功后写入 `HttpOnly` 会话 Cookie：`sspanel_email_session`。
- 会话有效期 12 小时。

### 5.2 路由保护

`proxy.ts` 统一执行鉴权：
- 公开路径仅允许：`/login`、`/api/auth/login`。
- 其余页面未登录时重定向到 `/login`。
- 其余 API 未登录时返回 `401`。

## 6. 页面结构

- `/login`：管理员登录
- `/dashboard`：高级用户筛选 + 高级表格
- `/campaigns`：任务列表
- `/campaigns/new`：创建任务 / 编辑草稿任务
- `/campaigns/[id]`：任务详情、开始发送、停止发送、删除任务
- `/direct-send`：直接发送（支持多邮箱）
- `/logs`：发送日志查询
- `/connection-status`：数据库连接状态

侧边栏统一入口：用户概览、任务列表、创建任务、直接发送、发送日志、连接状态。

## 7. 数据模型

## 7.1 MySQL：`marketing_campaign`

用途：任务主表。

关键字段：
- `subject`
- `html_content`
- `text_content`
- `filter_json`（保存筛选快照）
- `recipient_count`
- `status`
- `error_message`
- `created_at` / `started_at` / `finished_at`

任务状态：
- `draft`
- `sending`
- `done`
- `failed`
- `partial`
- `stopped`

说明：运行时会自动执行 `ALTER TABLE`，将状态枚举扩展为包含 `stopped`。

## 7.2 MySQL：`marketing_campaign_recipient`

用途：任务下每个收件人的发送结果。

关键字段：
- `campaign_id`
- `user_id`
- `email`
- `user_name`
- `send_status`（`pending` / `success` / `failed`）
- `provider_message_id`
- `error_message`
- `sent_at`

## 7.3 MySQL：`direct_send_log`

用途：直接发送日志。

关键字段：
- `to_email`
- `user_name`
- `subject`
- `content_format`（`html` / `markdown`）
- `send_status`（`success` / `failed`）
- `provider_message_id`
- `error_message`
- `created_at`

## 7.4 SQLite：`email_queue_job` / `email_queue_item`

用途：异步队列。

`email_queue_job`：
- 任务队列作业级信息（速率、总数、成功数、失败数、状态）
- `stop_requested` 用于手动停止

`email_queue_item`：
- 单条发送项（对应 `marketing_campaign_recipient`）
- 状态：`pending` / `success` / `failed`

## 8. 收件人筛选能力

筛选统一在服务端构造 SQL，参数化查询执行。

支持字段：
- 用户标识：`userIdsCsv`
- 注册时间：
  - `regDateFrom` / `regDateTo`
  - `regRecentDays`（近 N 天）
- 历史流量：
  - `lastDayTMin`
  - `lastDayTMax`
- 等级：`classesCsv`
- 等级到期：
  - `classExpireMode=expired`
  - `classExpireMode=not_expired`
  - `classExpireMode=range` + `classExpireFrom/classExpireTo`
  - `classExpireMode=more_than_days` + `classExpireDays`
  - `classExpireMode=less_than_days` + `classExpireDays`
- 节点分组：`nodeGroupsCsv`
- 管理员：`includeAdmin`
- 账号状态：`enable`（`enabled` / `disabled` / `all`）

默认行为：
- `includeAdmin=false`（默认排除管理员）
- `enable=enabled`（默认仅启用用户）
- 自动过滤无效邮箱并按邮箱去重

UI 侧流量单位：
- 最小值和最大值支持 `B / MB / GB`
- 默认单位为 `MB`
- 提交前自动转换为字节

## 9. 发送流程

## 9.1 任务发送（异步）

1. 创建任务时写入 `marketing_campaign`，并生成 `marketing_campaign_recipient`（初始 `pending`）。
2. `POST /api/campaigns/:id/send` 创建或复用 SQLite 队列作业。
3. Worker 按速率发送，每封回写 MySQL 与 SQLite 状态。
4. 根据统计更新任务最终状态：`done / failed / partial / stopped`。

速率规则：
- 默认读取 `DEFAULT_SEND_RATE_PER_MINUTE`
- 单次发送可覆盖默认速率
- 范围限制：`1` 到 `100000`（封/分钟）

停止规则：
- `POST /api/campaigns/:id/stop` 将队列作业标记 `stop_requested=1`
- Worker 在循环中检测停止标记并终止
- 任务状态写为 `stopped`

草稿管理：
- `PATCH /api/campaigns/:id` 仅允许编辑 `draft`
- `DELETE /api/campaigns/:id` 仅允许删除 `draft`

## 9.2 直接发送（同步）

- `POST /api/direct-send`
- 支持 HTML / Markdown
- 支持 `{{user_name}}` 变量替换
- `userName` 为空时使用邮箱前缀
- 成功和失败都会写入 `direct_send_log`

## 10. 日志模型与查询

日志页 `/logs` 汇总两类来源：
- `campaign`：来自 `marketing_campaign_recipient` 的已发送记录
- `direct`：来自 `direct_send_log`

查询接口：`POST /api/logs`
- 支持来源筛选：`all / campaign / direct`
- 支持状态筛选：`all / success / failed`
- 支持邮箱模糊筛选
- 支持条数限制

## 11. 用户概览高级表格

接口：`POST /api/users/overview`

能力：
- 高级筛选（与任务筛选同源）
- 表内二次筛选（ID、用户名、邮箱、class、node_group、enable、is_admin）
- 分页（20 / 50 / 100）
- 排序（列级升序/降序，后端白名单字段）

可排序字段：
- `id`
- `user_name`
- `email`
- `reg_date`
- `last_day_t`
- `class`
- `class_expire`
- `node_group`
- `is_admin`
- `enable`

## 12. API 清单

鉴权：
- `POST /api/auth/login`
- `POST /api/auth/logout`

用户与筛选：
- `POST /api/users/overview`
- `POST /api/recipients/preview`

任务：
- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:id`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`
- `POST /api/campaigns/:id/send`
- `POST /api/campaigns/:id/stop`

直接发送与日志：
- `POST /api/direct-send`
- `POST /api/logs`

## 13. 安全设计

- 所有私有 API 需会话鉴权。
- 管理员密码优先使用 SHA-256 hash 校验。
- 所有筛选查询使用参数化 SQL。
- 排序字段使用白名单映射，避免 SQL 注入。
- 敏感配置仅从环境变量读取，不入库。

## 14. 运行与初始化说明

- 系统会在运行时自动创建/迁移业务表（`CREATE TABLE IF NOT EXISTS` + 必要 `ALTER`）。
- 首次运行前仍建议先执行 `db/schema.sql` 初始化基础表结构。
- SQLite 队列文件路径由 `QUEUE_SQLITE_PATH` 控制。
