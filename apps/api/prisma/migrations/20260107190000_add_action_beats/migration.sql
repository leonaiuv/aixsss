-- AlterTable
ALTER TABLE "Scene"
ADD COLUMN     "actionPlanJson" JSONB,
ADD COLUMN     "keyframeGroupsJson" JSONB,
ADD COLUMN     "motionGroupsJson" JSONB;

