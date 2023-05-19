ALTER TABLE "EIPs" ADD COLUMN title_ts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', title)) STORED;
ALTER TABLE "EIPs" ADD COLUMN content_ts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX title_index ON "EIPs" USING GIN (title_ts);
CREATE INDEX content_index ON "EIPs" USING GIN (content_ts);
