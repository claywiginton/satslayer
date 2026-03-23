-- SATSLAYER v2: Drop old tables and create new schema
-- Run this in Supabase SQL Editor

-- Drop old tables if they exist
DROP TABLE IF EXISTS daily_challenges CASCADE;

-- Day logs: tracks which habits were completed each day
CREATE TABLE IF NOT EXISTS day_logs (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  steps BOOLEAN NOT NULL DEFAULT FALSE,
  workout BOOLEAN NOT NULL DEFAULT FALSE,
  calories BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sats log: every sat earned, for accurate totals
CREATE TABLE IF NOT EXISTS sats_log (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  habit TEXT NOT NULL,
  sats INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weigh-ins table stays the same (already created in v1)
-- If it doesn't exist, create it:
CREATE TABLE IF NOT EXISTS weigh_ins (
  id SERIAL PRIMARY KEY,
  week_number INTEGER UNIQUE NOT NULL,
  date DATE NOT NULL,
  weight NUMERIC NOT NULL,
  previous_weight NUMERIC NOT NULL,
  change NUMERIC NOT NULL,
  sats_earned INTEGER NOT NULL DEFAULT 0,
  milestones_hit TEXT[] DEFAULT '{}',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE day_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sats_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_ins ENABLE ROW LEVEL SECURITY;

-- Open policies (single-user app)
DO $$ BEGIN
  CREATE POLICY "Allow all day_logs" ON day_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all sats_log" ON sats_log FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all weigh_ins" ON weigh_ins FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
