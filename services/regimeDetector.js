/**
 * Market Regime Detector
 * Identifies current market conditions and adapts strategy accordingly
 *
 * Regimes:
 * - STRONG_UPTREND: High trend, low volatility → Easy to trade long
 * - UPTREND: Moderate trend, normal volatility → Standard long bias
 * - RANGING: No trend, normal volatility → Trade support/resistance
 * - DOWNTREND: Moderate trend down, normal volatility → Standard short bias
 * - STRONG_DOWNTREND: High trend down, low volatility → Easy to trade short
 * - VOLATILE: No trend, high volatility → Avoid or widen stops
 * - CRISIS: High volatility, unclear direction → Extreme caution
 */

class RegimeDetector {
  /**
   * Detect market regime from price data
   * @param {Array} historicalData - Array of OHLCV candles
   * @returns {Object} Regime details with strategy recommendations
   */
  static detectRegime(historicalData) {
    if (!historicalData || historicalData.length < 20) {
      return this.unknownRegime();
    }

    // Extract closes
    const closes = historicalData.map((d) => d.close || d.price).filter(Boolean);

    if (closes.length < 20) {
      return this.unknownRegime();
    }

    // Calculate metrics
    const volatility = this.calculateVolatility(closes);
    const trend = this.calculateTrend(closes);
    const trendStrength = this.calculateTrendStrength(closes);
    const rangePercent = this.calculateRange(closes);
    const emaCrossover = this.detectEMACrossover(closes);

    // Determine regime based on metrics
    return this.classifyRegime({
      volatility,
      trend,
      trendStrength,
      rangePercent,
      emaCrossover,
      closes,
    });
  }

  /**
   * Calculate volatility (standard deviation of returns)
   */
  static calculateVolatility(closes) {
    const returns = [];

    for (let i = 1; i < closes.length; i++) {
      const ret = (closes[i] - closes[i - 1]) / closes[i - 1];
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    return {
      daily: stdDev,
      annualized: stdDev * Math.sqrt(252),
      percentDaily: (stdDev * 100).toFixed(2),
      percentAnnualized: (stdDev * Math.sqrt(252) * 100).toFixed(2),
      classification:
        stdDev < 0.005
          ? "VERY_LOW"
          : stdDev < 0.01
            ? "LOW"
            : stdDev < 0.02
              ? "NORMAL"
              : stdDev < 0.035
                ? "HIGH"
                : "EXTREME",
    };
  }

  /**
   * Calculate trend direction: positive = up, negative = down
   */
  static calculateTrend(closes) {
    const recentClose = closes[closes.length - 1];
    const oldClose = closes[0];

    const trendPercent = ((recentClose - oldClose) / oldClose) * 100;
    const direction = trendPercent > 0 ? "UP" : trendPercent < 0 ? "DOWN" : "FLAT";

    return {
      percentChange: trendPercent.toFixed(2),
      direction,
      priceChange: (recentClose - oldClose).toFixed(2),
    };
  }

  /**
   * Calculate trend strength using linear regression
   * 0-1 scale: 0 = no trend, 1 = perfect trend
   */
  static calculateTrendStrength(closes) {
    const n = closes.length;

    // Linear regression
    const xMean = (n - 1) / 2;
    const yMean = closes.reduce((a, b) => a + b) / n;

    let numerator = 0,
      denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (closes[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = numerator / denominator;

    // Calculate R-squared
    const predictions = closes.map((_, i) => yMean + slope * (i - xMean));
    const ssRes = closes.reduce(
      (sum, val, i) => sum + Math.pow(val - predictions[i], 2),
      0
    );
    const ssTot = closes.reduce(
      (sum, val) => sum + Math.pow(val - yMean, 2),
      0
    );
    const rSquared = 1 - ssRes / ssTot;

    return {
      slope,
      strength: Math.max(0, rSquared), // R-squared as trend strength
      classification:
        rSquared > 0.7
          ? "VERY_STRONG"
          : rSquared > 0.5
            ? "STRONG"
            : rSquared > 0.3
              ? "MODERATE"
              : rSquared > 0.1
                ? "WEAK"
                : "NO_TREND",
    };
  }

  /**
   * Calculate price range as percentage
   */
  static calculateRange(closes) {
    const max = Math.max(...closes);
    const min = Math.min(...closes);
    const rangePercent = ((max - min) / min) * 100;

    return {
      high: max.toFixed(2),
      low: min.toFixed(2),
      rangePercent: rangePercent.toFixed(2),
      classification:
        rangePercent < 1
          ? "TIGHT"
          : rangePercent < 3
            ? "NORMAL"
            : rangePercent < 5
              ? "WIDE"
              : "VERY_WIDE",
    };
  }

  /**
   * Detect EMA 9/21 crossover
   */
  static detectEMACrossover(closes) {
    const ema9 = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);

    const currentCross = ema9 > ema21;
    const previousEma9 = this.calculateEMA(closes.slice(0, -1), 9);
    const previousEma21 = this.calculateEMA(closes.slice(0, -1), 21);
    const previousCross = previousEma9 > previousEma21;

    const justCrossed = currentCross !== previousCross;

    return {
      ema9: ema9.toFixed(2),
      ema21: ema21.toFixed(2),
      fastAboveSlow: currentCross,
      justCrossed,
      crossDirection: currentCross
        ? "BULLISH_CROSS"
        : "BEARISH_CROSS",
    };
  }

  /**
   * Calculate EMA
   */
  static calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
    }

    return ema;
  }

