/**
 * Local Signal Filter Service
 * Filters signals by confluence WITHOUT any external API calls
 *
 * NO DEPENDENCIES - Pure JavaScript calculations
 * NO COST - Runs locally
 * INSTANT - 1-2ms per signal
 *
 * Features:
 * - Confluence analysis (how many indicators align)
 * - Confidence scoring 0-100%
 * - Quality ratings (HIGH, MEDIUM, LOW)
 * - Theta decay penalties for options near expiry
 * - Recommendation system (TRADE, WAIT, SKIP)
 */

class LocalSignalFilter {
  /**
   * Filter signal by analyzing indicator confluence
   * @param {Object} signal - Signal from signalEngine
   * @returns {Object} Filtered signal with confidence score
   */
  static filterSignal(signal) {
    if (!signal || !signal.indicators) {
      return this.unknownSignal();
    }

    let confidence = 50; // Neutral baseline
    let confirmations = 0;
    const factors = [];

    // ============ RSI Analysis (0-20 points) ============
    const rsi5m = signal.indicators.rsi5m || 50;
    if (rsi5m < 30) {
      confidence += 20;
      confirmations++;
      factors.push({
        indicator: 'RSI5M',
        condition: 'Oversold',
        value: rsi5m.toFixed(1),
        impact: '+20',
        direction: 'BULLISH'
      });
    } else if (rsi5m > 70) {
      confidence -= 20;
      confirmations++;
      factors.push({
        indicator: 'RSI5M',
        condition: 'Overbought',
        value: rsi5m.toFixed(1),
        impact: '-20',
        direction: 'BEARISH'
      });
    } else if (rsi5m < 40) {
      confidence += 8;
      factors.push({
        indicator: 'RSI5M',
        condition: 'Mild oversold',
        value: rsi5m.toFixed(1),
        impact: '+8'
      });
    } else if (rsi5m > 60) {
      confidence -= 8;
      factors.push({
        indicator: 'RSI5M',
        condition: 'Mild overbought',
        value: rsi5m.toFixed(1),
        impact: '-8'
      });
    }

    // ============ EMA Alignment Analysis (0-25 points) ============
    const price = signal.price || 0;
    const ema5m = signal.indicators.ema5m || price;
    const ema15m = signal.indicators.ema15m || price;
    const ema1h = signal.indicators.ema1h || price;

    // Perfect bullish alignment: Price > EMA5M > EMA15M > EMA1H
    if (
      price > ema5m &&
      ema5m > ema15m &&
      ema15m > ema1h
    ) {
      confidence += 25;
      confirmations += 3;
      factors.push({
        indicator: 'EMA Alignment',
        condition: 'Perfect Uptrend',
        alignment: 'Price > EMA5M > EMA15M > EMA1H',
        impact: '+25',
        direction: 'BULLISH',
        strength: 'STRONG'
      });
    }
    // Perfect bearish alignment: Price < EMA5M < EMA15M < EMA1H
    else if (
      price < ema5m &&
      ema5m < ema15m &&
      ema15m < ema1h
    ) {
      confidence += 25;
      confirmations += 3;
      factors.push({
        indicator: 'EMA Alignment',
        condition: 'Perfect Downtrend',
        alignment: 'Price < EMA5M < EMA15M < EMA1H',
        impact: '+25',
        direction: 'BEARISH',
        strength: 'STRONG'
      });
    }
    // Partial bullish alignment
    else if (price > ema5m && ema5m > ema15m) {
      confidence += 12;
      confirmations++;
      factors.push({
        indicator: 'EMA Alignment',
        condition: 'Partial Uptrend',
        impact: '+12'
      });
    }
    // Partial bearish alignment
    else if (price < ema5m && ema5m < ema15m) {
      confidence += 12;
      confirmations++;
      factors.push({
        indicator: 'EMA Alignment',
        condition: 'Partial Downtrend',
        impact: '+12'
      });
    } else {
      factors.push({
        indicator: 'EMA Alignment',
        condition: 'Misaligned/Neutral',
        impact: '0'
      });
    }

    // ============ PCR (Put-Call Ratio) Analysis (0-15 points) ============
    const pcr = signal.pcr || 1.0;
    if (pcr > 1.20) {
      confidence += 15;
      confirmations++;
      factors.push({
        indicator: 'PCR Ratio',
        condition: 'Extreme Puts',
        value: pcr.toFixed(2),
        impact: '+15',
        meaning: 'Puts overcommitted (Bullish)',
        direction: 'BULLISH'
      });
    } else if (pcr < 0.80) {
      confidence += 15;
      confirmations++;
      factors.push({
        indicator: 'PCR Ratio',
        condition: 'Extreme Calls',
        value: pcr.toFixed(2),
        impact: '+15',
        meaning: 'Calls overcommitted (Bearish)',
        direction: 'BEARISH'
      });
    } else if (pcr > 1.0 && pcr <= 1.20) {
      confidence += 5;
      factors.push({
        indicator: 'PCR Ratio',
        condition: 'Elevated Puts',
        value: pcr.toFixed(2),
        impact: '+5'
      });
    } else if (pcr >= 0.80 && pcr < 1.0) {
      confidence += 5;
      factors.push({
        indicator: 'PCR Ratio',
        condition: 'Elevated Calls',
        value: pcr.toFixed(2),
        impact: '+5'
      });
    } else {
      factors.push({
        indicator: 'PCR Ratio',
        condition: 'Neutral',
        value: pcr.toFixed(2),
        impact: '0'
      });
    }

    // ============ Max Pain Proximity Analysis (0-10 points) ============
    const maxPain = signal.maxPain || price;
    const distancePoints = Math.abs(price - maxPain);
    const distancePercent = (distancePoints / price) * 100;

    if (distancePercent < 0.5) {
      confidence += 10;
      confirmations++;
      factors.push({
        indicator: 'Max Pain',
        condition: 'Very Close',
        distance: distancePercent.toFixed(2) + '%',
        impact: '+10',
        meaning: 'Price converging to max pain'
      });
    } else if (distancePercent < 2) {
      confidence += 5;
      factors.push({
        indicator: 'Max Pain',
        condition: 'Nearby',
        distance: distancePercent.toFixed(2) + '%',
        impact: '+5'
      });
    } else {
      factors.push({
        indicator: 'Max Pain',
        condition: 'Distant',
        distance: distancePercent.toFixed(2) + '%',
        impact: '0'
      });
    }

    // ============ Days to Expiry Penalty (0 to -20) ============
    const daysToExpiry = signal.daysToExpiry || 7;
    if (daysToExpiry <= 1) {
      confidence -= 20;
      factors.push({
        indicator: 'Days to Expiry',
        condition: 'Extreme Theta',
        value: daysToExpiry,
        impact: '-20',
        warning: 'Avoid - extreme gamma/theta risk'
      });
    } else if (daysToExpiry <= 2) {
      confidence -= 15;
      factors.push({
        indicator: 'Days to Expiry',
        condition: 'High Theta',
        value: daysToExpiry,
        impact: '-15',
        warning: 'High theta decay'
      });
    } else if (daysToExpiry <= 3) {
      confidence -= 8;
      factors.push({
        indicator: 'Days to Expiry',
        condition: 'Moderate Theta',
        value: daysToExpiry,
        impact: '-8'
      });
    } else {
      factors.push({
        indicator: 'Days to Expiry',
        condition: 'Normal',
        value: daysToExpiry,
        impact: '0'
      });
    }

    // ============ Finalize Confidence Score ============
    // Cap at 0-100 range
    confidence = Math.max(0, Math.min(100, confidence));

    // Determine quality rating
    let quality = 'LOW';
    if (confirmations >= 5) {
      quality = 'EXCELLENT';
    } else if (confirmations >= 4) {
      quality = 'HIGH';
    } else if (confirmations >= 2) {
      quality = 'MEDIUM';
    }

    // Determine recommendation
    let recommendation = 'SKIP';
    let rationale = '';

    if (confidence >= 75) {
      recommendation = 'TRADE';
      rationale = 'High confluence with strong indicators';
    } else if (confidence >= 65) {
      recommendation = 'TRADE';
      rationale = 'Good confluence, reasonable setup';
    } else if (confidence >= 50) {
      recommendation = 'WAIT';
      rationale = 'Weak confluence, wait for clearer setup';
    } else {
      recommendation = 'SKIP';
      rationale = 'Poor confluence, multiple conflicting signals';
    }

    return {
      // Original signal data
      symbol: signal.symbol,
      signalType: signal.signalType,
      originalScore: signal.score || 0,

      // Filtered results
      filteredConfidence: Math.round(confidence),
      confirmations,
      quality,
      recommendation,
      rationale,

      // Detailed analysis
      factors,

      // Action guidance
      actionGuidance:
        confidence >= 75
          ? 'Full Position Size (85-100%)'
          : confidence >= 65
            ? 'Medium Position Size (60-75%)'
            : confidence >= 50
              ? 'Reduce Size (30-50%) or Wait'
              : 'Skip This Trade',

      // Breakdown
      breakdown: {
        rsiAnalysis: factors.find(f => f.indicator === 'RSI5M'),
        emaAnalysis: factors.find(f => f.indicator === 'EMA Alignment'),
        pcrAnalysis: factors.find(f => f.indicator === 'PCR Ratio'),
        maxPainAnalysis: factors.find(f => f.indicator === 'Max Pain'),
        thetaAnalysis: factors.find(f => f.indicator === 'Days to Expiry')
      },

      // Timestamp
      analyzedAt: new Date().toISOString()
    };
  }

