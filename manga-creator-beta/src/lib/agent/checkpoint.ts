import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Use the same DB path as the main application to keep data together, 
// or use a separate one if strict isolation is preferred.
// PRD suggested data/app.db, existing code uses data/manga-creator.db
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'manga-creator.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create a new connection for the checkpointer
const db = new Database(DB_PATH);

// Initialize the SQLite checkpointer
// This will automatically create the necessary tables (checkpoints, checkpoint_blobs, checkpoint_writes, etc.)
export const checkpointer = new SqliteSaver(db);
