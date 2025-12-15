-- Add Episode Planning (V1)

-- 1) Extend ProjectWorkflowState enum (transaction-safe by recreating type)
CREATE TYPE "ProjectWorkflowState_new" AS ENUM (
    'IDLE',
    'DATA_COLLECTING',
    'DATA_COLLECTED',
    'WORLD_VIEW_BUILDING',
    'CHARACTER_MANAGING',
    'EPISODE_PLANNING',
    'EPISODE_PLAN_EDITING',
    'EPISODE_CREATING',
    'SCENE_LIST_GENERATING',
    'SCENE_LIST_EDITING',
    'SCENE_LIST_CONFIRMED',
    'SCENE_PROCESSING',
    'ALL_SCENES_COMPLETE',
    'ALL_EPISODES_COMPLETE',
    'EXPORTING'
);

ALTER TABLE "Project" ALTER COLUMN "workflowState" DROP DEFAULT;
ALTER TABLE "Project"
ALTER COLUMN "workflowState" TYPE "ProjectWorkflowState_new"
USING ("workflowState"::text::"ProjectWorkflowState_new");

DROP TYPE "ProjectWorkflowState";
ALTER TYPE "ProjectWorkflowState_new" RENAME TO "ProjectWorkflowState";

ALTER TABLE "Project" ALTER COLUMN "workflowState" SET DEFAULT 'DATA_COLLECTING';

-- 2) Episode enum + table
CREATE TYPE "EpisodeWorkflowState" AS ENUM (
    'IDLE',
    'CORE_EXPRESSION_READY',
    'SCENE_LIST_EDITING',
    'SCENE_PROCESSING',
    'COMPLETE'
);

CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "outline" JSONB,
    "coreExpression" JSONB,
    "contextCache" JSONB,
    "workflowState" "EpisodeWorkflowState" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Episode_projectId_order_idx" ON "Episode"("projectId", "order");
CREATE UNIQUE INDEX "Episode_projectId_order_key" ON "Episode"("projectId", "order");

ALTER TABLE "Episode" ADD CONSTRAINT "Episode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Scene: add episodeId and backfill (default episode per project)
ALTER TABLE "Scene" ADD COLUMN "episodeId" TEXT;

INSERT INTO "Episode" ("id", "projectId", "order", "title", "summary", "workflowState", "createdAt", "updatedAt")
SELECT
  ('ep_' || "Project"."id" || '_1') AS "id",
  "Project"."id" AS "projectId",
  1 AS "order",
  '' AS "title",
  '' AS "summary",
  'IDLE' AS "workflowState",
  CURRENT_TIMESTAMP AS "createdAt",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM "Project";

UPDATE "Scene"
SET "episodeId" = ('ep_' || "projectId" || '_1')
WHERE "episodeId" IS NULL;

ALTER TABLE "Scene" ALTER COLUMN "episodeId" SET NOT NULL;

ALTER TABLE "Scene" ADD CONSTRAINT "Scene_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace (projectId, order) uniqueness with (episodeId, order)
DROP INDEX "Scene_projectId_order_idx";
DROP INDEX "Scene_projectId_order_key";

CREATE INDEX "Scene_episodeId_order_idx" ON "Scene"("episodeId", "order");
CREATE UNIQUE INDEX "Scene_episodeId_order_key" ON "Scene"("episodeId", "order");
CREATE INDEX "Scene_projectId_episodeId_order_idx" ON "Scene"("projectId", "episodeId", "order");

-- 4) AIJob: add optional episodeId for audit/query
ALTER TABLE "AIJob" ADD COLUMN "episodeId" TEXT;

ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Best-effort backfill for existing scene-related jobs
UPDATE "AIJob" AS j
SET "episodeId" = s."episodeId"
FROM "Scene" AS s
WHERE j."sceneId" IS NOT NULL
  AND j."episodeId" IS NULL
  AND j."sceneId" = s."id";

