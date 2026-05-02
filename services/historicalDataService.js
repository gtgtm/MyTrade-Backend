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

import database from './database.js';

class HistoricalDataService {
  constructor() {
    this.db = database;
    this.mockMode = !database.isConnected;
    this.mockData = {
      pcr: [],
      maxPain: [],
      iv: [],
      alerts: []
    };

    if (this.mockMode) {
      console.log('📊 HistoricalDataService initialized (mock mode)');
    } else {
      console.log('📊 HistoricalDataService initialized (PostgreSQL mode)');
    }

    this.lastSnapshotTime = {};
    this.snapshotIntervalMinutes = 60;
  }

  async recordPCR(symbol, pcrData) {
    if (this.mockMode) {
      this.mockData.pcr.push({ symbol, ...pcrData, recorded_at: new Date() });
      return { id: Math.random() };
    }

    try {
      const result = await this.db.query(
        `INSERT INTO pcr_history
         (symbol, pcr_ratio, sentiment, confidence, change_percent, total_call_oi, total_put_oi)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          symbol,
          pcrData.ratio,
          pcrData.sentiment,
          pcrData.confidence,
          pcrData.change || 0,
          pcrData.totalCallOI,
          pcrData.totalPutOI
        ]
      );
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error recording PCR:', err.message);
      throw err;
    }
  }

  async recordMaxPain(symbol, maxPainData) {
    if (this.mockMode) {
      this.mockData.maxPain.push({ symbol, ...maxPainData, recorded_at: new Date() });
      return { id: Math.random() };
    }

    try {
      const result = await this.db.query(
        `INSERT INTO max_pain_history
         (symbol, max_pain, expiry, confidence, change_amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          symbol,
          maxPainData.level,
          maxPainData.expiry || new Date(),
          maxPainData.confidence,
          maxPainData.changeAmount || 0
        ]
      );
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error recording Max Pain:', err.message);
      throw err;
    }
  }

  async recordIV(symbol, strikePrice, callIV, putIV, skewPattern) {
    if (this.mockMode) {
      this.mockData.iv.push({
        symbol,
        strike: strikePrice,
        callIV,
        putIV,
        skewPattern,
        recorded_at: new Date()
      });
      return { id: Math.random() };
    }

    try {
      const result = await this.db.query(
        `INSERT INTO iv_history
         (symbol, strike, iv, option_type, expiry)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          symbol,
          strikePrice,
          (callIV + putIV) / 2,
          'ATM',
          new Date()
        ]
      );
      return result.rows[0];
    } catch (err) {
      console.error('❌ Error recording IV:', err.message);
      throw err;
    }
  }

  async recordGreeks(symbol, strikePrice, optionType, greeks) {
    if (this.mockMode) {
      return { id: Math.random() };
    }

    try {
      await this.db.query(
        `INSERT INTO greeks_history
         (symbol, strike, option_type, delta, gamma, theta, vega)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          symbol,
          strikePrice,
          optionType,
          greeks.delta,
          greeks.gamma,
          greeks.theta,
          greeks.vega
        ]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error recording Greeks:', err.message);
      throw err;
    }
  }