  /**
   * Unknown signal handler
   */
  static unknownSignal() {
    return {
      filteredConfidence: 0,
      confirmations: 0,
      quality: 'UNKNOWN',
      recommendation: 'SKIP',
      rationale: 'Insufficient data to analyze',
      factors: []
    };
  }

  /**
   * Batch filter multiple signals
   */
  static filterMultiple(signals) {
    return signals.map(signal => this.filterSignal(signal));
  }

  /**
   * Get signal statistics for trading day
   */
  static getStatistics(filteredSignals) {
    const excellent = filteredSignals.filter(
      s => s.quality === 'EXCELLENT'
    ).length;
    const high = filteredSignals.filter(s => s.quality === 'HIGH').length;
    const medium = filteredSignals.filter(
      s => s.quality === 'MEDIUM'
    ).length;
    const low = filteredSignals.filter(s => s.quality === 'LOW').length;

    const trades = filteredSignals.filter(
      s => s.recommendation === 'TRADE'
    ).length;
    const waits = filteredSignals.filter(
      s => s.recommendation === 'WAIT'
    ).length;
    const skips = filteredSignals.filter(
      s => s.recommendation === 'SKIP'
    ).length;

    const avgConfidence =
      filteredSignals.reduce((sum, s) => sum + s.filteredConfidence, 0) /
      (filteredSignals.length || 1);

    return {
      totalSignals: filteredSignals.length,
      qualityDistribution: {
        excellent,
        high,
        medium,
        low
      },
      recommendationDistribution: {
        trades,
        waits,
        skips
      },
      averageConfidence: Math.round(avgConfidence),
      percentTradeable: Math.round((trades / filteredSignals.length) * 100)
    };
  }

