-- AlterEnum: EpisodeWorkflowState
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'EpisodeWorkflowState' AND e.enumlabel = 'SCRIPT_WRITING'
  ) THEN
    ALTER TYPE "EpisodeWorkflowState" ADD VALUE 'SCRIPT_WRITING';
  END IF;
END $$;

-- AlterEnum: SceneStatus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SceneStatus' AND e.enumlabel = 'sound_design_generating'
  ) THEN
    ALTER TYPE "SceneStatus" ADD VALUE 'sound_design_generating';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SceneStatus' AND e.enumlabel = 'sound_design_confirmed'
  ) THEN
    ALTER TYPE "SceneStatus" ADD VALUE 'sound_design_confirmed';
  END IF;
END $$;

-- AlterTable: Episode
ALTER TABLE "Episode"
  ADD COLUMN IF NOT EXISTS "sceneScriptDraft" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "emotionArcJson" JSONB,
  ADD COLUMN IF NOT EXISTS "durationEstimateJson" JSONB;

-- AlterTable: Scene
ALTER TABLE "Scene"
  ADD COLUMN IF NOT EXISTS "sceneScriptJson" JSONB,
  ADD COLUMN IF NOT EXISTS "soundDesignJson" JSONB,
  ADD COLUMN IF NOT EXISTS "transitionInJson" JSONB,
  ADD COLUMN IF NOT EXISTS "transitionOutJson" JSONB,
  ADD COLUMN IF NOT EXISTS "shotLanguageJson" JSONB,
  ADD COLUMN IF NOT EXISTS "durationEstimateJson" JSONB;

-- CreateTable: CharacterRelationship
CREATE TABLE IF NOT EXISTS "CharacterRelationship" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "fromCharacterId" TEXT NOT NULL,
  "toCharacterId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "intensity" INTEGER NOT NULL DEFAULT 5,
  "arc" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CharacterRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterRelationship_projectId_fromCharacterId_toCharacterId_key"
  ON "CharacterRelationship"("projectId", "fromCharacterId", "toCharacterId");

CREATE INDEX IF NOT EXISTS "CharacterRelationship_projectId_idx"
  ON "CharacterRelationship"("projectId");

ALTER TABLE "CharacterRelationship"
  ADD CONSTRAINT "CharacterRelationship_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy Character.relationships json
INSERT INTO "CharacterRelationship" (
  "id",
  "projectId",
  "fromCharacterId",
  "toCharacterId",
  "type",
  "label",
  "description",
  "intensity",
  "arc",
  "updatedAt"
)
SELECT
  CONCAT('rel_', SUBSTRING(md5(c.id || COALESCE(rel->>'targetCharacterId', '') || random()::text) FROM 1 FOR 24)) AS id,
  c."projectId",
  c.id AS "fromCharacterId",
  rel->>'targetCharacterId' AS "toCharacterId",
  COALESCE(NULLIF(rel->>'relationshipType', ''), 'custom') AS type,
  COALESCE(NULLIF(rel->>'relationshipType', ''), 'custom') AS label,
  COALESCE(rel->>'description', '') AS description,
  5 AS intensity,
  '[]'::jsonb AS arc,
  NOW() AS "updatedAt"
FROM "Character" c
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.relationships, '[]'::jsonb)) rel
WHERE rel ? 'targetCharacterId'
  AND COALESCE(rel->>'targetCharacterId', '') <> ''
ON CONFLICT ("projectId", "fromCharacterId", "toCharacterId")
DO UPDATE SET
  "type" = EXCLUDED."type",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();
