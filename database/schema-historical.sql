-- Historical Data Storage Schema
-- Tracks PCR, IV, Max Pain, and Greeks evolution over time

-- =====================================================
-- 1. PCR HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS pcr_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  pcr_ratio DECIMAL(6, 4) NOT NULL,
  sentiment VARCHAR(50) NOT NULL,
  confidence DECIMAL(3, 2),
  change_percent DECIMAL(6, 2),
  total_call_oi BIGINT,
  total_put_oi BIGINT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pcr_symbol_time ON pcr_history(symbol, recorded_at);
CREATE INDEX idx_pcr_time ON pcr_history(recorded_at);

-- =====================================================
-- 2. MAX PAIN HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS max_pain_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  max_pain_level DECIMAL(10, 2) NOT NULL,
  current_price DECIMAL(10, 2) NOT NULL,
  distance DECIMAL(10, 2),
  direction VARCHAR(10),
  percentage_move DECIMAL(6, 2),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_maxpain_symbol_time ON max_pain_history(symbol, recorded_at);
CREATE INDEX idx_maxpain_time ON max_pain_history(recorded_at);

-- =====================================================
-- 3. IMPLIED VOLATILITY HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS iv_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  strike_price DECIMAL(10, 2) NOT NULL,
  atm_iv DECIMAL(5, 2),
  call_iv DECIMAL(5, 2),
  put_iv DECIMAL(5, 2),
  skew_pattern VARCHAR(50),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_iv_symbol_strike_time ON iv_history(symbol, strike_price, recorded_at);
CREATE INDEX idx_iv_symbol_time ON iv_history(symbol, recorded_at);

-- =====================================================
-- 4. GREEKS HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS greeks_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  strike_price DECIMAL(10, 2) NOT NULL,
  option_type VARCHAR(10) NOT NULL,
  delta DECIMAL(5, 4),
  gamma DECIMAL(5, 4),
  theta DECIMAL(6, 3),
  vega DECIMAL(5, 3),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_greeks_symbol_strike_type_time ON greeks_history(symbol, strike_price, option_type, recorded_at);
CREATE INDEX idx_greeks_symbol_time ON greeks_history(symbol, recorded_at);

-- =====================================================
-- 5. OPEN INTEREST HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS oi_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  strike_price DECIMAL(10, 2) NOT NULL,
  call_oi BIGINT,
  put_oi BIGINT,
  total_oi BIGINT,
  oi_ratio DECIMAL(5, 2),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_oi_symbol_strike_time ON oi_history(symbol, strike_price, recorded_at);
CREATE INDEX idx_oi_symbol_time ON oi_history(symbol, recorded_at);

-- =====================================================
-- 6. PRICE HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  change_amount DECIMAL(10, 2),
  change_percent DECIMAL(6, 2),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_symbol_time ON price_history(symbol, recorded_at);
CREATE INDEX idx_price_time ON price_history(recorded_at);

-- =====================================================
-- 7. ALERTS HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS alerts_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT,
  pcr_ratio DECIMAL(6, 4),
  max_pain DECIMAL(10, 2),
  current_price DECIMAL(10, 2),
  confidence DECIMAL(3, 2),
  acknowledged BOOLEAN DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_symbol_severity_time ON alerts_history(symbol, severity, recorded_at);
CREATE INDEX idx_alerts_symbol_time ON alerts_history(symbol, recorded_at);
CREATE INDEX idx_alerts_unacknowledged ON alerts_history(acknowledged, recorded_at);

