-- CreateEnum
CREATE TYPE "EIPType" AS ENUM ('Standards Track', 'Meta', 'Informational');

-- CreateEnum
CREATE TYPE "EIPCategory" AS ENUM ('Core', 'Networking', 'Interface', 'ERC');

-- CreateEnum
CREATE TYPE "EIPStatus" AS ENUM ('Idea', 'Draft', 'Review', 'Last Call', 'Final', 'Stagnant', 'Withdrawn', 'Living');

-- CreateTable
CREATE TABLE "EmailSubscribe" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EIPs" (
    "id" SERIAL NOT NULL,
    "eip" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT NOT NULL,
    "discussions_to" TEXT,
    "status" "EIPStatus" NOT NULL,
    "type" "EIPType" NOT NULL,
    "category" "EIPCategory",
    "created" TIMESTAMP(3) NOT NULL,
    "requires" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "last_call_deadline" TIMESTAMP(3),
    "withdrawal_reason" TEXT,
    "content" TEXT,
    "extension_sub_title" TEXT,
    "extension_short_read" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "EIPs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscribe_address_key" ON "EmailSubscribe"("address");

-- CreateIndex
CREATE UNIQUE INDEX "EIPs_eip_key" ON "EIPs"("eip");
