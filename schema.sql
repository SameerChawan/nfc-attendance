-- NFC Attendance System Schema
-- Run this in Supabase SQL Editor

-- Competitions
CREATE TABLE IF NOT EXISTS nfc_competitions (
    id BIGSERIAL PRIMARY KEY,
    competition_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    date DATE,
    location TEXT,
    events TEXT[],
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors (per competition)
CREATE TABLE IF NOT EXISTS nfc_competitors (
    id BIGSERIAL PRIMARY KEY,
    competition_id TEXT REFERENCES nfc_competitions(competition_id),
    wca_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_new BOOLEAN DEFAULT false,
    temp_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(competition_id, wca_id)
);

-- NFC Tags (global registry)
CREATE TABLE IF NOT EXISTS nfc_tags (
    tag_uid TEXT PRIMARY KEY,
    competition_id TEXT,
    wca_id TEXT,
    temp_id TEXT,
    assigned_at TIMESTAMPTZ,
    status TEXT DEFAULT 'unassigned'
);

-- Attendance Log
CREATE TABLE IF NOT EXISTS nfc_check_ins (
    id BIGSERIAL PRIMARY KEY,
    competition_id TEXT NOT NULL,
    wca_id TEXT,
    temp_id TEXT,
    competitor_name TEXT,
    tag_uid TEXT,
    event_id TEXT,
    table_number INT,
    check_in_time TIMESTAMPTZ DEFAULT NOW(),
    method TEXT DEFAULT 'nfc'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitors_comp ON nfc_competitors(competition_id);
CREATE INDEX IF NOT EXISTS idx_competitors_wca ON nfc_competitors(wca_id);
CREATE INDEX IF NOT EXISTS idx_tags_comp ON nfc_tags(competition_id);
CREATE INDEX IF NOT EXISTS idx_tags_wca ON nfc_tags(wca_id);
CREATE INDEX IF NOT EXISTS idx_checkins_comp ON nfc_check_ins(competition_id);
CREATE INDEX IF NOT EXISTS idx_checkins_time ON nfc_check_ins(check_in_time);

-- RLS Policies (block anon access)
ALTER TABLE nfc_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY block_anon ON nfc_competitions FOR ALL USING (false);
CREATE POLICY block_anon ON nfc_competitors FOR ALL USING (false);
CREATE POLICY block_anon ON nfc_tags FOR ALL USING (false);
CREATE POLICY block_anon ON nfc_check_ins FOR ALL USING (false);