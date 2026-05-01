-- Phase 4: Backtesting, ML, and User Preferences
-- Tables for backtest runs, performance metrics, and user configuration

-- =====================================================
-- 1. BACKTEST RUNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS backtest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_name VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  parameters_json TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  win_rate DECIMAL(5, 2),
  profit_factor DECIMAL(8, 2),
  sharpe_ratio DECIMAL(6, 2),
  max_drawdown DECIMAL(6, 2),
  total_return DECIMAL(8, 2),
  total_trades INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backtest_runs_symbol ON backtest_runs(symbol);
CREATE INDEX idx_backtest_runs_created ON backtest_runs(created_at);

-- =====================================================
-- 2. BACKTEST TRADES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS backtest_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  entry_date DATE NOT NULL,
  exit_date DATE,
  direction VARCHAR(10) NOT NULL,
  entry_price DECIMAL(10, 2) NOT NULL,
  exit_price DECIMAL(10, 2),
  pnl DECIMAL(10, 2),
  pnl_percent DECIMAL(6, 2),
  signal_type VARCHAR(50),
  duration_days INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES backtest_runs(id)
);

CREATE INDEX idx_backtest_trades_run ON backtest_trades(run_id);
CREATE INDEX idx_backtest_trades_symbol ON backtest_trades(symbol);
CREATE INDEX idx_backtest_trades_date ON backtest_trades(entry_date);

-- =====================================================
-- 3. USER PREFERENCES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  data_type VARCHAR(20) DEFAULT 'string',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_preferences_key ON user_preferences(key);

-- =====================================================
-- 4. ML PATTERNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS ml_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  pattern_name VARCHAR(100) NOT NULL,
  pattern_json TEXT,
  confidence DECIMAL(5, 2),
  detected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patterns_symbol ON ml_patterns(symbol);
CREATE INDEX idx_patterns_detected ON ml_patterns(detected_at);

-- =====================================================
-- 5. ANOMALIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  data_type VARCHAR(50) NOT NULL,
  value DECIMAL(10, 2),
  z_score DECIMAL(6, 2),
  threshold DECIMAL(6, 2),
  flagged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anomalies_symbol ON anomalies(symbol);
CREATE INDEX idx_anomalies_flagged ON anomalies(flagged_at);

-- =====================================================
-- 6. ANALYTICS CACHE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol VARCHAR(20) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  metric_data TEXT,
  period_days INTEGER,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_symbol_metric ON analytics_cache(symbol, metric_name);
