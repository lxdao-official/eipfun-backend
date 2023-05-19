ALTER TABLE EIPs ADD COLUMN eip_ts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', eip)) STORED;
CREATE INDEX ts_idx ON EIPs USING GIN (eip);

SELECT eip, title
FROM "EIPs"
WHERE eip_ts @@ to_tsquery('english','20')
