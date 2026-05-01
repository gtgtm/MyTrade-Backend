/**
 * Option Chain Controller
 * Handles requests for enhanced option chain data with Greeks, Max Pain, and PCR
 */

import optionChainEnhancedService from '../services/optionChainEnhancedService.js';
import pcrAlertsService from '../services/pcrAlertsService.js';
import nseService from '../services/nseService.js';

// Helper: Fetch option chain with fallback to mock data
async function fetchOptionChainSafe(symbol) {
  try {
    return await nseService.fetchOptionChain(symbol);
  } catch (error) {
    console.warn(`⚠️  NSE fetch failed for ${symbol}, using mock data:`, error.message);
    return nseService.mockData(symbol);
  }
}

class OptionChainController {
  /**
   * GET /api/option-chain/:symbol
   * Returns enhanced option chain with Greeks, Max Pain, and PCR analysis
   */
  async getEnhancedOptionChain(req, res) {
    try {
      const { symbol } = req.params;
      const { includeGreeks = true, includeMaxPain = true, includePCR = true } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      // Fetch option chain from NSE service with fallback
      let optionChain;
      try {
        optionChain = await nseService.fetchOptionChain(symbol);
      } catch (error) {
        console.warn(`⚠️  NSE fetch failed for ${symbol}, using mock data:`, error.message);
        optionChain = nseService.mockData(symbol);
      }

      if (!optionChain || optionChain.length === 0) {
        // Final fallback to mock data
        optionChain = nseService.mockData(symbol);
      }

      // Enhance with Greeks, Max Pain, and PCR
      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(
        optionChain,
        {
          includeGreeks: includeGreeks === 'true' || includeGreeks === true,
          includeMaxPain: includeMaxPain === 'true' || includeMaxPain === true,
          includePCR: includePCR === 'true' || includePCR === true
        }
      );

      return res.status(200).json({
        success: true,
        data: enhancedChain,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching enhanced option chain:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch option chain'
      });
    }
  }

  /**
   * GET /api/option-chain/:symbol/strikes
   * Returns only strike-specific data (Greeks, OI, IV) for technical analysis
   */
  async getStrikesData(req, res) {
    try {
      const { symbol } = req.params;
      const { format = 'detailed' } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const optionChain = await fetchOptionChainSafe(symbol);

      if (!optionChain || optionChain.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No option chain data found for ${symbol}`
        });
      }

      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(optionChain);

      const strikesData = format === 'compact' ?
        enhancedChain.strikes.map(s => ({
          strike: s.strike,
          isATM: s.isATM,
          callIV: s.call?.iv,
          putIV: s.put?.iv,
          callOI: s.oiAnalysis.callOI,
          putOI: s.oiAnalysis.putOI,
          callDelta: s.callGreeks?.delta,
          putDelta: s.putGreeks?.delta
        })) :
        enhancedChain.strikes;

      return res.status(200).json({
        success: true,
        data: {
          symbol: symbol,
          currentPrice: enhancedChain.underlying.price,
          daysToExpiry: enhancedChain.expiryInfo.daysToExpiry,
          strikes: strikesData,
          count: strikesData.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching strikes data:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch strikes data'
      });
    }
  }

  /**
   * GET /api/option-chain/:symbol/max-pain
   * Returns Max Pain analysis and levels
   */
  async getMaxPainAnalysis(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const optionChain = await fetchOptionChainSafe(symbol);

      if (!optionChain || optionChain.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No option chain data found for ${symbol}`
        });
      }

      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(optionChain);

