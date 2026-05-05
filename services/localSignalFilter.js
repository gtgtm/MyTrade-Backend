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
}

export default LocalSignalFilter;
