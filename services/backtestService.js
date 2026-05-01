/**
 * Backtest Service
 * Simulates trading strategies against historical data and calculates performance metrics
 */

// sqlite3 is optional in dev mode
let sqlite3 = null;
import path from 'path';
import historicalDataService from './historicalDataService.js';

class BacktestService {
  constructor() {
    this.mockMode = !sqlite3;
    if (!this.mockMode) {
      try {
        const dbPath = path.join(process.cwd(), 'database', 'history.db');
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error('❌ Database connection error:', err.message);
            this.mockMode = true;
          }
        });
        if (!this.mockMode) {
          this.db.run('PRAGMA foreign_keys = ON');
        }
      } catch (err) {
        this.mockMode = true;
      }
    }
  }

  /**
   * Run a backtest for a given symbol and strategy
   */
  async runBacktest(symbol, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        pcrThreshold = 1.2,
        maxPainThreshold = 100,
        strategy = 'pcr',
        entryType = 'next_open',
        exitDays = 5
      } = options;

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const sql = `
        SELECT p.*, m.max_pain_level, m.current_price
        FROM pcr_history p
        LEFT JOIN max_pain_history m ON p.recorded_at = m.recorded_at AND p.symbol = m.symbol
        WHERE p.symbol = ? AND DATE(p.recorded_at) >= ? AND DATE(p.recorded_at) <= ?
        ORDER BY p.recorded_at ASC
      `;

      this.db.all(sql, [symbol, startStr, endStr], async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const trades = this.generateTrades(rows, {
            pcrThreshold,
            maxPainThreshold,
            strategy,
            entryType,
            exitDays
          });

          const metrics = this.calculateMetrics(trades);

          const runId = await this.saveBacktestRun({
            strategy_name: strategy,
            symbol,
            start_date: startStr,
            end_date: endStr,
            parameters_json: JSON.stringify(options),
            ...metrics
          });

          resolve({
            runId,
            symbol,
            startDate: startStr,
            endDate: endStr,
            trades,
            metrics
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Generate trade signals from historical data
   */
  generateTrades(data, options) {
    const {
      pcrThreshold = 1.2,
      maxPainThreshold = 100,
      strategy = 'pcr',
      exitDays = 5
    } = options;

    const trades = [];
    let openTrade = null;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const price = row.current_price || 0;

      const shouldEnter = strategy === 'pcr'
        ? row.pcr_ratio > pcrThreshold
        : strategy === 'max_pain'
          ? Math.abs(row.max_pain_level - price) > maxPainThreshold
          : row.pcr_ratio > pcrThreshold;

      if (!openTrade && shouldEnter) {
        openTrade = {
          entryDate: row.recorded_at.split(' ')[0],
          entryPrice: price,
          direction: row.pcr_ratio > pcrThreshold ? 'bearish' : 'bullish',
          signalType: strategy,
          entryIndex: i
        };
      } else if (openTrade) {
        const daysOpen = Math.floor((i - openTrade.entryIndex) / 24);
        const exitPrice = price;
        const pnl = openTrade.direction === 'bearish'
          ? (openTrade.entryPrice - exitPrice)
          : (exitPrice - openTrade.entryPrice);

        if (daysOpen >= exitDays || (daysOpen > 0 && Math.abs(pnl / openTrade.entryPrice) > 0.02)) {
          trades.push({
            entryDate: openTrade.entryDate,
            exitDate: row.recorded_at.split(' ')[0],
            direction: openTrade.direction,
            entryPrice: openTrade.entryPrice.toFixed(2),
            exitPrice: exitPrice.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: ((pnl / openTrade.entryPrice) * 100).toFixed(2),
            signalType: strategy,
            durationDays: daysOpen
          });

          openTrade = null;
        }
      }
    }

    if (openTrade) {
      const lastRow = data[data.length - 1];
      trades.push({
        entryDate: openTrade.entryDate,
        exitDate: lastRow.recorded_at.split(' ')[0],
        direction: openTrade.direction,
        entryPrice: openTrade.entryPrice.toFixed(2),
        exitPrice: lastRow.current_price.toFixed(2),
        pnl: (lastRow.current_price - openTrade.entryPrice).toFixed(2),
        pnlPercent: (((lastRow.current_price - openTrade.entryPrice) / openTrade.entryPrice) * 100).toFixed(2),
        signalType: strategy,
        durationDays: data.length - openTrade.entryIndex
      });
    }

    return trades;
  }

  /**
   * Calculate performance metrics from trades
   */
  calculateMetrics(trades) {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        totalReturn: 0
      };
    }

    const pnls = trades.map(t => parseFloat(t.pnl));
    const wins = pnls.filter(p => p > 0).length;
    const winRate = (wins / pnls.length * 100).toFixed(2);

    const totalProfit = pnls.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const totalLoss = Math.abs(pnls.filter(p => p < 0).reduce((a, b) => a + b, 0));
    const profitFactor = totalLoss === 0 ? totalProfit : (totalProfit / totalLoss).toFixed(2);

    const totalReturn = pnls.reduce((a, b) => a + b, 0).toFixed(2);

    let cumulative = 0;
    let maxCumulative = 0;
    let maxDrawdown = 0;

    pnls.forEach(pnl => {
      cumulative += pnl;
      if (cumulative > maxCumulative) {
        maxCumulative = cumulative;
      }
      const dd = ((cumulative - maxCumulative) / maxCumulative) * 100;
      if (dd < maxDrawdown) {
        maxDrawdown = dd;
      }
    });

    const avg = (totalReturn / pnls.length).toFixed(2);
    const stdDev = Math.sqrt(
      pnls.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pnls.length
    ).toFixed(4);

    const sharpeRatio = stdDev === 0 ? 0 : (avg / stdDev).toFixed(2);

    return {
      totalTrades: pnls.length,
      winRate: parseFloat(winRate),
      profitFactor: parseFloat(profitFactor),
      sharpeRatio: parseFloat(sharpeRatio),
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
      totalReturn: parseFloat(totalReturn)
    };
  }

  /**
   * Save backtest run to database
   */
  saveBacktestRun(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO backtest_runs (
          strategy_name, symbol, start_date, end_date, parameters_json,
          win_rate, profit_factor, sharpe_ratio, max_drawdown, total_return, total_trades
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        data.strategy_name,
        data.symbol,
        data.start_date,
        data.end_date,
        data.parameters_json,
        data.winRate,
        data.profitFactor,
        data.sharpeRatio,
        data.maxDrawdown,
        data.totalReturn,
        data.totalTrades
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Get backtest results by ID
   */
  getBacktestResults(runId) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM backtest_runs WHERE id = ?';
      this.db.get(sql, [runId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * List all backtest runs
   */
  listBacktestRuns(symbol = null, limit = 50) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM backtest_runs';
      const params = [];

      if (symbol) {
        sql += ' WHERE symbol = ?';
        params.push(symbol);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

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
   * Compare multiple backtest runs
   */
  async compareRuns(runIds = []) {
    try {
      const runs = await Promise.all(
        runIds.map(id => this.getBacktestResults(id))
      );

      return {
        runs: runs.filter(r => r),
        comparison: {
          bestWinRate: Math.max(...runs.map(r => r.win_rate || 0)).toFixed(2),
          bestProfitFactor: Math.max(...runs.map(r => r.profit_factor || 0)).toFixed(2),
          bestSharpe: Math.max(...runs.map(r => r.sharpe_ratio || 0)).toFixed(2),
          bestReturn: Math.max(...runs.map(r => r.total_return || 0)).toFixed(2)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate signal accuracy (win rate by signal type)
   */
  async getSignalAccuracy(symbol) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT signal_type,
               COUNT(*) as total_signals,
               SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_signals,
               ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as accuracy
        FROM backtest_trades
        WHERE symbol = ?
        GROUP BY signal_type
      `;

      this.db.all(sql, [symbol], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
}

export default new BacktestService();
