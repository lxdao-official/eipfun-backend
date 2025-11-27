import { PrismaClient } from '@prisma/client';
import { MerkleTree } from 'merkletreejs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import keccak256 = require('keccak256');

const prisma = new PrismaClient();

function buildTree(addresses: string[]) {
  const leaves = addresses.map((addr) => keccak256(Buffer.from(addr.slice(2), 'hex')));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = '0x' + tree.getRoot().toString('hex');
  return { tree, root };
}

async function main() {
  const tokenId = Number(process.argv[2]) || 1;
  const entries = await prisma.whitelistEntry.findMany({
    where: { token_ids: { has: tokenId } },
    select: { address: true },
  });
  if (!entries.length) {
    console.log('No entries for tokenId', tokenId);
    return;
  }
  const addrs = entries.map((e) => e.address);
  const { root } = buildTree(addrs);
  await prisma.merkleRoot.upsert({
    where: { token_id: tokenId },
    update: { root },
    create: { token_id: tokenId, root },
  });
  console.log('Rebuilt Merkle root for tokenId', tokenId, 'root:', root);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