  async recordOI(symbol, strikePrice, callOI, putOI) {
    if (this.mockMode) {
      return { id: Math.random() };
    }

    try {
      const totalOI = callOI + putOI;
      const oiRatio = callOI > 0 ? putOI / callOI : 0;

      await this.db.query(
        `INSERT INTO oi_history
         (symbol, strike, call_oi, put_oi, total_oi, oi_ratio)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [symbol, strikePrice, callOI, putOI, totalOI, oiRatio]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error recording OI:', err.message);
      throw err;
    }
  }

  async recordPrice(symbol, price, changeAmount, changePercent) {
    if (this.mockMode) {
      return { id: Math.random() };
    }

    try {
      await this.db.query(
        `INSERT INTO price_history
         (symbol, price, change_amount, change_percent)
         VALUES ($1, $2, $3, $4)`,
        [symbol, price, changeAmount || 0, changePercent || 0]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error recording price:', err.message);
      throw err;
    }
  }

  async recordAlert(symbol, alertData) {
    if (this.mockMode) {
      this.mockData.alerts.push({ symbol, ...alertData, recorded_at: new Date() });
      return { id: Math.random() };
    }

    try {
      await this.db.query(
        `INSERT INTO alerts_history
         (symbol, alert_type, severity, message, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          symbol,
          alertData.type,
          alertData.severity,
          alertData.message,
          alertData.confidence || 0
        ]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error recording alert:', err.message);
      throw err;
    }
  }

  async recordSnapshot(symbol, snapshotType, snapshotData) {
    if (this.mockMode) {
      return { id: Math.random() };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      await this.db.query(
        `INSERT INTO snapshots
         (symbol, snapshot_date, snapshot_type, current_price, pcr_ratio, max_pain_level, atm_iv, full_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (symbol, snapshot_date, snapshot_type) DO UPDATE SET
           current_price = $4,
           pcr_ratio = $5,
           max_pain_level = $6,
           atm_iv = $7,
           full_snapshot = $8`,
        [
          symbol,
          today,
          snapshotType,
          snapshotData.price,
          snapshotData.pcr,
          snapshotData.maxPain,
          snapshotData.atmIV,
          JSON.stringify(snapshotData)
        ]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error recording snapshot:', err.message);
      throw err;
    }
  }

  async getPCRHistory(symbol, days = 7) {
    if (this.mockMode) {
      const mockData = [];
      const base = symbol === 'NIFTY' ? 1.0 : symbol === 'BANKNIFTY' ? 0.95 : 1.05;
      for (let i = 0; i < Math.min(days * 5, 150); i++) {
        mockData.push({
          id: i,
          symbol,
          pcr_ratio: base + (Math.random() - 0.5) * 0.4,
          sentiment: 'Neutral',
          confidence: 0.5 + Math.random() * 0.3,
          change_percent: (Math.random() - 0.5) * 20,
          recorded_at: new Date(Date.now() - i * 3600000).toISOString()
        });
      }
      return mockData;
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM pcr_history
         WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '1 day' * $2
         ORDER BY recorded_at DESC`,
        [symbol, days]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting PCR history:', err.message);
      throw err;
    }
  }

  async getMaxPainHistory(symbol, days = 7) {
    if (this.mockMode) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM max_pain_history
         WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '1 day' * $2
         ORDER BY recorded_at DESC`,
        [symbol, days]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting Max Pain history:', err.message);
      throw err;
    }
  }

  async getIVHistory(symbol, strikePrice = null, days = 7) {
    if (this.mockMode) {
      const mockData = [];
      const baseIV = symbol === 'NIFTY' ? 17 : symbol === 'BANKNIFTY' ? 18 : 16;
      for (let i = 0; i < Math.min(days * 5, 150); i++) {
        mockData.push({
          id: i,
          symbol,
          strike: strikePrice || 22300,
          iv: baseIV + (Math.random() - 0.5) * 4,
          recorded_at: new Date(Date.now() - i * 3600000).toISOString()
        });
      }
      return mockData;
    }

    try {
      let query = `SELECT * FROM iv_history
         WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '1 day' * $2`;
      const params = [symbol, days];

      if (strikePrice) {
        query += ` AND strike = $3`;
        params.push(strikePrice);
      }

      query += ` ORDER BY recorded_at DESC`;

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting IV history:', err.message);
      throw err;
    }
  }

  async getAlertsHistory(symbol, days = 7, severity = null) {
    if (this.mockMode) {
      return [];
    }

    try {
      let query = `SELECT * FROM alerts_history
         WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '1 day' * $2`;
      const params = [symbol, days];

      if (severity) {
        query += ` AND severity = $3`;
        params.push(severity);
      }

      query += ` ORDER BY recorded_at DESC`;

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting alerts history:', err.message);
      throw err;
    }
  }

  async getDailyStats(symbol, days = 30) {
    if (this.mockMode) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM daily_stats
         WHERE symbol = $1
         AND trade_date >= CURRENT_DATE - INTERVAL '1 day' * $2
         ORDER BY trade_date DESC`,
        [symbol, days]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting daily stats:', err.message);
      throw err;
    }
  }

  async getSnapshots(symbol, snapshotType = 'hourly', days = 30) {
    if (this.mockMode) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT * FROM snapshots
         WHERE symbol = $1
         AND snapshot_type = $2
         AND snapshot_date >= CURRENT_DATE - INTERVAL '1 day' * $3
         ORDER BY snapshot_date DESC`,
        [symbol, snapshotType, days]
      );
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting snapshots:', err.message);
      throw err;
    }
  }

