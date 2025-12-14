-- AlterTable
ALTER TABLE "AIJob" ADD COLUMN "aiProfileId" TEXT;

-- AddForeignKey
ALTER TABLE "AIJob"
ADD CONSTRAINT "AIJob_aiProfileId_fkey"
FOREIGN KEY ("aiProfileId") REFERENCES "AIProfile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;


