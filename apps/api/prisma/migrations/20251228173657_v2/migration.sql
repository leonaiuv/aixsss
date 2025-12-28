-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "castCharacterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "generatedImages" JSONB;
