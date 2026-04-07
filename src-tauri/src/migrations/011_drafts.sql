CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    account_did TEXT NOT NULL,
    text TEXT NOT NULL,
    reply_parent_uri TEXT,
    reply_parent_cid TEXT,
    reply_root_uri TEXT,
    reply_root_cid TEXT,
    quote_uri TEXT,
    quote_cid TEXT,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_drafts_account_updated ON drafts (account_did, updated_at DESC);
