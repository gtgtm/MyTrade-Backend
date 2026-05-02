import fs from 'fs/promises';
import path from 'path';

/**
 * Logs signal generation and tracks accuracy against actual price movements.
 * Stores records in JSONL format for easy inspection and auditing.
 */
class SignalAccuracyLogger {
  constructor(storageDir = './signal_logs') {
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create storage directory:', err.message);
    }
  }

  /**
   * Log a signal when generated
   */
  async logGenerated(signal) {
    const record = {
      type: 'generated',
      id: signal.id || this.generateId(),
      timestamp: new Date().toISOString(),
      symbol: signal.symbol,
      direction: signal.signalType,
      confidence: signal.confidence,
      score: signal.score,
      entryPrice: signal.price,
      targetPrice: signal.target,
      stopPrice: signal.stopLoss,
      indicators: signal.indicators
    };

    await this.appendLog(record);
    return record.id;
  }

  /**
   * Log signal result when it closes (target hit, stop hit, expired)
   */
  async logResult(signalId, outcome, exitPrice, exitTimestamp = new Date()) {
    const result = {
      type: 'result',
      signalId,
      timestamp: exitTimestamp.toISOString(),
      outcome, // 'targetHit', 'stopHit', 'expired', 'manuallyClosed'
      exitPrice,
      pnlPercent: 0 // filled by caller if known
    };

    await this.appendLog(result);
  }

  /**
   * Log price update for tracking (periodic snapshots)
   */
  async logPrice(symbol, price, timestamp = new Date()) {
    const record = {
      type: 'price',
      timestamp: timestamp.toISOString(),
      symbol,
      price
    };

    await this.appendLog(record);
  }

  /**
   * Get accuracy metrics for a symbol
   */
  async getMetrics(symbol, windowDays = 30) {
    const logs = await this.readLogs();
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const generated = logs.filter(l => l.type === 'generated' && l.symbol === symbol && new Date(l.timestamp) > cutoff);
    const results = logs.filter(l => l.type === 'result' && new Date(l.timestamp) > cutoff);

    const signalResults = new Map();
    results.forEach(r => {
      const origSignal = generated.find(g => g.id === r.signalId);
      if (origSignal) {
        signalResults.set(r.signalId, {
          signal: origSignal,
          result: r
        });
      }
    });

    let wins = 0, losses = 0;
    const confidenceBuckets = {};

    signalResults.forEach(({ signal, result }) => {
      if (result.outcome === 'targetHit') wins++;
      else if (result.outcome === 'stopHit') losses++;

      const bucket = Math.floor(signal.confidence / 10) * 10;
      if (!confidenceBuckets[bucket]) {
        confidenceBuckets[bucket] = { samples: 0, wins: 0 };
      }
      confidenceBuckets[bucket].samples++;
      if (result.outcome === 'targetHit') confidenceBuckets[bucket].wins++;
    });

    const totalSignals = signalResults.size;
    const winRate = totalSignals > 0 ? wins / totalSignals : 0;

    return {
      symbol,
      window: `${windowDays} days`,
      totalSignals,
      wins,
      losses,
      winRate: (winRate * 100).toFixed(1) + '%',
      confidenceCalibration: confidenceBuckets
    };
  }

  // MARK: - Private

  async appendLog(record) {
    try {
      const filename = path.join(this.storageDir, `signals_${new Date().toISOString().split('T')[0]}.jsonl`);
      await fs.appendFile(filename, JSON.stringify(record) + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to append log:', err.message);
    }
  }

  async readLogs() {
    const logs = [];
    try {
      const files = await fs.readdir(this.storageDir);
      for (const file of files) {
        if (!file.startsWith('signals_')) continue;

        const filepath = path.join(this.storageDir, file);
        const content = await fs.readFile(filepath, 'utf8');
        const lines = content.trim().split('\n');
        lines.forEach(line => {
          if (line) {
            try {
              logs.push(JSON.parse(line));
            } catch (err) {
              console.warn('Failed to parse log line:', err.message);
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to read logs:', err.message);
    }
    return logs;
  }

  generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

export default new SignalAccuracyLogger();
