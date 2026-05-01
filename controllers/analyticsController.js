/**
 * Analytics Controller
 * Handles technical analysis API endpoints
 */

import analyticsService from '../services/analyticsService.js';
import historicalDataService from '../services/historicalDataService.js';

class AnalyticsController {
  /**
   * GET /api/analytics/technical/:symbol?days=30
   * Get technical indicators (MA, RSI, MACD, Bollinger)
   */
  async getTechnicalAnalysis(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const analysis = await analyticsService.getTechnicalAnalysis(symbol, parseInt(days));

      if (!analysis.success === false && !analysis.symbol) {
        return res.status(404).json({
          success: false,
          error: analysis.message || 'No analysis available'
        });
      }

      return res.status(200).json({
        success: true,
        data: analysis,
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting technical analysis:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get technical analysis'
      });
    }
  }

  /**
   * GET /api/analytics/volatility/:symbol?days=30
   * Get volatility analysis (IV percentile, levels)
   */
  async getVolatilityAnalysis(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const analysis = await analyticsService.getVolatilityAnalysis(symbol, parseInt(days));

      if (!analysis.success === false && !analysis.symbol) {
        return res.status(404).json({
          success: false,
          error: analysis.message || 'No volatility data available'
        });
      }

      return res.status(200).json({
        success: true,
        data: analysis,
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting volatility analysis:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get volatility analysis'
      });
    }
  }

  /**
   * GET /api/analytics/correlation?symbols=NIFTY,BANKNIFTY,SENSEX&days=30
   * Get correlation matrix between symbols
   */
  async getCorrelationMatrix(req, res) {
    try {
      const { symbols = 'NIFTY,BANKNIFTY,SENSEX', days = 30 } = req.query;
      const symbolList = typeof symbols === 'string' ? symbols.split(',') : symbols;

      const correlation = await analyticsService.getCorrelationMatrix(symbolList, parseInt(days));

      return res.status(200).json({
        success: true,
        data: correlation,
        metadata: {
          symbols: symbolList,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting correlation matrix:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get correlation matrix'
      });
    }
  }

  /**
   * GET /api/analytics/trend/:symbol?days=20
   * Get trend strength analysis
   */
  async getTrendStrength(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 20 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const trend = await analyticsService.getTrendStrength(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: trend,
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting trend strength:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get trend strength'
      });
    }
  }

  /**
   * GET /api/analytics/support-resistance/:symbol?days=30
   * Get support and resistance levels
   */
  async getSupportResistance(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const prices = await analyticsService.getTechnicalAnalysis(symbol, parseInt(days));

      if (!prices.symbol) {
        return res.status(404).json({
          success: false,
          error: 'No price data available'
        });
      }

      const pcr = await historicalDataService.getPCRHistory(symbol, parseInt(days));
      const pcrPrices = pcr.map(p => p.pcr_ratio);

      const levels = analyticsService.calculateSupportResistance(pcrPrices);

      return res.status(200).json({
        success: true,
        data: {
          symbol,
          ...levels,
          interpretation: {
            support: levels.support ? `Strong support near ${levels.support.toFixed(4)}` : 'No clear support',
            resistance: levels.resistance ? `Strong resistance near ${levels.resistance.toFixed(4)}` : 'No clear resistance'
          }
        },
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting support/resistance:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get support/resistance'
      });
    }
  }
}

export default new AnalyticsController();
