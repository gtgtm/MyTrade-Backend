import db from '../services/signalDatabase.js';

class StatsController {
  static async getStats(req, res) {
    const { symbol } = req.query;

    try {
      const stats = db.getStats(symbol);

      if (!stats || stats.length === 0) {
        return res.json({
          success: true,
          data: symbol ? null : [],
          message: 'No signal statistics available yet'
        });
      }

      res.json({
        success: true,
        data: symbol ? stats[0] : stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in getStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  }

  static async getHistory(req, res) {
    const { symbol, limit = 50 } = req.query;

    try {
      const history = db.getSignalHistory(symbol, parseInt(limit));

      res.json({
        success: true,
        data: history,
        count: history.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in getHistory:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch history'
      });
    }
  }

  static async recordOutcome(req, res) {
    const { signalId, hitTarget, hitStopLoss, highPrice, lowPrice, closingPrice } = req.body;

    if (!signalId) {
      return res.status(400).json({
        success: false,
        error: 'Signal ID required'
      });
    }

    try {
      // Calculate P&L
      const entryPrice = closingPrice || highPrice;
      const profitLoss = entryPrice - closingPrice;
      const profitPercent = (profitLoss / entryPrice) * 100;

      const outcome = {
        hitTarget: hitTarget || false,
        hitStopLoss: hitStopLoss || false,
        highPrice,
        lowPrice,
        closingPrice,
        profitLoss: parseFloat(profitLoss.toFixed(2)),
        profitPercent: parseFloat(profitPercent.toFixed(2)),
        actualDuration: Math.floor((Date.now() - Date.parse(req.body.startTime)) / 1000)
      };

      db.recordOutcome(signalId, outcome);

      res.json({
        success: true,
        message: 'Outcome recorded successfully',
        data: outcome
      });
    } catch (error) {
      console.error('Error recording outcome:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record outcome'
      });
    }
  }
}

export default StatsController;
