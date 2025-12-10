import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// 数据库文件路径
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'manga-creator.db');

// 确保数据目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建 SQLite 连接
const sqlite = new Database(DB_PATH);

// 启用外键约束
sqlite.pragma('foreign_keys = ON');

// 创建 Drizzle ORM 实例
export const db = drizzle(sqlite, { schema });

// 导出 schema
export * from './schema';

/**
 * 初始化数据库表
 */
export function initializeDatabase(): void {
  // 创建项目表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      art_style TEXT NOT NULL DEFAULT '',
      protagonist TEXT NOT NULL DEFAULT '',
      workflow_state TEXT NOT NULL DEFAULT 'IDLE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 创建分镜表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      scene_description TEXT,
      keyframe_prompt TEXT,
      spatial_prompt TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 创建角色表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      portrait_prompt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

// 关闭数据库连接
export function closeDatabase(): void {
  sqlite.close();
}
