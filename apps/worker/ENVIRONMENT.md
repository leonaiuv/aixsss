# Worker 环境变量（本地开发）

在 `apps/worker` 目录下创建 `.env` 文件（不要提交到仓库），至少需要以下变量：

```bash
NODE_ENV=development

# Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aixsss?schema=public

# 与 apps/api 保持一致，用于解密 AIProfile.apiKeyEncrypted
API_KEY_ENCRYPTION_KEY=please_change_me

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379
AI_QUEUE_NAME=ai-jobs

# worker 并发
WORKER_CONCURRENCY=4
```


