import { PrismaClient, WhitelistSource } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import keccak256 = require('keccak256');

const prisma = new PrismaClient();

type InputRow = {
  address: string;
  token_ids: number[];
  source?: keyof typeof WhitelistSource;
  note?: string;
};

function normalizeAddress(address: string): string | null {
  if (!address || typeof address !== 'string') return null;
  const lower = address.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lower) ? lower : null;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: ts-node script/whitelist-import.ts <path-to-json>');
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const raw = fs.readFileSync(abs, 'utf8');
  const rows: InputRow[] = JSON.parse(raw);

  const seen: Record<string, Set<number>> = {};

  for (const row of rows) {
    const addr = normalizeAddress(row.address);
    if (!addr) {
      console.warn('Skip invalid address:', row.address);
      continue;
    }
    if (!row.token_ids || row.token_ids.length === 0) {
      console.warn('Skip without token_ids:', row.address);
      continue;
    }
    if (!seen[addr]) seen[addr] = new Set();
    row.token_ids.forEach((id) => seen[addr].add(id));
    const source = row.source && WhitelistSource[row.source] ? row.source : 'manual';
    await prisma.whitelistEntry.upsert({
      where: { address: addr },
      update: {
        token_ids: Array.from(seen[addr]),
        source: source as WhitelistSource,
        note: row.note,
      },
      create: {
        address: addr,
        token_ids: Array.from(seen[addr]),
        source: source as WhitelistSource,
        note: row.note,
      },
    });
  }

  console.log('Import done. Total addresses:', Object.keys(seen).length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
