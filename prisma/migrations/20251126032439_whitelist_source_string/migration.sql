-- Change WhitelistEntry.source from enum to text to store raw source strings from input
ALTER TABLE "WhitelistEntry" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "WhitelistEntry" ALTER COLUMN "source" DROP NOT NULL;
ALTER TABLE "WhitelistEntry" ALTER COLUMN "source" TYPE TEXT USING "source"::text;

-- Remove old enum type if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhitelistSource') THEN
    DROP TYPE "WhitelistSource";
  END IF;
END $$;
