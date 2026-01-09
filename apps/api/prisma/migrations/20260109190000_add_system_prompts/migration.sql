-- CreateTable
CREATE TABLE "SystemPrompt" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemPrompt_teamId_updatedAt_idx" ON "SystemPrompt"("teamId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemPrompt_teamId_key_key" ON "SystemPrompt"("teamId", "key");

-- AddForeignKey
ALTER TABLE "SystemPrompt" ADD CONSTRAINT "SystemPrompt_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

