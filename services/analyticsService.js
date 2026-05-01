/**
 * Analytics Service
 * Calculates technical indicators and market analytics
 * Uses pure mathematical functions - no external dependencies
 */

import historicalDataService from './historicalDataService.js';

class AnalyticsService {
  /**
   * Calculate Exponential Moving Average
   */
  calculateEMA(values, period) {
    if (values.length < period) return [];

    const multiplier = 2 / (period + 1);
    const ema = [];

    let sma = values.slice(0, period).reduce((a, b) => a + b) / period;
    ema.push(sma);

    for (let i = period; i < values.length; i++) {
      sma = (values[i] * multiplier) + (sma * (1 - multiplier));
      ema.push(sma);
    }

    return ema;
  }

  /**
   * Calculate Simple Moving Average
   */
  calculateSMA(values, period) {
    const sma = [];
    for (let i = 0; i <= values.length - period; i++) {
      const avg = values.slice(i, i + period).reduce((a, b) => a + b) / period;
      sma.push(avg);
    }
    return sma;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  calculateRSI(values, period = 14) {
    if (values.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < values.length; i++) {
      changes.push(values[i] - values[i - 1]);
    }

    let gains = 0, losses = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) gains += changes[i];
      else losses += Math.abs(changes[i]);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    const rsi = [];
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      if (change > 0) avgGain = (avgGain * (period - 1) + change) / period;
      else avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }

    return {
      current: rsi[rsi.length - 1],
      values: rsi,
      trend: rsi[rsi.length - 1] > 70 ? 'overbought' : rsi[rsi.length - 1] < 30 ? 'oversold' : 'neutral'
    };
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  calculateMACD(values, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.calculateEMA(values, fast);
    const emaSlow = this.calculateEMA(values, slow);

    const macd = [];
    const startIdx = slow - 1;
    for (let i = startIdx; i < emaFast.length; i++) {
      macd.push(emaFast[i - (slow - fast)] - emaSlow[i - startIdx]);
    }

    const signalLine = this.calculateEMA(macd, signal);
    const histogram = [];
    for (let i = 0; i < signalLine.length; i++) {
      histogram.push(macd[macd.length - signalLine.length + i] - signalLine[i]);
    }

    return {
      macd: macd[macd.length - 1],
      signal: signalLine[signalLine.length - 1],
      histogram: histogram[histogram.length - 1],
      trend: histogram[histogram.length - 1] > 0 ? 'bullish' : 'bearish'
    };
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(values, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(values, period);

    const bands = [];
    for (let i = 0; i <= values.length - period; i++) {
      const slice = values.slice(i, i + period);
      const mean = slice.reduce((a, b) => a + b) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);

      bands.push({
        middle: mean,
        upper: mean + (std * stdDev),
        lower: mean - (std * stdDev),
        width: 2 * std * stdDev
      });
    }

    const current = bands[bands.length - 1];
    const price = values[values.length - 1];
    let position = 'middle';
    if (price > current.upper) position = 'above';
    else if (price < current.lower) position = 'below';

    return {
      current,
      position,
      bands
    };
  }

  /**
   * Calculate Pearson Correlation between two arrays
   */
  calculateCorrelation(array1, array2) {
    const len = Math.min(array1.length, array2.length);
    if (len < 2) return 0;

    const arr1 = array1.slice(-len);
    const arr2 = array2.slice(-len);

    const mean1 = arr1.reduce((a, b) => a + b) / len;
    const mean2 = arr2.reduce((a, b) => a + b) / len;

    let numerator = 0, sum1 = 0, sum2 = 0;
    for (let i = 0; i < len; i++) {
      const dev1 = arr1[i] - mean1;
      const dev2 = arr2[i] - mean2;
      numerator += dev1 * dev2;
      sum1 += dev1 * dev1;
      sum2 += dev2 * dev2;
    }

    const denominator = Math.sqrt(sum1 * sum2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Find support and resistance levels
   */
  calculateSupportResistance(prices) {
    if (prices.length < 3) return { support: null, resistance: null };

    const local_max = [];
    const local_min = [];

    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
        local_max.push(prices[i]);
      } else if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
        local_min.push(prices[i]);
      }
    }

    const supportLevels = local_min.length > 0
      ? [
        Math.max(...local_min),
        (local_min.reduce((a, b) => a + b) / local_min.length)
      ]
      : [];

    const resistanceLevels = local_max.length > 0
      ? [
        Math.min(...local_max),
        (local_max.reduce((a, b) => a + b) / local_max.length)
      ]
      : [];

