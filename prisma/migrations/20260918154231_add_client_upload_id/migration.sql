-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "clientUploadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_businessId_clientUploadId_key" ON "Receipt"("businessId", "clientUploadId");