  // ============ ADVANCED VALIDATORS ============

  /**
   * Volatility Validator - Is volatility optimal for trading?
   */
  static validateVolatility(signal, historicalData) {
    if (!historicalData || historicalData.length < 20) {
      return { score: 0, reason: 'Insufficient data' };
    }

    const closes = historicalData.slice(-20).map(d => d.close || d.price);
    const returns = [];

    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    const volatility = Math.sqrt(
      returns.reduce((sum, r) => sum + r * r, 0) / returns.length
    );

    const volatilityPercent = volatility * 100;

    if (volatilityPercent < 0.5) {
      return { score: 5, level: 'TOO_CALM', reason: 'Low volatility = low conviction' };
    }

    if (volatilityPercent > 3) {
      return { score: 5, level: 'EXTREME', reason: 'High volatility = risk' };
    }

    if (volatilityPercent >= 0.5 && volatilityPercent <= 1) {
      return { score: 15, level: 'OPTIMAL', reason: 'Volatility in sweet spot' };
    }

    if (volatilityPercent > 1 && volatilityPercent <= 2) {
      return { score: 10, level: 'ELEVATED', reason: 'Higher volatility, ok' };
    }

    return { score: 0, level: 'UNKNOWN', reason: 'Volatility unclear' };
  }

  /**
   * Trend Strength Validator - How strong is the trend?
   */
  static validateTrendStrength(signal, historicalData) {
    if (!historicalData || historicalData.length < 30) {
      return { score: 0, reason: 'Insufficient data' };
    }

    const closes = historicalData.map(d => d.close || d.price);
    const n = closes.length;

    const xMean = (n - 1) / 2;
    const yMean = closes.reduce((a, b) => a + b) / n;

    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (closes[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = numerator / denominator;

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

    if (rSquared > 0.7) {
      return {
        score: 20,
        strength: 'VERY_STRONG',
        rSquared: rSquared.toFixed(2),
        reason: 'Excellent trend definition'
      };
    }

    if (rSquared > 0.5) {
      return {
        score: 15,
        strength: 'STRONG',
        rSquared: rSquared.toFixed(2),
        reason: 'Clear trend direction'
      };
    }

    if (rSquared > 0.3) {
      return {
        score: 8,
        strength: 'MODERATE',
        rSquared: rSquared.toFixed(2),
        reason: 'Some trend definition'
      };
    }

    if (rSquared > 0.1) {
      return {
        score: 3,
        strength: 'WEAK',
        rSquared: rSquared.toFixed(2),
        reason: 'Minimal trend'
      };
    }

    return {
      score: 0,
      strength: 'NO_TREND',
      rSquared: rSquared.toFixed(2),
      reason: 'Ranging market'
    };
  }

  /**
   * Momentum Divergence Validator - Is momentum aligned with price?
   */
  static validateMomentumDivergence(signal, historicalData) {
    if (!historicalData || historicalData.length < 14) {
      return { score: 0, reason: 'Insufficient data' };
    }

    const closes = historicalData.map(d => d.close || d.price);
    const rsi = this.calculateRSI(closes, 14);

    const recentClose = closes[closes.length - 1];
    const oldClose = closes[Math.max(0, closes.length - 10)];
    const priceDirection = recentClose >= oldClose ? 'UP' : 'DOWN';

    if (priceDirection === 'UP' && rsi < 30) {
      return {
        score: 12,
        divergence: 'BULLISH',
        rsi: rsi.toFixed(1),
        reason: 'Price rising but oversold = strong reversal signal'
      };
    }

    if (priceDirection === 'DOWN' && rsi > 70) {
      return {
        score: 12,
        divergence: 'BEARISH',
        rsi: rsi.toFixed(1),
        reason: 'Price falling but overbought = strong reversal signal'
      };
    }

    if (priceDirection === 'UP' && rsi > 50) {
      return {
        score: 5,
        divergence: 'NONE',
        alignment: 'CONFIRMED',
        rsi: rsi.toFixed(1),
        reason: 'Price and momentum aligned'
      };
    }

    if (priceDirection === 'DOWN' && rsi < 50) {
      return {
        score: 5,
        divergence: 'NONE',
        alignment: 'CONFIRMED',
        rsi: rsi.toFixed(1),
        reason: 'Price and momentum aligned'
      };
    }

    return {
      score: 0,
      divergence: 'NEUTRAL',
      rsi: rsi.toFixed(1),
      reason: 'No clear divergence or confirmation'
    };
  }

  /**
   * Support/Resistance Validator - Is price near key levels?
   */
  static validateSupportResistance(signal, historicalData) {
    if (!historicalData || historicalData.length < 20) {
      return { score: 0, reason: 'Insufficient data' };
    }

    const prices = historicalData.map(d => d.close || d.price);
    const currentPrice = signal.price;

    const recent20 = prices.slice(-20);
    const support = Math.min(...recent20);
    const resistance = Math.max(...recent20);

    const distToSupport = ((currentPrice - support) / currentPrice) * 100;
    const distToResistance = ((resistance - currentPrice) / currentPrice) * 100;

    if (distToSupport < 0.5) {
      return {
        score: 12,
        level: 'SUPPORT',
        distance: distToSupport.toFixed(2) + '%',
        reason: 'Price at support level - high reversal probability'
      };
    }

    if (distToResistance < 0.5) {
      return {
        score: 12,
        level: 'RESISTANCE',
        distance: distToResistance.toFixed(2) + '%',
        reason: 'Price at resistance level - high rejection probability'
      };
    }

    if (distToSupport < 2) {
      return {
        score: 6,
        level: 'NEAR_SUPPORT',
        distance: distToSupport.toFixed(2) + '%',
        reason: 'Approaching support'
      };
    }

    if (distToResistance < 2) {
      return {
        score: 6,
        level: 'NEAR_RESISTANCE',
        distance: distToResistance.toFixed(2) + '%',
        reason: 'Approaching resistance'
      };
    }

    return {
      score: 0,
      level: 'MID_RANGE',
      distance: 'N/A',
      reason: 'Not near key levels'
    };
  }

  /**
   * Volume Confirmation Validator - Is volume backing the move?
   */
  static validateVolumeConfirmation(signal, historicalData) {
    if (!historicalData || historicalData.length < 10) {
      return { score: 0, reason: 'Insufficient volume data' };
    }

    const recentData = historicalData.slice(-10);
    const volumes = recentData.map(d => d.volume || 0);

    if (volumes.every(v => v === 0)) {
      return { score: 0, reason: 'No volume data available' };
    }

    const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];

    const closes = recentData.map(d => d.close || d.price);
    const currentPrice = closes[closes.length - 1];
    const prevPrice = closes[Math.max(0, closes.length - 2)];
    const priceMovedUp = currentPrice > prevPrice;

    const volumeRatio = currentVolume / avgVolume;

    if (volumeRatio > 1.3 && priceMovedUp) {
      return {
        score: 15,
        confirmation: 'STRONG_BULLISH',
        volumeRatio: volumeRatio.toFixed(2),
        reason: 'High volume on up move - strong conviction'
      };
    }

    if (volumeRatio > 1.3 && !priceMovedUp) {
      return {
        score: 15,
        confirmation: 'STRONG_BEARISH',
        volumeRatio: volumeRatio.toFixed(2),
        reason: 'High volume on down move - strong conviction'
      };
    }

    if (volumeRatio > 1.0 && volumeRatio <= 1.3) {
      return {
        score: 8,
        confirmation: 'MODERATE',
        volumeRatio: volumeRatio.toFixed(2),
        reason: 'Moderate volume increase'
      };
    }

    if (volumeRatio < 0.7) {
      return {
        score: -5,
        confirmation: 'WEAK',
        volumeRatio: volumeRatio.toFixed(2),
        reason: 'Low volume - weak signal'
      };
    }

    return {
      score: 0,
      confirmation: 'NEUTRAL',
      volumeRatio: volumeRatio.toFixed(2),
      reason: 'Normal volume'
    };
  }

  /**
   * Calculate RSI for momentum analysis
   */
  static calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period + i] - closes[closes.length - period + i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * Filter signal with all advanced validators
   */
  static filterSignalWithValidators(signal, historicalData = []) {
    const baseResult = this.filterSignal(signal);

    let validatorScore = 0;
    const validators = {};

    validators.volatility = this.validateVolatility(signal, historicalData);
    validatorScore += validators.volatility.score;

    validators.trend = this.validateTrendStrength(signal, historicalData);
    validatorScore += validators.trend.score;

    validators.momentum = this.validateMomentumDivergence(signal, historicalData);
    validatorScore += validators.momentum.score;

    validators.levels = this.validateSupportResistance(signal, historicalData);
    validatorScore += validators.levels.score;

    validators.volume = this.validateVolumeConfirmation(signal, historicalData);
    validatorScore += validators.volume.score;

    const finalConfidence = Math.min(100, baseResult.filteredConfidence + validatorScore);

    return {
      ...baseResult,
      validatorScore,
      validators,
      enhancedConfidence: Math.round(finalConfidence),
      enhancedRecommendation:
        finalConfidence >= 80 ? 'STRONG_BUY' :
        finalConfidence >= 70 ? 'BUY' :
        finalConfidence >= 60 ? 'WAIT' :
        finalConfidence >= 50 ? 'CAUTION' :
        'SKIP',
      breakdownByValidator: {
        baseFilter: baseResult.filteredConfidence,
        volatilityBoost: validators.volatility.score,
        trendBoost: validators.trend.score,
        momentumBoost: validators.momentum.score,
        levelBoost: validators.levels.score,
        volumeBoost: validators.volume.score,
        totalBoost: validatorScore
      }
    };
  }
}

export default LocalSignalFilter;
