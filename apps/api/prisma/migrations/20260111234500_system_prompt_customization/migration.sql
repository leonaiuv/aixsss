-- Add customization flag for system prompts.
ALTER TABLE "SystemPrompt"
ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark rows as customized only if they've been updated after creation.
UPDATE "SystemPrompt"
SET "isCustomized" = ("updatedAt" <> "createdAt");