      return res.status(200).json({
        success: true,
        data: {
          symbol: symbol,
          currentPrice: enhancedChain.underlying.price,
          maxPain: enhancedChain.analysis.maxPain,
          daysToExpiry: enhancedChain.expiryInfo.daysToExpiry
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching max pain analysis:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch max pain analysis'
      });
    }
  }

  /**
   * GET /api/signals/:symbol/pcr-analysis
   * Returns PCR analysis with alerts and signals
   */
  async getPCRAnalysis(req, res) {
    try {
      const { symbol } = req.params;
      const { includeTradingSignals = true } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const optionChain = await fetchOptionChainSafe(symbol);

      if (!optionChain || optionChain.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No option chain data found for ${symbol}`
        });
      }

      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(optionChain);

      const currentPCR = enhancedChain.analysis.pcr.ratio;
      const previousPCR = currentPCR;

      const pcrAnalysis = pcrAlertsService.analyzePCR(currentPCR, previousPCR);

      let tradingSignals = null;
      if (includeTradingSignals === 'true' || includeTradingSignals === true) {
        tradingSignals = optionChainEnhancedService.generateTradingSignals(enhancedChain);
      }

      return res.status(200).json({
        success: true,
        data: {
          symbol: symbol,
          currentPrice: enhancedChain.underlying.price,
          expiryDate: enhancedChain.expiryInfo.expiryDate,
          daysToExpiry: enhancedChain.expiryInfo.daysToExpiry,
          pcrAnalysis: {
            pcr: pcrAnalysis.currentPCR,
            previousPCR: pcrAnalysis.previousPCR,
            change: pcrAnalysis.change,
            signal: pcrAnalysis.signal,
            confidence: pcrAnalysis.confidence,
            actionable: pcrAnalysis.actionable
          },
          oiData: {
            totalCallOI: enhancedChain.analysis.pcr.totalCallOI,
            totalPutOI: enhancedChain.analysis.pcr.totalPutOI
          },
          maxPain: enhancedChain.analysis.maxPain,
          volatility: enhancedChain.analysis.volatility,
          alerts: pcrAnalysis.alerts,
          criticalAlerts: pcrAlertsService.getCriticalAlerts(pcrAnalysis),
          tradingSignals: tradingSignals,
          requiresAction: pcrAlertsService.requiresImmediateAction(currentPCR)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching PCR analysis:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch PCR analysis'
      });
    }
  }

  /**
   * GET /api/option-chain/multi/:symbols
   * Returns enhanced option chain for multiple symbols
   */
  async getMultipleOptionChains(req, res) {
    try {
      const { symbols } = req.params;
      const symbolArray = symbols.split(',').map(s => s.toUpperCase().trim());

      if (symbolArray.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one symbol is required'
        });
      }

      const results = await Promise.allSettled(
        symbolArray.map(async (symbol) => {
          const optionChain = await fetchOptionChainSafe(symbol);
          if (!optionChain || optionChain.length === 0) {
            return { symbol, error: 'No data found' };
          }
          return {
            symbol,
            data: optionChainEnhancedService.enhanceOptionChain(optionChain)
          };
        })
      );

      const successfulResults = results
        .filter(r => r.status === 'fulfilled' && !r.value.error)
        .map(r => r.value);

      const failedResults = results
        .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error))
        .map(r => r.status === 'rejected' ? { error: r.reason } : r.value);

      return res.status(200).json({
        success: true,
        data: successfulResults,
        failed: failedResults,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching multiple option chains:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch option chains'
      });
    }
  }

  /**
   * GET /api/option-chain/:symbol/alerts
   * Returns only critical alerts for immediate action
   */
  async getCriticalAlerts(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol is required'
        });
      }

      const optionChain = await fetchOptionChainSafe(symbol);

      if (!optionChain || optionChain.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No option chain data found for ${symbol}`
        });
      }

      const enhancedChain = optionChainEnhancedService.enhanceOptionChain(optionChain);
      const currentPCR = enhancedChain.analysis.pcr.ratio;
      const previousPCR = currentPCR;

      const analysis = pcrAlertsService.analyzePCR(currentPCR, previousPCR);
      const criticalAlerts = pcrAlertsService.getCriticalAlerts(analysis);

      return res.status(200).json({
        success: true,
        data: {
          symbol: symbol,
          hasCriticalAlerts: criticalAlerts.length > 0,
          alerts: criticalAlerts,
          pcr: currentPCR,
          maxPain: enhancedChain.analysis.maxPain.level,
          currentPrice: enhancedChain.underlying.price
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching critical alerts:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch critical alerts'
      });
    }
  }
}

export default new OptionChainController();
