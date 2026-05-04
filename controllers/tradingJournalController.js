import tradingJournalService from '../services/tradingJournalService.js';

class TradingJournalController {
  /**
   * POST /api/trades/record
   * Record a new trade
   */
  static async recordTrade(req, res) {
    try {
      const { userId, symbol, signalType, entryPrice, stopLoss, target, quantity = 1 } = req.body;

      if (!userId || !symbol || !signalType || !entryPrice || !stopLoss || !target) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, symbol, signalType, entryPrice, stopLoss, target'
        });
      }

      const trade = tradingJournalService.recordTrade(userId, {
        symbol,
        signalType,
        entryPrice: parseFloat(entryPrice),
        stopLoss: parseFloat(stopLoss),
        target: parseFloat(target),
        quantity: parseInt(quantity)
      });

      res.status(201).json({
        success: true,
        message: 'Trade recorded successfully',
        data: trade,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error recording trade:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to record trade'
      });
    }
  }

  /**
   * POST /api/trades/:tradeId/close
   * Close a trade
   */
  static async closeTrade(req, res) {
    try {
      const { tradeId } = req.params;
      const { userId, exitPrice, exitReason = 'manual' } = req.body;

      if (!userId || !exitPrice) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, exitPrice'
        });
      }

      const trade = tradingJournalService.closeTrade(userId, tradeId, parseFloat(exitPrice), exitReason);

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found'
        });
      }

      res.json({
        success: true,
        message: 'Trade closed successfully',
        data: trade,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to close trade'
      });
    }
  }

  /**
   * GET /api/trades/:userId
   * Get all trades for a user
   */
  static async getUserTrades(req, res) {
    try {
      const { userId } = req.params;
      const { status } = req.query;

      const trades = tradingJournalService.getUserTrades(userId, status);

      res.json({
        success: true,
        data: trades,
        count: trades.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting user trades:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get trades'
      });
    }
  }

  /**
   * GET /api/trades/:userId/stats
   * Get trading statistics
   */
  static async getStats(req, res) {
    try {
      const { userId } = req.params;

      const stats = tradingJournalService.getStats(userId);

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get stats'
      });
    }
  }

  /**
   * GET /api/trades/:userId/daily/:date
   * Get daily P&L
   */
  static async getDailyPnl(req, res) {
    try {
      const { userId, date } = req.params;

      const dailyPnl = tradingJournalService.getDailyPnl(userId, date);

      res.json({
        success: true,
        data: dailyPnl,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting daily P&L:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get daily P&L'
      });
    }
  }

  /**
   * GET /api/trades/:userId/weekly
   * Get weekly performance
   */
  static async getWeeklyStats(req, res) {
    try {
      const { userId } = req.params;

      const weeklyStats = tradingJournalService.getWeeklyStats(userId);

      res.json({
        success: true,
        data: weeklyStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting weekly stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get weekly stats'
      });
    }
  }

  /**
   * GET /api/trades/:userId/monthly
   * Get monthly performance
   */
  static async getMonthlyStats(req, res) {
    try {
      const { userId } = req.params;

      const monthlyStats = tradingJournalService.getMonthlyStats(userId);

      res.json({
        success: true,
        data: monthlyStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting monthly stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get monthly stats'
      });
    }
  }

  /**
   * GET /api/trades/:userId/symbol/:symbol
   * Get trades for a specific symbol
   */
  static async getTradesBySymbol(req, res) {
    try {
      const { userId, symbol } = req.params;

      const trades = tradingJournalService.getTradesBySymbol(userId, symbol);

      res.json({
        success: true,
        data: trades,
        count: trades.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting trades by symbol:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get trades'
      });
    }
  }

  /**
   * DELETE /api/trades/:tradeId
   * Cancel a trade
   */
  static async cancelTrade(req, res) {
    try {
      const { tradeId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      const trade = tradingJournalService.cancelTrade(userId, tradeId);

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found'
        });
      }

      res.json({
        success: true,
        message: 'Trade cancelled successfully',
        data: trade,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error cancelling trade:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel trade'
      });
    }
  }
}

export default TradingJournalController;
