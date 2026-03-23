-- SATSLAYER: Supabase Schema Setup
-- Run this in the SQL Editor at supabase.com

-- Daily challenges completed
CREATE TABLE daily_challenges (
  id SERIAL PRIMARY KEY,
  day_number INTEGER UNIQUE NOT NULL,
  sats_earned INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly weigh-ins
CREATE TABLE weigh_ins (
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

-- Enable RLS with open policies (single-user app)
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all daily_challenges" ON daily_challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all weigh_ins" ON weigh_ins FOR ALL USING (true) WITH CHECK (true);