  async generateDailyStats(symbol, tradeDate) {
    if (this.mockMode) {
      return { id: Math.random() };
    }

    try {
      await this.db.query(
        `INSERT INTO daily_stats
         (symbol, trade_date, avg_pcr, max_pcr, min_pcr)
         SELECT $1, $2,
           AVG(pcr_ratio),
           MAX(pcr_ratio),
           MIN(pcr_ratio)
         FROM pcr_history
         WHERE symbol = $1
         AND DATE(recorded_at) = $2
         ON CONFLICT (symbol, trade_date) DO UPDATE SET
           avg_pcr = EXCLUDED.avg_pcr,
           max_pcr = EXCLUDED.max_pcr,
           min_pcr = EXCLUDED.min_pcr`,
        [symbol, tradeDate]
      );
      return { id: Math.random() };
    } catch (err) {
      console.error('❌ Error generating daily stats:', err.message);
      throw err;
    }
  }

  async getTrendAnalysis(symbol, days = 30) {
    if (this.mockMode) {
      const base = symbol === 'NIFTY' ? 1.0 : symbol === 'BANKNIFTY' ? 0.95 : 1.05;
      return {
        symbol,
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

    try {
      const result = await this.db.query(
        `SELECT
           symbol,
           AVG(pcr_ratio) as avg_pcr,
           MAX(pcr_ratio) as max_pcr,
           MIN(pcr_ratio) as min_pcr,
           MAX(pcr_ratio) - MIN(pcr_ratio) as pcr_range,
           COUNT(DISTINCT DATE(recorded_at)) as trading_days
         FROM pcr_history
         WHERE symbol = $1
         AND recorded_at >= NOW() - INTERVAL '1 day' * $2
         GROUP BY symbol`,
        [symbol, days]
      );
      return result.rows[0] || {};
    } catch (err) {
      console.error('❌ Error getting trend analysis:', err.message);
      throw err;
    }
  }

  async acknowledgeAlert(alertId) {
    if (this.mockMode) {
      return { changes: 1 };
    }

    try {
      const result = await this.db.query(
        `UPDATE alerts_history
         SET acknowledged = true,
             acknowledged_at = NOW()
         WHERE id = $1`,
        [alertId]
      );
      return { changes: result.rowCount };
    } catch (err) {
      console.error('❌ Error acknowledging alert:', err.message);
      throw err;
    }
  }

  async cleanOldData(retentionDays = 365) {
    if (this.mockMode) {
      return { deletedRecords: 0 };
    }

    try {
      const cutoff = `NOW() - INTERVAL '1 day' * ${retentionDays}`;

      const tables = [
        'pcr_history',
        'max_pain_history',
        'iv_history',
        'alerts_history'
      ];

      let totalDeleted = 0;

      for (const table of tables) {
        const result = await this.db.query(
          `DELETE FROM ${table} WHERE recorded_at < NOW() - INTERVAL '1 day' * $1`,
          [retentionDays]
        );
        totalDeleted += result.rowCount;
      }

      console.log(`🧹 Cleaned up ${totalDeleted} old records`);
      return { deletedRecords: totalDeleted };
    } catch (err) {
      console.error('❌ Error cleaning old data:', err.message);
      throw err;
    }
  }

  async getStats() {
    if (this.mockMode) {
      return {
        pcrCount: 0,
        maxPainCount: 0,
        ivCount: 0,
        alertsCount: 0
      };
    }

    try {
      const [pcr, maxPain, iv, alerts] = await Promise.all([
        this.db.getOne('SELECT COUNT(*) as count FROM pcr_history'),
        this.db.getOne('SELECT COUNT(*) as count FROM max_pain_history'),
        this.db.getOne('SELECT COUNT(*) as count FROM iv_history'),
        this.db.getOne('SELECT COUNT(*) as count FROM alerts_history')
      ]);

      return {
        pcrCount: parseInt(pcr.count) || 0,
        maxPainCount: parseInt(maxPain.count) || 0,
        ivCount: parseInt(iv.count) || 0,
        alertsCount: parseInt(alerts.count) || 0
      };
    } catch (err) {
      console.error('❌ Error getting database stats:', err.message);
      throw err;
    }
  }

  async close() {
    return this.db.close();
  }
}

export default new HistoricalDataService();
