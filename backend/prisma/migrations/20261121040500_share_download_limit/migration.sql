-- AlterTable
ALTER TABLE "Share" ADD COLUMN     "downloads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxDownloads" INTEGER;