    return {
      support: supportLevels[0] || null,
      resistance: resistanceLevels[0] || null,
      supportLevels: supportLevels,
      resistanceLevels: resistanceLevels
    };
  }

  /**
   * Calculate volatility (standard deviation)
   */
  calculateVolatility(values, period = 20) {
    if (values.length < period) return 0;

    const recent = values.slice(-period);
    const mean = recent.reduce((a, b) => a + b) / period;
    const variance = recent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    return Math.sqrt(variance);
  }

  /**
   * Get technical analysis for a symbol
   */
  async getTechnicalAnalysis(symbol, days = 30) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);

      if (pcr.length < 2) {
        return { success: false, message: 'Insufficient data' };
      }

      const prices = pcr.map(p => p.pcr_ratio);

      const ma5 = this.calculateSMA(prices, 5);
      const ma20 = this.calculateSMA(prices, 20);
      const rsi = this.calculateRSI(prices, 14);
      const macd = this.calculateMACD(prices);
      const bb = this.calculateBollingerBands(prices, 20);

      return {
        symbol,
        dataPoints: prices.length,
        current: prices[prices.length - 1],
        movingAverages: {
          ma5: ma5.length > 0 ? ma5[ma5.length - 1] : null,
          ma20: ma20.length > 0 ? ma20[ma20.length - 1] : null,
          crossover: ma5.length > 0 && ma20.length > 0 ? ma5[ma5.length - 1] > ma20[ma20.length - 1] ? 'bullish' : 'bearish' : null
        },
        rsi,
        macd,
        bollingerBands: bb.current,
        volatility: this.calculateVolatility(prices, 20)
      };
    } catch (error) {
      console.error(`Error calculating technical analysis for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get correlation between symbols
   */
  async getCorrelationMatrix(symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'], days = 30) {
    try {
      const data = {};
      const pcrData = {};

      for (const symbol of symbols) {
        const pcr = await historicalDataService.getPCRHistory(symbol, days);
        pcrData[symbol] = pcr.map(p => p.pcr_ratio);
      }

      const correlations = {};
      for (let i = 0; i < symbols.length; i++) {
        correlations[symbols[i]] = {};
        for (let j = 0; j < symbols.length; j++) {
          if (i === j) {
            correlations[symbols[i]][symbols[j]] = 1.0;
          } else {
            correlations[symbols[i]][symbols[j]] = this.calculateCorrelation(
              pcrData[symbols[i]],
              pcrData[symbols[j]]
            );
          }
        }
      }

      return {
        symbols,
        days,
        correlations,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error calculating correlation matrix:', error);
      throw error;
    }
  }

  /**
   * Detect trend strength (0-100 score)
   */
  async getTrendStrength(symbol, days = 20) {
    try {
      const pcr = await historicalDataService.getPCRHistory(symbol, days);

      if (pcr.length < 5) {
        return { strength: 0, trend: 'insufficient_data' };
      }

      const prices = pcr.map(p => p.pcr_ratio);
      const ma5 = this.calculateSMA(prices, 5);
      const ma20 = this.calculateSMA(prices, Math.min(20, prices.length));

      const current = prices[prices.length - 1];
      const currentMA20 = ma20[ma20.length - 1] || prices[prices.length - 1];

      let strength = 50;
      const distance = Math.abs(current - currentMA20) / currentMA20 * 100;
      strength += Math.min(distance, 30);

      const rsi = this.calculateRSI(prices, 14);
      if (rsi.trend === 'overbought' || rsi.trend === 'oversold') {
        strength = Math.max(strength - 10, 0);
      }

      const trend = current > currentMA20 ? 'uptrend' : 'downtrend';

      return {
        strength: Math.min(strength, 100),
        trend,
        distance: distance.toFixed(2),
        rsiTrend: rsi.trend
      };
    } catch (error) {
      console.error(`Error calculating trend strength for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get volatility analysis
   */
  async getVolatilityAnalysis(symbol, days = 30) {
    try {
      const iv = await historicalDataService.getIVHistory(symbol, days);

      if (iv.length === 0) {
        return { success: false, message: 'No IV data available' };
      }

      const ivValues = iv.map(i => i.atm_iv || 0).filter(v => v > 0);
      const vol = this.calculateVolatility(ivValues, Math.min(20, ivValues.length));

      const sorted = [...ivValues].sort((a, b) => a - b);
      const current = ivValues[ivValues.length - 1];
      const percentile = (sorted.indexOf(current) / sorted.length * 100).toFixed(2);

      return {
        symbol,
        current: current.toFixed(2),
        min: Math.min(...ivValues).toFixed(2),
        max: Math.max(...ivValues).toFixed(2),
        avg: (ivValues.reduce((a, b) => a + b) / ivValues.length).toFixed(2),
        volatility: vol.toFixed(4),
        percentile: percentile,
        volatilityLevel: vol > 2 ? 'high' : vol > 1 ? 'moderate' : 'low'
      };
    } catch (error) {
      console.error(`Error calculating volatility analysis for ${symbol}:`, error);
      throw error;
    }
  }
}

export default new AnalyticsService();
