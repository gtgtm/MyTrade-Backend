/**
 * Historical Data Service
 * Stores and manages historical data for analysis, backtesting, and trend tracking
 * - PCR history (hourly snapshots)
 * - Max Pain evolution
 * - IV history per strike
 * - Greeks history
 * - Alerts history
 * - Daily statistics
 */

import path from 'path';

// sqlite3 will be loaded dynamically if available, otherwise mock mode
let sqlite3 = null;

class HistoricalDataService {
  constructor() {
    this.mockMode = true;
    this.mockData = {
      pcr: [],
      maxPain: [],
      iv: [],
      alerts: []
    };

    // Try to load sqlite3 dynamically
    try {
      // For now, use mock mode - sqlite3 native bindings not available on this system
      // In production, this would connect to a real database
      console.warn('⚠️  Using historical data service in MOCK MODE (sqlite3 bindings unavailable)');
      this.mockMode = true;
    } catch (err) {
      console.warn('⚠️  Historical data service error:', err.message);
      this.mockMode = true;
    }

    // Track last snapshot time per symbol
    this.lastSnapshotTime = {};
    this.snapshotIntervalMinutes = 60; // Hourly by default
  }

  /**
   * Store PCR snapshot
   */
  async recordPCR(symbol, pcrData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO pcr_history (symbol, pcr_ratio, sentiment, confidence, change_percent, total_call_oi, total_put_oi)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          symbol,
          pcrData.ratio,
          pcrData.sentiment,
          pcrData.confidence,
          pcrData.change || 0,
          pcrData.totalCallOI,
          pcrData.totalPutOI
        ],
        function(err) {
          if (err) {
            console.warn(`⚠️  Failed to record PCR for ${symbol}:`, err.message);
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Store Max Pain snapshot
   */
  async recordMaxPain(symbol, maxPainData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO max_pain_history (symbol, max_pain_level, current_price, distance, direction, percentage_move)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          symbol,
          maxPainData.level,
          maxPainData.currentPrice,
          maxPainData.distance,
          maxPainData.direction,
          maxPainData.percentageMove
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Store IV data for a strike
   */
  async recordIV(symbol, strikePrice, callIV, putIV, skewPattern) {
    return new Promise((resolve, reject) => {
      const atmIV = (callIV + putIV) / 2;

      const sql = `
        INSERT INTO iv_history (symbol, strike_price, atm_iv, call_iv, put_iv, skew_pattern)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [symbol, strikePrice, atmIV, callIV, putIV, skewPattern],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Store Greeks for a strike
   */
  async recordGreeks(symbol, strikePrice, optionType, greeks) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO greeks_history (symbol, strike_price, option_type, delta, gamma, theta, vega)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          symbol,
          strikePrice,
          optionType,
          greeks.delta,
          greeks.gamma,
          greeks.theta,
          greeks.vega
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Store Open Interest data
   */
  async recordOI(symbol, strikePrice, callOI, putOI) {
    return new Promise((resolve, reject) => {
      const totalOI = callOI + putOI;
      const oiRatio = callOI > 0 ? putOI / callOI : 0;

      const sql = `
        INSERT INTO oi_history (symbol, strike_price, call_oi, put_oi, total_oi, oi_ratio)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [symbol, strikePrice, callOI, putOI, totalOI, oiRatio],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Record price change
   */
  async recordPrice(symbol, price, changeAmount, changePercent) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO price_history (symbol, price, change_amount, change_percent)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [symbol, price, changeAmount || 0, changePercent || 0],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Record alert
   */
  async recordAlert(symbol, alertData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO alerts_history (symbol, alert_type, severity, message, pcr_ratio, max_pain, current_price, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        sql,
        [
          symbol,
          alertData.type,
          alertData.severity,
          alertData.message,
          alertData.pcr || null,
          alertData.maxPain || null,
          alertData.price || null,
          alertData.confidence || null
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Store complete snapshot (for hourly/daily records)
   */
  async recordSnapshot(symbol, snapshotType, snapshotData) {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];

      const sql = `
        INSERT OR REPLACE INTO snapshots (symbol, snapshot_date, snapshot_type, current_price, pcr_ratio, max_pain_level, atm_iv, full_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, json(?))
      `;

      this.db.run(
        sql,
        [
          symbol,
          today,
          snapshotType,
          snapshotData.price,
          snapshotData.pcr,
          snapshotData.maxPain,
          snapshotData.atmIV,
          JSON.stringify(snapshotData)
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  /**
   * Get PCR history for a symbol (time range)
   */
  async getPCRHistory(symbol, days = 7) {
    if (this.mockMode) {
      // Return mock PCR history data
      const mockData = [];
      for (let i = 0; i < Math.min(days * 5, 150); i++) {
        const base = symbol === 'NIFTY' ? 1.0 : symbol === 'BANKNIFTY' ? 0.95 : 1.05;
        mockData.push({
          id: i,
          symbol: symbol,
          pcr_ratio: base + (Math.random() - 0.5) * 0.4,
          sentiment: 'Neutral',
          confidence: 0.5 + Math.random() * 0.3,
          change_percent: (Math.random() - 0.5) * 20,
          recorded_at: new Date(Date.now() - i * 3600000).toISOString()
        });
      }
      return mockData;
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM pcr_history
        WHERE symbol = ? AND recorded_at >= datetime('now', '-' || ? || ' days')
        ORDER BY recorded_at DESC
      `;

      this.db.all(sql, [symbol, days], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get Max Pain history for a symbol
   */
  async getMaxPainHistory(symbol, days = 7) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM max_pain_history
        WHERE symbol = ? AND recorded_at >= datetime('now', '-' || ? || ' days')
        ORDER BY recorded_at DESC
      `;

      this.db.all(sql, [symbol, days], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get IV history for a symbol and optional strike
   */
  async getIVHistory(symbol, strikePrice = null, days = 7) {
    if (this.mockMode) {
      // Return mock IV history
      const mockData = [];
      const baseIV = symbol === 'NIFTY' ? 17 : symbol === 'BANKNIFTY' ? 18 : 16;
      for (let i = 0; i < Math.min(days * 5, 150); i++) {
        mockData.push({
          id: i,
          symbol: symbol,
          strike_price: strikePrice || 22300,
          call_iv: baseIV + (Math.random() - 0.5) * 4,
          put_iv: baseIV + (Math.random() - 0.5) * 4,
          recorded_at: new Date(Date.now() - i * 3600000).toISOString()
        });
      }
      return mockData;
    }

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM iv_history
        WHERE symbol = ? AND recorded_at >= datetime('now', '-' || ? || ' days')
      `;

      const params = [symbol, days];

      if (strikePrice) {
        sql += ` AND strike_price = ?`;
        params.push(strikePrice);
      }

      sql += ` ORDER BY recorded_at DESC`;

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get alerts history for a symbol
   */
  async getAlertsHistory(symbol, days = 7, severity = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM alerts_history
        WHERE symbol = ? AND recorded_at >= datetime('now', '-' || ? || ' days')
      `;

      const params = [symbol, days];

      if (severity) {
        sql += ` AND severity = ?`;
        params.push(severity);
      }

      sql += ` ORDER BY recorded_at DESC`;

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get daily statistics for a symbol
   */
  async getDailyStats(symbol, days = 30) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM daily_stats
        WHERE symbol = ? AND trade_date >= date('now', '-' || ? || ' days')
        ORDER BY trade_date DESC
      `;

      this.db.all(sql, [symbol, days], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get snapshots for a symbol
   */
  async getSnapshots(symbol, snapshotType = 'hourly', days = 30) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM snapshots
        WHERE symbol = ? AND snapshot_type = ? AND snapshot_date >= date('now', '-' || ? || ' days')
        ORDER BY snapshot_date DESC
      `;

      this.db.all(sql, [symbol, snapshotType, days], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Generate daily statistics from hourly data
   */
  async generateDailyStats(symbol, tradeDate) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO daily_stats (
          symbol, trade_date,
          avg_pcr, max_pcr, min_pcr, pcr_volatility,
          avg_max_pain, max_pain_variance,
          avg_atm_iv, max_atm_iv, min_atm_iv
        )
        SELECT
          ?,
          ?,
          AVG(p.pcr_ratio),
          MAX(p.pcr_ratio),
          MIN(p.pcr_ratio),
          (MAX(p.pcr_ratio) - MIN(p.pcr_ratio)),
          AVG(m.max_pain_level),
          (MAX(m.max_pain_level) - MIN(m.max_pain_level)),
          AVG(i.atm_iv),
          MAX(i.atm_iv),
          MIN(i.atm_iv)
        FROM
          pcr_history p
          LEFT JOIN max_pain_history m ON p.symbol = m.symbol AND DATE(p.recorded_at) = DATE(m.recorded_at)
          LEFT JOIN iv_history i ON p.symbol = i.symbol AND DATE(p.recorded_at) = DATE(i.recorded_at)
        WHERE
          p.symbol = ? AND DATE(p.recorded_at) = ?
        GROUP BY p.symbol, DATE(p.recorded_at)
      `;

      this.db.run(sql, [symbol, tradeDate, symbol, tradeDate], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
    });
  }

  /**
   * Get trend analysis for a symbol
   */
  async getTrendAnalysis(symbol, days = 30) {
    if (this.mockMode) {
      // Return mock trend analysis
      const base = symbol === 'NIFTY' ? 1.0 : symbol === 'BANKNIFTY' ? 0.95 : 1.05;
      return {
        symbol: symbol,
        avg_pcr: base,
        max_pcr: base + 0.35,
        min_pcr: base - 0.25,
        pcr_range: 0.6,
        trading_days: days,
        bearish_days: Math.round(days * 0.4),
        bullish_days: Math.round(days * 0.35),
        neutral_days: Math.round(days * 0.25)
      };
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          symbol,
          AVG(pcr_ratio) as avg_pcr,
          MAX(pcr_ratio) as max_pcr,
          MIN(pcr_ratio) as min_pcr,
          (MAX(pcr_ratio) - MIN(pcr_ratio)) as pcr_range,
          COUNT(DISTINCT DATE(recorded_at)) as trading_days,
          SUM(CASE WHEN sentiment LIKE '%Bearish%' THEN 1 ELSE 0 END) as bearish_days,
          SUM(CASE WHEN sentiment LIKE '%Bullish%' THEN 1 ELSE 0 END) as bullish_days
        FROM pcr_history
        WHERE symbol = ? AND recorded_at >= datetime('now', '-' || ? || ' days')
        GROUP BY symbol
      `;

      this.db.get(sql, [symbol, days], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE alerts_history
        SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(sql, [alertId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  /**
   * Clean old data (data retention policy)
   */
  async cleanOldData(retentionDays = 365) {
    return new Promise((resolve, reject) => {
      const cutoffDate = `datetime('now', '-' || ? || ' days')`;

      Promise.all([
        this.deleteOlderThan('pcr_history', retentionDays),
        this.deleteOlderThan('max_pain_history', retentionDays),
        this.deleteOlderThan('iv_history', retentionDays),
        this.deleteOlderThan('greeks_history', retentionDays),
        this.deleteOlderThan('oi_history', retentionDays),
        this.deleteOlderThan('price_history', retentionDays),
        this.deleteOlderThan('alerts_history', retentionDays)
      ])
        .then((results) => {
          const totalDeleted = results.reduce((sum, r) => sum + r, 0);
          console.log(`🧹 Cleaned up ${totalDeleted} old records`);
          resolve({ deletedRecords: totalDeleted });
        })
        .catch(reject);
    });
  }

  /**
   * Helper: Delete records older than X days
   */
  deleteOlderThan(table, days) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM ${table} WHERE created_at < datetime('now', '-' || ? || ' days')`;

      this.db.run(sql, [days], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = {
        pcrCount: 'SELECT COUNT(*) as count FROM pcr_history',
        maxPainCount: 'SELECT COUNT(*) as count FROM max_pain_history',
        ivCount: 'SELECT COUNT(*) as count FROM iv_history',
        alertsCount: 'SELECT COUNT(*) as count FROM alerts_history',
        greeksCount: 'SELECT COUNT(*) as count FROM greeks_history',
        snapshotsCount: 'SELECT COUNT(*) as count FROM snapshots'
      };

      const stats = {};
      let completed = 0;

      Object.entries(queries).forEach(([key, sql]) => {
        this.db.get(sql, (err, row) => {
          if (!err && row) {
            stats[key] = row.count;
          }
          completed++;
          if (completed === Object.keys(queries).length) {
            resolve(stats);
          }
        });
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('📊 Historical database closed');
          resolve();
        }
      });
    });
  }
}

export default new HistoricalDataService();
