# SSPanel 邮件系统

基于 Next.js + Tailwind CSS + shadcn/ui + MySQL + SendGrid/Resend/SMTP，实现 SSPanel 用户筛选与邮件发送。

## 功能


## UI 技术栈

- Tailwind CSS
- shadcn/ui（本地组件代码）

- 管理员登录（密码从 `.env` 读取）
- 读取 SSPanel `user` 表作为收件人来源
- 高级筛选：`reg_date`、`last_day_t`、`class`、`class_expire`、`node_group`、`is_admin`、`enable`
- 邮件任务创建、任务列表、任务详情
- SendGrid / Resend / SMTP 异步队列发送（SQLite 持久化队列）+ 发送状态回写
- 直接发送支持多邮箱批量发送，并可在 SendGrid / Resend / SMTP 之间切换
- 前端发件渠道下拉会根据 `.env` 已配置的渠道动态显示（未配置不显示）
- 提供“编辑配置”页面，配置写入 SQLite，读取优先级为 `.env` > SQLite
- 默认发送速率控制，且支持每次发送覆盖速率

## 1. 安装依赖

```bash
npm install --cache ./.npm-cache
```

## 2. 配置环境变量

```bash
cp .env.example .env
```

必要变量：

- `SESSION_SECRET`（至少 32 位）
- `MYSQL_HOST` `MYSQL_PORT` `MYSQL_USER` `MYSQL_PASSWORD` `MYSQL_DATABASE`
- `MYSQL_TIMEZONE`（默认 `+08:00`，用于统一 MySQL 会话时区）
- `SENDGRID_API_KEY` `SENDGRID_FROM_EMAIL` `SENDGRID_FROM_NAME`
- `RESEND_API_KEY` `RESEND_FROM_EMAIL` `RESEND_FROM_NAME`
- `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM_EMAIL` `SMTP_FROM_NAME`
- `QUEUE_SQLITE_PATH`（默认 `./data/email-queue.sqlite`）
- `APP_CONFIG_SQLITE_PATH`（默认 `./data/app-config.sqlite`）
- `DEFAULT_SEND_RATE_PER_MINUTE`（默认 60）
- `DEFAULT_MAIL_PROVIDER`（`sendgrid` / `resend` / `smtp`，默认 `sendgrid`）
- 管理员密码二选一：
  - 推荐：`ADMIN_PASSWORD_HASH`（SHA-256）
  - 临时：`ADMIN_PASSWORD`

生成 SHA-256 hash：

```bash
npm run hash:admin -- your_password
```

将输出结果填入 `.env` 的 `ADMIN_PASSWORD_HASH`。

## 3. 建表（系统业务表）

执行 [db/schema.sql](/Users/hbn/opt/sspanel-Email/db/schema.sql) 中的 SQL。

> 应用也会在运行时自动 `CREATE TABLE IF NOT EXISTS`，手工执行主要用于提前初始化。

## 4. 启动

开发环境：

```bash
npm run dev
```

生产构建：

```bash
npm run build
npm run start
```

## 5. 使用流程

1. 登录 `/login`
2. 打开 `/campaigns/new`
3. 填写主题、HTML 内容和筛选条件
4. 点击“预览收件人”查看人数
5. 点击“保存任务”
6. 进入任务详情页，可选填写“本次速率（封/分钟）”，点击“开始发送”
7. 任务进入 SQLite 异步队列后后台执行；页面会自动刷新发送进度

## 6. 模板变量

邮件主题和正文支持变量：

- `{{user_name}}`

示例：

```html
<h1>你好，{{user_name}}</h1>
<p>感谢使用我们的服务。</p>
```

## 7. 注意事项

- 默认跳过管理员（`is_admin=0`）
- 默认仅发送给启用用户（`enable=1`）
- 发送接口为异步队列执行，任务状态持久化在 SQLite
- 如果单次不填写速率，将使用 `DEFAULT_SEND_RATE_PER_MINUTE`
