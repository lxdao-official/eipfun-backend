-- CreateEnum
CREATE TYPE "WhitelistSource" AS ENUM ('community', 'partner', 'campaign', 'manual', 'other');

-- CreateTable
CREATE TABLE "WhitelistEntry" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "token_ids" INTEGER[],
    "source" "WhitelistSource" NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhitelistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerkleRoot" (
    "id" SERIAL NOT NULL,
    "token_id" INTEGER NOT NULL,
    "root" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerkleRoot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistEntry_address_key" ON "WhitelistEntry"("address");

-- CreateIndex
CREATE UNIQUE INDEX "MerkleRoot_token_id_key" ON "MerkleRoot"("token_id");
