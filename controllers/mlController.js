/**
 * ML Controller
 * Handles machine learning prediction API endpoints
 */

import mlService from '../services/mlService.js';

class MLController {
  /**
   * GET /api/ml/patterns/:symbol?days=30
   * Detect patterns in market data
   */
  async getPatterns(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const result = await mlService.detectPatterns(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error detecting patterns:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to detect patterns'
      });
    }
  }

  /**
   * GET /api/ml/predict/:symbol?days=30
   * Predict next PCR value using linear regression
   */
  async predictNextValue(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const prediction = await mlService.predictNextValue(symbol, parseInt(days));

      if (!prediction.currentValue) {
        return res.status(404).json({
          success: false,
          error: prediction.message || 'Unable to make prediction'
        });
      }

      return res.status(200).json({
        success: true,
        data: prediction,
        metadata: {
          symbol,
          days: parseInt(days),
          method: 'linear_regression',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error predicting value:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to predict value'
      });
    }
  }

  /**
   * GET /api/ml/anomalies?symbols=NIFTY&days=7&threshold=2.5
   * Detect anomalies in market data
   */
  async getAnomalies(req, res) {
    try {
      const { symbols, days = 7, threshold = 2.5 } = req.query;

      const symbol = symbols ? (typeof symbols === 'string' ? symbols : symbols[0]) : null;

      const result = await mlService.detectAnomalies(symbol, parseInt(days), parseFloat(threshold));

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          symbol: symbol || 'all',
          days: parseInt(days),
          threshold: parseFloat(threshold),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to detect anomalies'
      });
    }
  }

  /**
   * GET /api/ml/signal-accuracy/:symbol?days=30
   * Get historical signal accuracy
   */
  async getSignalAccuracy(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const result = await mlService.getSignalAccuracy(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          symbol,
          days: parseInt(days),
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

  /**
   * GET /api/ml/trend-reversal/:symbol?days=20
   * Get trend reversal probability
   */
  async getTrendReversal(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 20 } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const result = await mlService.getTrendReversal(symbol, parseInt(days));

      return res.status(200).json({
        success: true,
        data: result,
        metadata: {
          symbol,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error calculating trend reversal:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to calculate trend reversal'
      });
    }
  }
}

export default new MLController();
