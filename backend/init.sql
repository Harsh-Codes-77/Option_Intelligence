-- Institutional Options Intelligence Platform
-- Database Schema

CREATE TABLE IF NOT EXISTS market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  open DECIMAL,
  high DECIMAL,
  low DECIMAL,
  close DECIMAL,
  volume BIGINT,
  vwap DECIMAL,
  futures_price DECIMAL,
  futures_oi BIGINT,
  futures_oi_change BIGINT,
  basis DECIMAL,
  vix DECIMAL
);

CREATE TABLE IF NOT EXISTS option_chain_snapshots (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  expiry_date DATE,
  strike_price DECIMAL NOT NULL,
  ce_oi BIGINT DEFAULT 0,
  ce_oi_change BIGINT DEFAULT 0,
  ce_volume BIGINT DEFAULT 0,
  ce_iv DECIMAL DEFAULT 0,
  ce_ltp DECIMAL DEFAULT 0,
  ce_bid DECIMAL DEFAULT 0,
  ce_ask DECIMAL DEFAULT 0,
  pe_oi BIGINT DEFAULT 0,
  pe_oi_change BIGINT DEFAULT 0,
  pe_volume BIGINT DEFAULT 0,
  pe_iv DECIMAL DEFAULT 0,
  pe_ltp DECIMAL DEFAULT 0,
  pe_bid DECIMAL DEFAULT 0,
  pe_ask DECIMAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS engine_outputs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  symbol VARCHAR(20),
  engine_name VARCHAR(50),
  result JSONB,
  signal VARCHAR(50),
  score DECIMAL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  symbol VARCHAR(20),
  event_type VARCHAR(50),
  description TEXT,
  rule_fired TEXT,
  previous_value TEXT,
  new_value TEXT
);

CREATE TABLE IF NOT EXISTS score_history (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  symbol VARCHAR(20),
  bullish_score DECIMAL,
  bearish_score DECIMAL,
  component_breakdown JSONB
);

CREATE TABLE IF NOT EXISTS sector_snapshots (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  sector_name VARCHAR(50),
  price DECIMAL,
  change_pct DECIMAL,
  rs_ratio DECIMAL,
  rs_momentum DECIMAL,
  relative_volume DECIMAL,
  sector_score DECIMAL,
  rrg_quadrant VARCHAR(20)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time ON market_snapshots(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_option_chain_symbol_time ON option_chain_snapshots(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_option_chain_symbol_strike ON option_chain_snapshots(symbol, strike_price, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_engine_outputs_time ON engine_outputs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_engine_outputs_symbol_engine ON engine_outputs(symbol, engine_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_symbol_time ON timeline_events(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_score_history_symbol_time ON score_history(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sector_snapshots_time ON sector_snapshots(timestamp DESC);