-- =====================================================
-- 8. DAILY STATISTICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  trade_date DATE NOT NULL,

  -- Price stats
  open_price DECIMAL(10, 2),
  high_price DECIMAL(10, 2),
  low_price DECIMAL(10, 2),
  close_price DECIMAL(10, 2),

  -- PCR stats
  avg_pcr DECIMAL(6, 4),
  max_pcr DECIMAL(6, 4),
  min_pcr DECIMAL(6, 4),
  pcr_volatility DECIMAL(5, 3),

  -- Max Pain stats
  avg_max_pain DECIMAL(10, 2),
  max_pain_variance DECIMAL(10, 2),

  -- IV stats
  avg_atm_iv DECIMAL(5, 2),
  max_atm_iv DECIMAL(5, 2),
  min_atm_iv DECIMAL(5, 2),

  -- Alerts count
  critical_alerts_count INTEGER DEFAULT 0,
  warning_alerts_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, trade_date)
);

CREATE INDEX idx_daily_stats_symbol_date ON daily_stats(symbol, trade_date);

-- =====================================================
-- 9. SNAPSHOT TABLE (For daily/weekly snapshots)
-- =====================================================
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  snapshot_date DATE NOT NULL,
  snapshot_type VARCHAR(20) NOT NULL,

  -- Market state
  current_price DECIMAL(10, 2),
  pcr_ratio DECIMAL(6, 4),
  max_pain_level DECIMAL(10, 2),
  atm_iv DECIMAL(5, 2),

  -- Stats
  data_points_count INTEGER,
  alerts_count INTEGER,

  -- Raw JSON for flexibility
  full_snapshot JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, snapshot_date, snapshot_type)
);

CREATE INDEX idx_snapshots_symbol_date_type ON snapshots(symbol, snapshot_date, snapshot_type);

-- =====================================================
-- 10. METADATA TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS data_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(key)
);

-- Initialize metadata
INSERT OR IGNORE INTO data_metadata (key, value, description)
VALUES
  ('last_sync_time', '1970-01-01', 'Last time data was synced'),
  ('data_retention_days', '365', 'Days to retain historical data'),
  ('snapshot_interval_hours', '1', 'Hours between snapshots'),
  ('db_version', '1.0', 'Database schema version');

-- =====================================================
-- VIEWS FOR ANALYSIS
-- =====================================================

-- View: Recent PCR Trends (last 24 hours)
CREATE VIEW IF NOT EXISTS pcr_trends_24h AS
SELECT
  symbol,
  pcr_ratio,
  sentiment,
  confidence,
  change_percent,
  recorded_at,
  ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY recorded_at DESC) as rank
FROM pcr_history
WHERE recorded_at >= datetime('now', '-24 hours')
ORDER BY recorded_at DESC;

-- View: Max Pain Evolution
CREATE VIEW IF NOT EXISTS max_pain_evolution AS
SELECT
  symbol,
  max_pain_level,
  current_price,
  distance,
  direction,
  percentage_move,
  recorded_at,
  LAG(max_pain_level) OVER (PARTITION BY symbol ORDER BY recorded_at) as prev_max_pain,
  (max_pain_level - LAG(max_pain_level) OVER (PARTITION BY symbol ORDER BY recorded_at)) as max_pain_change
FROM max_pain_history
WHERE recorded_at >= datetime('now', '-7 days')
ORDER BY symbol, recorded_at DESC;

-- View: IV Volatility Analysis
CREATE VIEW IF NOT EXISTS iv_analysis AS
SELECT
  symbol,
  AVG(atm_iv) as avg_iv,
  MAX(atm_iv) as max_iv,
  MIN(atm_iv) as min_iv,
  (MAX(atm_iv) - MIN(atm_iv)) as iv_range,
  COUNT(*) as data_points,
  recorded_at
FROM iv_history
WHERE recorded_at >= datetime('now', '-7 days')
GROUP BY symbol
ORDER BY recorded_at DESC;

-- View: Alert Summary
CREATE VIEW IF NOT EXISTS alert_summary AS
SELECT
  symbol,
  severity,
  COUNT(*) as alert_count,
  SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as acknowledged_count,
  SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) as unacknowledged_count,
  MAX(recorded_at) as latest_alert_time
FROM alerts_history
WHERE recorded_at >= datetime('now', '-7 days')
GROUP BY symbol, severity
ORDER BY symbol, severity;
