/**
 * Enhanced Option Chain Service
 * Integrates Greeks calculations, Max Pain, and PCR analysis with NSE option chain data
 */

import greeksService from './greeksService.js';
import maxPainService from './maxPainService.js';
import pcrAlertsService from './pcrAlertsService.js';

class OptionChainEnhancedService {
  /**
   * Fetch and enhance option chain with Greeks, Max Pain, and PCR
   *
   * @param {Array} optionChainData - Raw NSE option chain data
   * @param {Object} options - Configuration options
   * @returns {Object} Enhanced option chain with all analytics
   */
  enhanceOptionChain(optionChainData, options = {}) {
    if (!optionChainData || optionChainData.length === 0) {
      return this.getEmptyChainResponse();
    }

    const {
      riskFreeRate = 0.06,
      includeGreeks = true,
      includeMaxPain = true,
      includePCR = true
    } = options;

    const underlying = optionChainData[0];
    const spotPrice = underlying.underlyingValue;
    const expiryDate = underlying.expiryDate || optionChainData[0].CE?.expiryDate;

    // Calculate days to expiry
    const daysToExpiry = this.calculateDaysToExpiry(expiryDate);
    const timeToExpiry = daysToExpiry / 365;

    // Enhance each strike with Greeks
    const enhancedStrikes = optionChainData.map(row =>
      this.enhanceStrike(row, spotPrice, timeToExpiry, riskFreeRate, includeGreeks)
    );

    // Calculate Max Pain if requested
    let maxPainAnalysis = null;
    if (includeMaxPain) {
      maxPainAnalysis = maxPainService.calculateMaxPain(optionChainData);
    }

    // Calculate PCR and alerts if requested
    let pcrAnalysis = null;
    let pcrAlerts = null;
    if (includePCR) {
      pcrAnalysis = maxPainService.calculatePCR(optionChainData);
      pcrAlerts = pcrAlertsService.analyzePCR(pcrAnalysis.pcr, pcrAnalysis.pcr); // Would use previous PCR in production
    }

    // Calculate volatility skew
    const volatilityAnalysis = this.analyzeVolatilitySkew(enhancedStrikes, spotPrice);

    // Calculate ATM IV
    const atmIV = this.calculateATMIV(enhancedStrikes, spotPrice);

    return {
      underlying: {
        symbol: underlying.symbol || 'UNKNOWN',
        price: spotPrice,
        timestamp: new Date().toISOString()
      },
      expiryInfo: {
        expiryDate: expiryDate,
        daysToExpiry: daysToExpiry,
        timeToExpiry: timeToExpiry
      },
      strikes: enhancedStrikes,
      analysis: {
        pcr: pcrAnalysis ? {
          ratio: pcrAnalysis.pcr,
          sentiment: pcrAnalysis.sentiment.signal,
          confidence: pcrAnalysis.sentiment.confidence,
          totalCallOI: pcrAnalysis.totalCallOI,
          totalPutOI: pcrAnalysis.totalPutOI
        } : null,
        maxPain: maxPainAnalysis ? {
          level: maxPainAnalysis.maxPain,
          distance: maxPainAnalysis.distance,
          direction: maxPainAnalysis.direction,
          percentageMove: maxPainAnalysis.percentageMove,
          potentialLoss: maxPainAnalysis.maxPainLoss
        } : null,
        volatility: {
          atmIV: atmIV,
          skew: volatilityAnalysis.skew,
          pattern: volatilityAnalysis.pattern,
          callIVRange: volatilityAnalysis.callIVRange,
          putIVRange: volatilityAnalysis.putIVRange
        }
      },
      alerts: pcrAlerts ? pcrAlerts.alerts : [],
      metadata: {
        totalStrikesAnalyzed: enhancedStrikes.length,
        dataQuality: this.assessDataQuality(optionChainData),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Enhance a single strike row with Greeks calculations
   *
   * @private
   * @param {Object} row - Option chain row
   * @param {number} spotPrice - Current underlying price
   * @param {number} timeToExpiry - Time to expiry in years
   * @param {number} riskFreeRate - Risk-free rate
   * @param {boolean} includeGreeks - Whether to calculate Greeks
   * @returns {Object} Enhanced strike row
   */
  enhanceStrike(row, spotPrice, timeToExpiry, riskFreeRate, includeGreeks) {
    const strikePrice = row.strikePrice;
    const callRow = row.CE || {};
    const putRow = row.PE || {};

    const enhancedRow = {
      strike: strikePrice,
      isATM: Math.abs(spotPrice - strikePrice) < 0.5,
      call: {
        bid: callRow.bidPrice,
        ask: callRow.askPrice,
        lastPrice: callRow.lastPrice,
        iv: callRow.impliedVolatility,
        oi: callRow.openInterest,
        volume: callRow.totalTradedVolume,
        bid_ask_spread: callRow.askPrice - callRow.bidPrice || 0
      },
      put: {
        bid: putRow.bidPrice,
        ask: putRow.askPrice,
        lastPrice: putRow.lastPrice,
        iv: putRow.impliedVolatility,
        oi: putRow.openInterest,
        volume: putRow.totalTradedVolume,
        bid_ask_spread: putRow.askPrice - putRow.bidPrice || 0
      }
    };

    // Add Greeks if IV is available
    if (includeGreeks && callRow.impliedVolatility) {
      enhancedRow.callGreeks = greeksService.calculateAllGreeks(
        spotPrice,
        strikePrice,
        timeToExpiry,
        callRow.impliedVolatility,
        riskFreeRate,
        false // call
      );
    }

    if (includeGreeks && putRow.impliedVolatility) {
      enhancedRow.putGreeks = greeksService.calculateAllGreeks(
        spotPrice,
        strikePrice,
        timeToExpiry,
        putRow.impliedVolatility,
        riskFreeRate,
        true // put
      );
    }

    // OI analysis for this strike
    enhancedRow.oiAnalysis = {
      callOI: callRow.openInterest || 0,
      putOI: putRow.openInterest || 0,
      totalOI: (callRow.openInterest || 0) + (putRow.openInterest || 0),
      oiRatio: callRow.openInterest > 0 ? (putRow.openInterest || 0) / callRow.openInterest : 0
    };

    return enhancedRow;
  }

  /**
   * Calculate days to expiry from expiry date
   *
   * @private
   * @param {string|Date} expiryDate - Expiry date
   * @returns {number} Days to expiry
   */
  calculateDaysToExpiry(expiryDate) {
    if (!expiryDate) return 30; // Default assumption

    const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  /**
   * Calculate ATM (At The Money) Implied Volatility
   *
   * @private
   * @param {Array} enhancedStrikes - Enhanced strike data
   * @param {number} spotPrice - Current price
   * @returns {number} ATM IV
   */
  calculateATMIV(enhancedStrikes, spotPrice) {
    // Find closest strike to spot price
    const atmStrike = enhancedStrikes.reduce((closest, current) => {
      const closestDiff = Math.abs(closest.strike - spotPrice);
      const currentDiff = Math.abs(current.strike - spotPrice);
      return currentDiff < closestDiff ? current : closest;
    });

    // Average of call and put IV
    const callIV = atmStrike.call?.iv || 0;
    const putIV = atmStrike.put?.iv || 0;
    return (callIV + putIV) / 2 || 0;
  }

  /**
   * Analyze volatility skew pattern
   *
   * @private
   * @param {Array} enhancedStrikes - Enhanced strike data
   * @param {number} spotPrice - Current price
   * @returns {Object} Skew analysis
   */
  analyzeVolatilitySkew(enhancedStrikes, spotPrice) {
    const callIVs = enhancedStrikes
      .filter(s => s.call?.iv > 0)
      .map(s => s.call.iv);

    const putIVs = enhancedStrikes
      .filter(s => s.put?.iv > 0)
      .map(s => s.put.iv);

    const avgCallIV = callIVs.length > 0 ? callIVs.reduce((a, b) => a + b, 0) / callIVs.length : 0;
    const avgPutIV = putIVs.length > 0 ? putIVs.reduce((a, b) => a + b, 0) / putIVs.length : 0;

    let skew = 'symmetric';
    let pattern = 'neutral';

    if (avgPutIV > avgCallIV) {
      skew = 'put_skew';
      const magnitude = (avgPutIV - avgCallIV) / avgCallIV;
      if (magnitude > 0.1) pattern = 'strong_put_skew';
      else if (magnitude > 0.05) pattern = 'moderate_put_skew';
      else pattern = 'mild_put_skew';
    } else if (avgCallIV > avgPutIV) {
      skew = 'call_skew';
      const magnitude = (avgCallIV - avgPutIV) / avgPutIV;
      if (magnitude > 0.1) pattern = 'strong_call_skew';
      else if (magnitude > 0.05) pattern = 'moderate_call_skew';
      else pattern = 'mild_call_skew';
    }

    return {
      skew: skew,
      pattern: pattern,
      avgCallIV: avgCallIV.toFixed(4),
      avgPutIV: avgPutIV.toFixed(4),
      callIVRange: {
        min: Math.min(...callIVs).toFixed(4),
        max: Math.max(...callIVs).toFixed(4)
      },
      putIVRange: {
        min: Math.min(...putIVs).toFixed(4),
        max: Math.max(...putIVs).toFixed(4)
      }
    };
  }

  /**
   * Assess data quality of option chain
   *
   * @private
   * @param {Array} optionChainData - Raw option chain data
   * @returns {Object} Data quality metrics
   */
  assessDataQuality(optionChainData) {
    let strikesWithIV = 0;
    let strikesWithOI = 0;
    let strikesWithVolume = 0;

    optionChainData.forEach(row => {
      if (row.CE?.impliedVolatility || row.PE?.impliedVolatility) strikesWithIV++;
      if (row.CE?.openInterest || row.PE?.openInterest) strikesWithOI++;
      if (row.CE?.totalTradedVolume || row.PE?.totalTradedVolume) strikesWithVolume++;
    });

    return {
      totalStrikes: optionChainData.length,
      strikesWithIV: strikesWithIV,
      strikesWithOI: strikesWithOI,
      strikesWithVolume: strikesWithVolume,
      ivCoverage: ((strikesWithIV / optionChainData.length) * 100).toFixed(1) + '%',
      oiCoverage: ((strikesWithOI / optionChainData.length) * 100).toFixed(1) + '%',
      qualityScore: ((strikesWithIV + strikesWithOI + strikesWithVolume) / (optionChainData.length * 3) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Get empty chain response structure
   *
   * @private
   * @returns {Object} Empty response
   */
  getEmptyChainResponse() {
    return {
      underlying: {
        symbol: 'N/A',
        price: 0,
        timestamp: new Date().toISOString()
      },
      expiryInfo: {
        expiryDate: null,
        daysToExpiry: 0,
        timeToExpiry: 0
      },
      strikes: [],
      analysis: {
        pcr: null,
        maxPain: null,
        volatility: null
      },
      alerts: [],
      metadata: {
        totalStrikesAnalyzed: 0,
        dataQuality: { qualityScore: '0%' },
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Generate trading signals based on enhanced analysis
   *
   * @param {Object} enhancedChain - Enhanced option chain data
   * @returns {Object} Trading signals and recommendations
   */
  generateTradingSignals(enhancedChain) {
    if (!enhancedChain.analysis.pcr) return null;

    const pcr = enhancedChain.analysis.pcr.ratio;
    const maxPain = enhancedChain.analysis.maxPain.level;
    const currentPrice = enhancedChain.underlying.price;

    return {
      signals: {
        pcr: pcrAlertsService.generateTradingRecommendations(pcr, currentPrice, maxPain),
        shortTermBias: this.determineShortTermBias(enhancedChain),
        volatilityBias: this.determineVolatilityBias(enhancedChain)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Determine short-term price bias from max pain and current price
   *
   * @private
   * @param {Object} enhancedChain - Enhanced chain data
   * @returns {Object} Bias analysis
   */
  determineShortTermBias(enhancedChain) {
    const currentPrice = enhancedChain.underlying.price;
    const maxPain = enhancedChain.analysis.maxPain.level;
    const distance = Math.abs(currentPrice - maxPain);
    const priceRange = Math.max(...enhancedChain.strikes.map(s => s.strike)) -
                      Math.min(...enhancedChain.strikes.map(s => s.strike));

    let bias = 'neutral';
    let confidence = 0;

    if (distance > priceRange * 0.15) {
      if (currentPrice > maxPain) {
        bias = 'downside';
        confidence = Math.min(distance / (priceRange * 0.25), 1.0);
      } else {
        bias = 'upside';
        confidence = Math.min(distance / (priceRange * 0.25), 1.0);
      }
    }

    return { bias, confidence };
  }

  /**
   * Determine volatility expansion/contraction bias
   *
   * @private
   * @param {Object} enhancedChain - Enhanced chain data
   * @returns {Object} Volatility bias
   */
  determineVolatilityBias(enhancedChain) {
    const atmIV = parseFloat(enhancedChain.analysis.volatility.atmIV);

    let bias = 'normal';
    let signal = 'neutral';

    if (atmIV > 25) {
      bias = 'high';
      signal = 'Volatility expansion risk - consider selling options';
    } else if (atmIV < 15) {
      bias = 'low';
      signal = 'Volatility compression - consider buying options';
    }

    return { bias, signal, atmIV };
  }
}

export default new OptionChainEnhancedService();
