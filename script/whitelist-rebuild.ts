import { PrismaClient } from '@prisma/client';
import { MerkleTree } from 'merkletreejs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import keccak256 = require('keccak256');

const prisma = new PrismaClient();

function buildTree(addresses: string[]) {
  const leaves = addresses.map((addr) =>
    keccak256(Buffer.from(addr.slice(2), 'hex')),
  );
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = '0x' + tree.getRoot().toString('hex');
  return { tree, root };
}

async function main() {
  const tokenId = Number(process.argv[2]) || 1;
  const sourceArg = process.argv[3];
  const envSources = process.env.WHITELIST_SOURCES;
  const sources: string[] | undefined =
    sourceArg || envSources
      ? (sourceArg || envSources)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const entries = await prisma.whitelistEntry.findMany({
    where: {
      token_ids: { has: tokenId },
      ...(sources && sources.length ? { source: { in: sources } } : {}),
    },
    select: { address: true },
    orderBy: { address: 'asc' },
  });
  if (!entries.length) {
    console.log('No entries for tokenId', tokenId);
    return;
  }
  const addrs = Array.from(new Set(entries.map((e) => e.address))).sort(
    (a, b) => a.localeCompare(b),
  );
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