  /**
   * Classify regime based on all metrics
   */
  static classifyRegime(metrics) {
    const {
      volatility,
      trend,
      trendStrength,
      rangePercent,
      emaCrossover,
      closes,
    } = metrics;

    const volClass = volatility.classification;
    const trendClass = trendStrength.classification;
    const trendDir = trend.direction;
    const trendPct = parseFloat(trend.percentChange);

    // Classification logic
    if (volClass === "EXTREME") {
      return {
        regime: "CRISIS",
        level: 5,
        characteristics: "Crisis mode - extreme volatility, direction unclear",
        strategy: {
          action: "AVOID_TRADING",
          stopLoss: "VERY_WIDE",
          positionSize: "10-20%",
          takeProfit: "VERY_TIGHT",
        },
        dayTradeMode: false,
        recommendation: "Wait for stabilization",
        supportResistance: this.calculateSupportResistance(closes),
      };
    }

    if (trendClass === "VERY_STRONG") {
      if (trendDir === "UP") {
        return {
          regime: "STRONG_UPTREND",
          level: 4,
          characteristics: "Strong uptrend, low volatility - easy to trade long",
          strategy: {
            action: "BUY_DIPS",
            stopLoss: "NORMAL",
            positionSize: "80-100%",
            takeProfit: "MODERATE",
          },
          dayTradeMode: true,
          recommendation: "Bias towards BUY CALL, trade oversold bounces",
          supportResistance: this.calculateSupportResistance(closes),
        };
      } else {
        return {
          regime: "STRONG_DOWNTREND",
          level: 1,
          characteristics: "Strong downtrend, low volatility - easy to trade short",
          strategy: {
            action: "SELL_RALLIES",
            stopLoss: "NORMAL",
            positionSize: "80-100%",
            takeProfit: "MODERATE",
          },
          dayTradeMode: true,
          recommendation: "Bias towards BUY PUT, trade overbought pullbacks",
          supportResistance: this.calculateSupportResistance(closes),
        };
      }
    }

    if (trendClass === "STRONG") {
      if (trendDir === "UP") {
        return {
          regime: "UPTREND",
          level: 3,
          characteristics: "Moderate uptrend - normal conditions",
          strategy: {
            action: "FAVOR_LONG",
            stopLoss: "NORMAL",
            positionSize: "60-80%",
            takeProfit: "NORMAL",
          },
          dayTradeMode: true,
          recommendation: "Moderate bullish bias",
          supportResistance: this.calculateSupportResistance(closes),
        };
      } else {
        return {
          regime: "DOWNTREND",
          level: 2,
          characteristics: "Moderate downtrend - normal conditions",
          strategy: {
            action: "FAVOR_SHORT",
            stopLoss: "NORMAL",
            positionSize: "60-80%",
            takeProfit: "NORMAL",
          },
          dayTradeMode: true,
          recommendation: "Moderate bearish bias",
          supportResistance: this.calculateSupportResistance(closes),
        };
      }
    }

    if (volClass === "HIGH" && trendClass !== "STRONG" && trendClass !== "VERY_STRONG") {
      return {
        regime: "VOLATILE",
        level: 3,
        characteristics: "High volatility without clear trend",
        strategy: {
          action: "TRADE_BREAKOUTS",
          stopLoss: "WIDE",
          positionSize: "40-60%",
          takeProfit: "WIDE",
        },
        dayTradeMode: false,
        recommendation: "Wait for breakout above/below range, avoid the chop",
        supportResistance: this.calculateSupportResistance(closes),
      };
    }

    if (trendClass === "NO_TREND" || trendClass === "WEAK") {
      const high = Math.max(...closes);
      const low = Math.min(...closes);
      const mid = (high + low) / 2;
      const currentPrice = closes[closes.length - 1];

      const position =
        currentPrice > mid
          ? "UPPER_RANGE"
          : currentPrice < mid
            ? "LOWER_RANGE"
            : "MID_RANGE";

      return {
        regime: "RANGING",
        level: 2,
        characteristics: `Ranging market - no clear trend`,
        strategy: {
          action:
            position === "UPPER_RANGE"
              ? "SHORT_AT_RESISTANCE"
              : "LONG_AT_SUPPORT",
          stopLoss: "TIGHT",
          positionSize: "60-80%",
          takeProfit: "TIGHT",
        },
        dayTradeMode: true,
        recommendation: "Buy support, sell resistance",
        position,
        support: low.toFixed(2),
        resistance: high.toFixed(2),
        supportResistance: this.calculateSupportResistance(closes),
      };
    }

    // Default: NORMAL
    return {
      regime: "NORMAL",
      level: 2,
      characteristics: "Normal market conditions",
      strategy: {
        action: "STANDARD_RULES",
        stopLoss: "NORMAL",
        positionSize: "70%",
        takeProfit: "NORMAL",
      },
      dayTradeMode: true,
      recommendation: "Apply standard trading rules",
      supportResistance: this.calculateSupportResistance(closes),
    };
  }

