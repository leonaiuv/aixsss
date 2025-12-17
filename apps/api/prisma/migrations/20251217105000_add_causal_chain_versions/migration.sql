-- CreateEnum
CREATE TYPE "NarrativeCausalChainVersionSource" AS ENUM ('ai', 'manual', 'restore');

-- CreateTable
CREATE TABLE "NarrativeCausalChainVersion" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT,
  "source" "NarrativeCausalChainVersionSource" NOT NULL,
  "phase" INTEGER,
  "completedPhase" INTEGER,
  "validationStatus" TEXT,
  "chainSchemaVersion" TEXT,
  "label" TEXT,
  "note" TEXT,
  "basedOnVersionId" TEXT,
  "chain" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NarrativeCausalChainVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NarrativeCausalChainVersion_projectId_createdAt_idx" ON "NarrativeCausalChainVersion"("projectId", "createdAt" DESC);
CREATE INDEX "NarrativeCausalChainVersion_teamId_createdAt_idx" ON "NarrativeCausalChainVersion"("teamId", "createdAt" DESC);
CREATE INDEX "NarrativeCausalChainVersion_userId_idx" ON "NarrativeCausalChainVersion"("userId");

-- AddForeignKey
ALTER TABLE "NarrativeCausalChainVersion" ADD CONSTRAINT "NarrativeCausalChainVersion_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NarrativeCausalChainVersion" ADD CONSTRAINT "NarrativeCausalChainVersion_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NarrativeCausalChainVersion" ADD CONSTRAINT "NarrativeCausalChainVersion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


