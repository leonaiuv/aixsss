-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "briefDescription" TEXT,
    "avatar" TEXT,
    "appearance" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "background" TEXT NOT NULL DEFAULT '',
    "portraitPrompts" JSONB,
    "customStyle" TEXT,
    "relationships" JSONB,
    "appearances" JSONB,
    "themeColor" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldViewElement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldViewElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_projectId_updatedAt_idx" ON "Character"("projectId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "WorldViewElement_projectId_order_idx" ON "WorldViewElement"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "WorldViewElement_projectId_order_key" ON "WorldViewElement"("projectId", "order");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldViewElement" ADD CONSTRAINT "WorldViewElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