  /**
   * Calculate support and resistance levels
   */
  static calculateSupportResistance(closes) {
    const recent = closes.slice(-20); // Last 20 candles
    const max = Math.max(...recent);
    const min = Math.min(...recent);
    const mid = (max + min) / 2;

    return {
      resistance: max.toFixed(2),
      support: min.toFixed(2),
      midline: mid.toFixed(2),
      range: (max - min).toFixed(2),
    };
  }

  /**
   * Unknown regime when data is insufficient
   */
  static unknownRegime() {
    return {
      regime: "UNKNOWN",
      level: 0,
      characteristics: "Insufficient data to determine regime",
      strategy: {
        action: "WAIT_FOR_DATA",
        stopLoss: "NORMAL",
        positionSize: "30%",
        takeProfit: "NORMAL",
      },
      dayTradeMode: false,
      recommendation: "Collect more price data before trading",
    };
  }

  /**
   * Get regime-specific recommendations
   */
  static getRegimeRecommendations(regime) {
    const recommendations = {
      STRONG_UPTREND: {
        tradeBias: "LONG_BIAS",
        rsiThreshold: 40, // Buy on RSI > 40
        avoidShorts: true,
        takeProfitsQuicker: false,
        avgHoldTime: "2-4 hours",
      },
      STRONG_DOWNTREND: {
        tradeBias: "SHORT_BIAS",
        rsiThreshold: 60, // Sell on RSI < 60
        avoidLongs: true,
        takeProfitsQuicker: false,
        avgHoldTime: "2-4 hours",
      },
      UPTREND: {
        tradeBias: "LONG_BIAS",
        rsiThreshold: 45,
        avoidShorts: false,
        takeProfitsQuicker: false,
        avgHoldTime: "1-2 hours",
      },
      DOWNTREND: {
        tradeBias: "SHORT_BIAS",
        rsiThreshold: 55,
        avoidLongs: false,
        takeProfitsQuicker: false,
        avgHoldTime: "1-2 hours",
      },
      RANGING: {
        tradeBias: "NEUTRAL",
        rsiThreshold: 50,
        buySupport: true,
        sellResistance: true,
        takeProfitsQuicker: true,
        avgHoldTime: "30 mins - 1 hour",
      },
      VOLATILE: {
        tradeBias: "NEUTRAL",
        rsiThreshold: 50,
        preferBreakouts: true,
        avoidMiddleOfRange: true,
        takeProfitsQuicker: true,
        avgHoldTime: "1-2 hours",
      },
    };

    return recommendations[regime] || {};
  }
}

export default RegimeDetector;
