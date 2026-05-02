/**
 * Signal Database Service
 * Handles signal storage and outcome tracking with PostgreSQL
 */

import database from './database.js';
import { v4 as uuidv4 } from 'uuid';

class SignalDatabase {
  constructor() {
    this.db = database;
    this.mockMode = !database.isConnected;
    this.mockSignals = [];
    this.mockOutcomes = [];

    if (this.mockMode) {
      console.log('📦 SignalDatabase initialized (mock mode)');
    } else {
      console.log('📦 SignalDatabase initialized (PostgreSQL mode)');
    }
  }

  async saveSignal(signal) {
    // Generate unique ID if not provided
    const signalId = signal.id || uuidv4();
    const now = new Date();

    const signalData = {
      signal_id: signalId,
      symbol: signal.symbol,
      entry_price: signal.entryPrice,
      stop_loss: signal.stopLoss,
      target: signal.target,
      signal_type: signal.type,
      confidence: signal.confidence,
      confluences: JSON.stringify(signal.confluences || []),
      regime: signal.regime,
      timestamp: signal.timestamp || now,
      saved_at: now,
      updated_at: now
    };

    // Mock mode
    if (this.mockMode) {
      return {
        ...signalData,
        id: signalId,
        saved_at: now
      };
    }

    try {
      const result = await this.db.query(
        `INSERT INTO signals
         (signal_id, symbol, entry_price, stop_loss, target, signal_type, confidence, confluences, regime, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          signalData.signal_id,
          signalData.symbol,
          signalData.entry_price,
          signalData.stop_loss,
          signalData.target,
          signalData.signal_type,
          signalData.confidence,
          signalData.confluences,
          signalData.regime,
          signalData.timestamp
        ]
      );

      return result.rows[0];
    } catch (err) {
      console.error('❌ Error saving signal:', err.message);
      throw err;
    }
  }

  async recordOutcome(signalId, outcome) {
    const outcomeData = {
      signal_id: signalId,
      outcome: outcome.status,
      exit_price: outcome.exitPrice,
      pnl: outcome.pnl,
      pnl_percentage: outcome.pnlPercentage,
      recorded_at: new Date()
    };

    // Mock mode
    if (this.mockMode) {
      this.mockOutcomes.push(outcomeData);
      return { success: true };
    }

    try {
      await this.db.query(
        `INSERT INTO signal_outcomes
         (signal_id, outcome, exit_price, pnl, pnl_percentage)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          outcomeData.signal_id,
          outcomeData.outcome,
          outcomeData.exit_price,
          outcomeData.pnl,
          outcomeData.pnl_percentage
        ]
      );

      return { success: true };
    } catch (err) {
      console.error('❌ Error recording outcome:', err.message);
      throw err;
    }
  }

  async getStats(symbol = null) {
    // Mock mode
    if (this.mockMode) {
      const relevantSignals = symbol
        ? this.mockSignals.filter(s => s.symbol === symbol)
        : this.mockSignals;

      return {
        signal: symbol || 'ALL',
        count: relevantSignals.length,
        accuracy: 0,
        message: 'Mock mode - database not configured'
      };
    }

    try {
      let query = `
        SELECT
          COUNT(*) as total_signals,
          COUNT(CASE WHEN so.outcome = 'win' THEN 1 END) as winning_signals,
          ROUND(
            COUNT(CASE WHEN so.outcome = 'win' THEN 1 END) * 100.0 /
            NULLIF(COUNT(*), 0), 2
          ) as win_rate,
          ROUND(AVG(so.pnl_percentage), 2) as avg_pnl_percentage
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
      `;

      const params = [];

      if (symbol) {
        query += ` WHERE s.symbol = $1`;
        params.push(symbol);
      }

      const result = await this.db.query(query, params);
      const stats = result.rows[0];

      return {
        symbol: symbol || 'ALL',
        totalSignals: parseInt(stats.total_signals),
        winningSignals: parseInt(stats.winning_signals) || 0,
        winRate: parseFloat(stats.win_rate) || 0,
        avgPnLPercentage: parseFloat(stats.avg_pnl_percentage) || 0
      };
    } catch (err) {
      console.error('❌ Error getting stats:', err.message);
      throw err;
    }
  }

  async getSignalHistory(symbol = null, limit = 100) {
    // Mock mode
    if (this.mockMode) {
      const relevant = symbol
        ? this.mockSignals.filter(s => s.symbol === symbol)
        : this.mockSignals;
      return relevant.slice(-limit);
    }

    try {
      let query = `
        SELECT s.*,
               json_agg(json_build_object(
                 'outcome', so.outcome,
                 'exit_price', so.exit_price,
                 'pnl', so.pnl,
                 'recorded_at', so.recorded_at
               )) as outcomes
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
      `;

      const params = [];

      if (symbol) {
        query += ` WHERE s.symbol = $1`;
        params.push(symbol);
      }

      query += ` GROUP BY s.id ORDER BY s.timestamp DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('❌ Error getting signal history:', err.message);
      throw err;
    }
  }

  async deleteOldSignals(daysOld = 90) {
    if (this.mockMode) {
      return { deleted: 0 };
    }

    try {
      const result = await this.db.query(
        `DELETE FROM signals
         WHERE timestamp < NOW() - INTERVAL '1 day' * $1
         RETURNING id`,
        [daysOld]
      );

      return { deleted: result.rowCount };
    } catch (err) {
      console.error('❌ Error deleting old signals:', err.message);
      throw err;
    }
  }
}

export default new SignalDatabase();
