import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

type InputRow = {
  address: string;
  token_ids: number[];
  source?: string;
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

  console.log(`Loaded ${rows.length} rows from ${file}. Aggregating...`);

  // Aggregate once to avoid 400k individual DB trips
  const aggregated: Record<
    string,
    { tokenIds: Set<number>; source: string | null; note?: string }
  > = {};

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
    const source = row.source ? String(row.source) : null;
    if (!aggregated[addr]) {
      aggregated[addr] = { tokenIds: new Set<number>(), source, note: row.note };
    }
    row.token_ids.forEach((id) => aggregated[addr].tokenIds.add(Number(id)));
    // keep the first non-empty note and first non-empty source
    if (row.note && !aggregated[addr].note) aggregated[addr].note = row.note;
    if (source && !aggregated[addr].source) aggregated[addr].source = source;
  }

  const entries = Object.entries(aggregated).map(([address, data]) => ({
    address,
    tokenIds: Array.from(data.tokenIds).filter((n) => Number.isFinite(n)).sort((a, b) => a - b),
    source: data.source,
    note: data.note ?? null,
  }));

  console.log(`Aggregated to ${entries.length} unique addresses. Writing to DB...`);

  // Use raw bulk UPSERT to avoid 400k individual Prisma calls
  const chunkSize = 2000;
  const now = Prisma.raw('NOW()');
  for (let i = 0; i < entries.length; i += chunkSize) {
    const slice = entries.slice(i, i + chunkSize);
    const values = slice.map((entry) =>
      Prisma.sql`(${entry.address}, ${entry.tokenIds}, ${entry.source}, ${entry.note}, ${now})`
    );

    await prisma.$executeRaw`
      INSERT INTO "WhitelistEntry" ("address", "token_ids", "source", "note", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("address") DO UPDATE SET
        "token_ids" = EXCLUDED."token_ids",
        "source" = EXCLUDED."source",
        "note" = EXCLUDED."note",
        "updatedAt" = NOW()
    `;

    const processed = Math.min(i + chunkSize, entries.length);
    if (processed % 5000 === 0 || processed === entries.length) {
      console.log(`Processed ${processed} / ${entries.length}`);
    }
  }

  console.log('Import done. Total addresses:', entries.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
