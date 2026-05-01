/**
 * Historical Data Controller
 * Endpoints for querying and analyzing historical market data
 */

import historicalDataService from '../services/historicalDataService.js';

class HistoricalDataController {
  /**
   * GET /api/history/pcr/:symbol
   * Returns PCR history with trend analysis
   */
  async getPCRHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 7 } = req.query;

      const history = await historicalDataService.getPCRHistory(symbol, parseInt(days));
      const trends = await historicalDataService.getTrendAnalysis(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          history,
          trends,
          dataPoints: history.length
        },
        metadata: {
          days: parseInt(days),
          recordCount: history.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching PCR history:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch PCR history'
      });
    }
  }

  /**
   * GET /api/history/max-pain/:symbol
   * Returns Max Pain evolution
   */
  async getMaxPainHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 7 } = req.query;

      const history = await historicalDataService.getMaxPainHistory(symbol, parseInt(days));

      // Calculate statistics
      if (history.length > 0) {
        const levels = history.map(h => h.max_pain_level);
        const stats = {
          current: history[0].max_pain_level,
          highest: Math.max(...levels),
          lowest: Math.min(...levels),
          average: levels.reduce((a, b) => a + b) / levels.length,
          volatility: Math.max(...levels) - Math.min(...levels)
        };

        return res.status(200).json({
          success: true,
          data: {
            symbol,
            history,
            statistics: stats
          },
          metadata: {
            days: parseInt(days),
            recordCount: history.length,
            timestamp: new Date().toISOString()
          }
        });
      }

      return res.status(404).json({
        success: false,
        error: 'No data found'
      });
    } catch (error) {
      console.error('Error fetching Max Pain history:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/iv/:symbol
   * Returns IV history per strike
   */
  async getIVHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { strike, days = 7 } = req.query;

      const history = await historicalDataService.getIVHistory(
        symbol,
        strike ? parseFloat(strike) : null,
        parseInt(days)
      );

      if (history.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No IV data found'
        });
      }

      // Group by strike if not filtered
      let grouped = history;
      if (!strike) {
        grouped = {};
        history.forEach(row => {
          if (!grouped[row.strike_price]) {
            grouped[row.strike_price] = [];
          }
          grouped[row.strike_price].push(row);
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          history: grouped,
          statistics: {
            avgATMIV: history.reduce((sum, h) => sum + h.atm_iv, 0) / history.length,
            maxIV: Math.max(...history.map(h => h.atm_iv)),
            minIV: Math.min(...history.map(h => h.atm_iv))
          }
        },
        metadata: {
          days: parseInt(days),
          recordCount: history.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching IV history:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/alerts/:symbol
   * Returns alerts history with summary
   */
  async getAlertsHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 7, severity } = req.query;

      const alerts = await historicalDataService.getAlertsHistory(
        symbol,
        parseInt(days),
        severity || null
      );

      // Summarize by severity
      const summary = {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length,
        total: alerts.length,
        acknowledged: alerts.filter(a => a.acknowledged).length,
        unacknowledged: alerts.filter(a => !a.acknowledged).length
      };

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          alerts,
          summary
        },
        metadata: {
          days: parseInt(days),
          recordCount: alerts.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching alerts history:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/daily-stats/:symbol
   * Returns daily statistical summaries
   */
  async getDailyStats(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      const stats = await historicalDataService.getDailyStats(symbol, parseInt(days));

      if (stats.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No daily statistics found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          dailyStats: stats,
          overallStats: {
            avgPCR: stats.reduce((sum, s) => sum + s.avg_pcr, 0) / stats.length,
            avgATMIV: stats.reduce((sum, s) => sum + (s.avg_atm_iv || 0), 0) / stats.length,
            avgMaxPain: stats.reduce((sum, s) => sum + s.avg_max_pain, 0) / stats.length
          }
        },
        metadata: {
          days: parseInt(days),
          daysWithData: stats.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/snapshots/:symbol
   * Returns daily/hourly snapshots
   */
  async getSnapshots(req, res) {
    try {
      const { symbol } = req.params;
      const { type = 'hourly', days = 30 } = req.query;

      const snapshots = await historicalDataService.getSnapshots(
        symbol,
        type,
        parseInt(days)
      );

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          snapshotType: type,
          snapshots,
          count: snapshots.length
        },
        metadata: {
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/comparison
   * Compare multiple indices
   */
  async compareSymbols(req, res) {
    try {
      const { symbols = 'NIFTY,BANKNIFTY,SENSEX' } = req.query;
      const { days = 7 } = req.query;

      const symbolArray = symbols.split(',').map(s => s.trim());
      const results = {};

      await Promise.all(
        symbolArray.map(async (symbol) => {
          try {
            const history = await historicalDataService.getPCRHistory(symbol, parseInt(days));
            const trends = await historicalDataService.getTrendAnalysis(symbol, parseInt(days));

            results[symbol] = {
              history,
              trends,
              latestPCR: history[0]?.pcr_ratio,
              avgPCR: trends?.avg_pcr,
              sentiment: history[0]?.sentiment
            };
          } catch (err) {
            results[symbol] = { error: err.message };
          }
        })
      );

      return res.status(200).json({
        success: true,
        data: results,
        metadata: {
          days: parseInt(days),
          symbolCount: symbolArray.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error comparing symbols:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/stats
   * Database statistics and usage
   */
  async getStats(req, res) {
    try {
      const stats = await historicalDataService.getStats();

      return res.status(200).json({
        success: true,
        data: stats,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching database stats:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/history/alerts/:id/acknowledge
   * Mark an alert as acknowledged
   */
  async acknowledgeAlert(req, res) {
    try {
      const { id } = req.params;

      await historicalDataService.acknowledgeAlert(parseInt(id));

      return res.status(200).json({
        success: true,
        message: 'Alert acknowledged',
        alertId: id
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/history/analysis/:symbol
   * Comprehensive analysis report
   */
  async getAnalysisReport(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      const [pcrHistory, maxPainHistory, dailyStats, alerts] = await Promise.all([
        historicalDataService.getPCRHistory(symbol, parseInt(days)),
        historicalDataService.getMaxPainHistory(symbol, parseInt(days)),
        historicalDataService.getDailyStats(symbol, parseInt(days)),
        historicalDataService.getAlertsHistory(symbol, parseInt(days))
      ]);

      const trends = await historicalDataService.getTrendAnalysis(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          period: `${parseInt(days)} days`,
          summary: {
            currentPCR: pcrHistory[0]?.pcr_ratio,
            currentSentiment: pcrHistory[0]?.sentiment,
            pcr: trends,
            maxPain: {
              current: maxPainHistory[0]?.max_pain_level,
              avg: maxPainHistory.reduce((sum, m) => sum + m.max_pain_level, 0) / maxPainHistory.length
            },
            alerts: {
              total: alerts.length,
              critical: alerts.filter(a => a.severity === 'critical').length,
              warning: alerts.filter(a => a.severity === 'warning').length,
              unacknowledged: alerts.filter(a => !a.acknowledged).length
            }
          },
          details: {
            pcrHistory: pcrHistory.slice(0, 10),
            maxPainHistory: maxPainHistory.slice(0, 10),
            dailyStats: dailyStats.slice(0, 10),
            recentAlerts: alerts.slice(0, 5)
          }
        },
        metadata: {
          days: parseInt(days),
          dataPoints: pcrHistory.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating analysis report:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new HistoricalDataController();
