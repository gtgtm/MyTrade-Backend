/**
 * Backtest Controller
 * Handles backtesting API endpoints
 */

import backtestService from '../services/backtestService.js';

class BacktestController {
  /**
   * POST /api/backtest/run
   * Run a backtest with provided parameters
   */
  async runBacktest(req, res) {
    try {
      const { symbol, days = 90, strategy = 'pcr', pcrThreshold = 1.2 } = req.body;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const result = await backtestService.runBacktest(symbol, {
        startDate,
        endDate,
        strategy,
        pcrThreshold: parseFloat(pcrThreshold)
      });

      return res.status(200).json({
        success: true,
        data: {
          runId: result.runId,
          symbol: result.symbol,
          startDate: result.startDate,
          endDate: result.endDate,
          trades: result.trades,
          metrics: result.metrics
        },
        metadata: {
          strategy,
          daysAnalyzed: days,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error running backtest:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to run backtest'
      });
    }
  }

  /**
   * GET /api/backtest/results/:id
   * Get backtest results by ID
   */
  async getResults(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Backtest ID is required'
        });
      }

      const result = await backtestService.getBacktestResults(id);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Backtest not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting backtest results:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get backtest results'
      });
    }
  }

  /**
   * GET /api/backtest/list?symbol=NIFTY&limit=50
   * List all backtests
   */
  async listBacktests(req, res) {
    try {
      const { symbol, limit = 50 } = req.query;

      const runs = await backtestService.listBacktestRuns(symbol, parseInt(limit));

      return res.status(200).json({
        success: true,
        data: runs,
        metadata: {
          total: runs.length,
          symbol: symbol || 'all',
          limit: parseInt(limit),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error listing backtests:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to list backtests'
      });
    }
  }

  /**
   * GET /api/backtest/compare?ids=1,2,3
   * Compare multiple backtest runs
   */
  async compareRuns(req, res) {
    try {
      const { ids } = req.query;

      if (!ids) {
        return res.status(400).json({
          success: false,
          error: 'At least one backtest ID is required'
        });
      }

      const runIds = typeof ids === 'string'
        ? ids.split(',').map(id => parseInt(id.trim()))
        : ids.map(id => parseInt(id));

      const comparison = await backtestService.compareRuns(runIds);

      return res.status(200).json({
        success: true,
        data: comparison,
        metadata: {
          runCount: comparison.runs.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error comparing backtests:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to compare backtests'
      });
    }
  }

  /**
   * GET /api/backtest/signal-accuracy/:symbol
   * Get signal accuracy metrics by signal type
   */
  async getSignalAccuracy(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const accuracy = await backtestService.getSignalAccuracy(symbol);

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          signalMetrics: accuracy
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting signal accuracy:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get signal accuracy'
      });
    }
  }
}

export default new BacktestController();
