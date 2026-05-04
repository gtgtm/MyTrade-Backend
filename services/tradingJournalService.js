/**
 * Trading Journal Service
 * Tracks all trades, P&L, and performance metrics
 */

class TradingJournalService {
  constructor() {
    this.trades = new Map(); // userId -> [trades]
    this.stats = new Map();  // userId -> stats
  }

  /**
   * Record a new trade
   */
  recordTrade(userId, trade) {
    if (!this.trades.has(userId)) {
      this.trades.set(userId, []);
    }

    const tradeRecord = {
      id: `${userId}_${Date.now()}`,
      userId,
      ...trade,
      createdAt: new Date().toISOString(),
      status: 'open' // open, closed, cancelled
    };

    this.trades.get(userId).push(tradeRecord);
    console.log(`📝 Trade recorded for ${userId}:`, tradeRecord);

    return tradeRecord;
  }

  /**
   * Close a trade with exit price and P&L
   */
  closeTrade(userId, tradeId, exitPrice, exitReason = 'manual') {
    const userTrades = this.trades.get(userId);
    if (!userTrades) return null;

    const trade = userTrades.find(t => t.id === tradeId);
    if (!trade) return null;

    const quantity = trade.quantity || 1;
    const pnl = (exitPrice - trade.entryPrice) * quantity * (trade.signalType === 'BUY PUT' ? -1 : 1);
    const pnlPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice * 100);
    const riskTaken = Math.abs(trade.entryPrice - trade.stopLoss) * quantity;
    const profitTarget = Math.abs(trade.target - trade.entryPrice) * quantity;

    trade.status = 'closed';
    trade.exitPrice = exitPrice;
    trade.exitReason = exitReason;
    trade.exitTime = new Date().toISOString();
    trade.pnl = pnl;
    trade.pnlPercent = pnlPercent;
    trade.riskTaken = riskTaken;
    trade.riskRewardRatio = profitTarget > 0 ? profitTarget / riskTaken : 0;

    console.log(`✅ Trade closed:`, trade);

    // Update stats
    this.updateStats(userId);

    return trade;
  }

  /**
   * Get all trades for a user
   */
  getUserTrades(userId, status = null) {
    const trades = this.trades.get(userId) || [];
    if (status) {
      return trades.filter(t => t.status === status);
    }
    return trades;
  }

  /**
   * Get trade performance statistics
   */
  getStats(userId) {
    return this.stats.get(userId) || this.calculateStats(userId);
  }

  /**
   * Calculate and update statistics
   */
  updateStats(userId) {
    const stats = this.calculateStats(userId);
    this.stats.set(userId, stats);
    return stats;
  }

  /**
   * Calculate stats from trades
   */
  calculateStats(userId) {
    const trades = this.trades.get(userId) || [];
    const closedTrades = trades.filter(t => t.status === 'closed');

    if (closedTrades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        avgRiskReward: 0,
        bestTrade: null,
        worstTrade: null
      };
    }

    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalPnlPercent = closedTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losses.length : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
    const avgRiskReward = closedTrades.reduce((sum, t) => sum + (t.riskRewardRatio || 0), 0) / closedTrades.length;

    const bestTrade = closedTrades.reduce((best, t) => (t.pnl > (best?.pnl || 0) ? t : best), null);
    const worstTrade = closedTrades.reduce((worst, t) => (t.pnl < (worst?.pnl || Infinity) ? t : worst), null);

    return {
      totalTrades: closedTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: (wins.length / closedTrades.length * 100).toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      totalPnlPercent: totalPnlPercent.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      avgRiskReward: avgRiskReward.toFixed(2),
      bestTrade,
      worstTrade
    };
  }

  /**
   * Get trades by symbol
   */
  getTradesBySymbol(userId, symbol) {
    const trades = this.trades.get(userId) || [];
    return trades.filter(t => t.symbol === symbol);
  }

  /**
   * Get daily P&L
   */
  getDailyPnl(userId, date = null) {
    const targetDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const trades = this.trades.get(userId) || [];

    const dayTrades = trades.filter(t => {
      const tradeDate = new Date(t.exitTime || t.createdAt).toISOString().split('T')[0];
      return tradeDate === targetDate && t.status === 'closed';
    });

    const pnl = dayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const trades_count = dayTrades.length;

    return {
      date: targetDate,
      totalPnl: pnl.toFixed(2),
      tradesCount: trades_count,
      trades: dayTrades
    };
  }

  /**
   * Get weekly performance
   */
  getWeeklyStats(userId) {
    const trades = this.trades.get(userId) || [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weekTrades = trades.filter(t => {
      const tradeTime = new Date(t.exitTime || t.createdAt);
      return tradeTime >= weekAgo && t.status === 'closed';
    });

    const pnl = weekTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    return {
      period: '7_days',
      totalTrades: weekTrades.length,
      totalPnl: pnl.toFixed(2),
      avgTradeSize: weekTrades.length > 0 ? (pnl / weekTrades.length).toFixed(2) : 0,
      bestSymbol: this.getBestSymbol(weekTrades)
    };
  }

  /**
   * Get monthly performance
   */
  getMonthlyStats(userId) {
    const trades = this.trades.get(userId) || [];
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const monthTrades = trades.filter(t => {
      const tradeTime = new Date(t.exitTime || t.createdAt);
      return tradeTime >= monthAgo && t.status === 'closed';
    });

    const pnl = monthTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    return {
      period: '30_days',
      totalTrades: monthTrades.length,
      totalPnl: pnl.toFixed(2),
      avgTradeSize: monthTrades.length > 0 ? (pnl / monthTrades.length).toFixed(2) : 0,
      bestSymbol: this.getBestSymbol(monthTrades)
    };
  }

  /**
   * Find best performing symbol
   */
  getBestSymbol(trades) {
    const bySymbol = {};
    trades.forEach(t => {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = 0;
      bySymbol[t.symbol] += t.pnl || 0;
    });

    let best = null;
    let maxPnl = -Infinity;
    for (const [symbol, pnl] of Object.entries(bySymbol)) {
      if (pnl > maxPnl) {
        maxPnl = pnl;
        best = symbol;
      }
    }
    return best;
  }

  /**
   * Cancel a trade
   */
  cancelTrade(userId, tradeId) {
    const userTrades = this.trades.get(userId);
    if (!userTrades) return null;

    const trade = userTrades.find(t => t.id === tradeId);
    if (!trade) return null;

    trade.status = 'cancelled';
    console.log(`❌ Trade cancelled:`, trade);
    return trade;
  }
}

export default new TradingJournalService();
