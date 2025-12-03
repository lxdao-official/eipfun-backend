# EIPFun Backend

NestJS + Prisma/PostgreSQL backend for EIPFun. It serves Ethereum Improvement Proposal (EIP/ ERC) content, manages NFT whitelist data, produces Merkle proofs for minting, and handles email subscriptions.

## Stack

- Node.js / TypeScript / NestJS
- PostgreSQL with Prisma ORM (plus a light TypeORM read path)
- Mailchimp for email subscriptions
- `merkletreejs` + `keccak256` for whitelist proofs

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Start the database (PostgreSQL 15)

```bash
cd service
docker-compose up -d
```

3. Configure environment (see below), then migrate & generate the Prisma client

```bash
cp .env.example .env    # if you keep one; otherwise create .env manually
npm run migrate:dev
npm run generate
```

4. Run the API

```bash
npm run start:dev   # or: npm run start
```

## Database Tasks

- Migrate dev schema: `npm run migrate:dev`
- Generate Prisma client: `npm run generate`
- Start DB locally: `cd service && docker-compose up -d`

## Whitelist Management

- Import whitelist JSON into the database:
  `npm run whitelist:import -- <path-to-json>`
- Set environment variables for whitelist sources
- Rebuild Merkle root for a token (deterministic ordering):
  `npm run whitelist:rebuild -- <tokenId>`
  The resulting root is stored in `MerkleRoot` and cached in-memory.

## EIP/ ERC Data

- Download latest EIPs: `GET /download/eips`
- Download latest ERCs: `GET /download/ercs`
- Refresh stored data: `GET /eips/update`

## Key API Endpoints

- `GET /eips/list` — list EIPs with pagination and optional filters (`type`, `category`, `status`, `page`, `per_page`)
- `GET /eips/search?content=...` — search EIPs by content/title/author
- `GET /nft/isWhiteAddress?address=0x...&tokenId=1` — check whitelist membership
- `GET /nft/getAddressProof?address=0x...&tokenId=1` — Merkle proof + root for a wallet
- `GET /nft/merkleRoot?tokenId=1` — current Merkle root for a token
- `POST /email/subscribe` — subscribe an email (`{ address: "name@example.com" }`)

All routes are exposed from `src/app.controller.ts` and implemented in `src/app.service.ts`.

## Development Scripts

- Lint: `npm run lint`
- Test: `npm run test` (unit), `npm run test:e2e`
- Build: `npm run build` (runs Prisma generate, then Nest build)

## Notes

- Whitelist proof generation uses sorted pair hashing (`sortPairs: true`) and deterministic address ordering to keep Merkle roots stable across runs.
- `WHITELIST_SOURCES` can restrict both API lookups and rebuild scripts to a subset of sources.
