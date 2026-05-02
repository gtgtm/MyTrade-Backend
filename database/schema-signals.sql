-- Signals persistence table
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  signalType TEXT NOT NULL,
  price REAL NOT NULL,
  score INTEGER NOT NULL,
  confidence REAL NOT NULL,
  netScore REAL NOT NULL,
  entryPrice REAL,
  stopLoss REAL,
  target REAL,
  timeframe TEXT NOT NULL,
  generatedAt TEXT NOT NULL,
  validUntil TEXT NOT NULL,
  breakdown TEXT,
  indicators TEXT,
  isMock INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indices for fast queries
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_timeframe ON signals(timeframe);
CREATE INDEX IF NOT EXISTS idx_signals_createdAt ON signals(createdAt);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_timeframe ON signals(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_signals_generatedAt ON signals(generatedAt);

-- Signal accuracy tracking for post-mortem analysis
CREATE TABLE IF NOT EXISTS signal_exits (
  id TEXT PRIMARY KEY,
  signalId TEXT NOT NULL,
  symbol TEXT NOT NULL,
  entryPrice REAL NOT NULL,
  exitPrice REAL NOT NULL,
  exitType TEXT NOT NULL,
  pnl REAL NOT NULL,
  pnlPercent REAL NOT NULL,
  holdingMinutes INTEGER NOT NULL,
  exitedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (signalId) REFERENCES signals(id)
);

-- Accuracy metrics aggregation
CREATE TABLE IF NOT EXISTS signal_metrics (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  totalSignals INTEGER DEFAULT 0,
  winCount INTEGER DEFAULT 0,
  lossCount INTEGER DEFAULT 0,
  winRate REAL DEFAULT 0,
  avgPnl REAL DEFAULT 0,
  avgPnlPercent REAL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol, timeframe)
);
