// Multi-timeframe confluence scoring: require >=2 timeframes agreeing on direction
class ConfluenceScorer {
  // Lower thresholds per-timeframe since we're being selective with multi-timeframe agreement
  static THRESHOLDS = {
    netScore: 0.20,  // Just slight directional bias needed
    score: 52        // Medium confidence (vs 60 normally)
  };

  static SIGNAL_TYPE_TO_DIRECTION = {
    'BUY CALL': 'bullish',
    'BUY PUT': 'bearish',
    'NO TRADE': null
  };

  static DIRECTION_TO_SIGNAL_TYPE = {
    'bullish': 'BUY CALL',
    'bearish': 'BUY PUT',
    'neutral': 'NO TRADE'
  };

  // Aggregate signals from multiple timeframes for a single symbol
  static scoreConfluence(symbolSignals) {
    // symbolSignals: { '5m': signal, '15m': signal, '1h': signal, '4h': signal }
    const timeframes = Object.keys(symbolSignals);
    const validSignals = timeframes
      .map(tf => ({
        timeframe: tf,
        signal: symbolSignals[tf],
        direction: this.getDirection(symbolSignals[tf]),
        strength: this.getSignalStrength(symbolSignals[tf])
      }))
      .filter(s => s.signal && s.direction); // Exclude NO TRADE

    if (validSignals.length === 0) {
      return {
        hasConfluence: false,
        direction: null,
        agreementCount: 0,
        totalTimeframes: timeframes.length,
        signals: validSignals
      };
    }

    // Count directional agreement
    const bullishCount = validSignals.filter(s => s.direction === 'bullish').length;
    const bearishCount = validSignals.filter(s => s.direction === 'bearish').length;
    const maxAgreement = Math.max(bullishCount, bearishCount);

    // Need >= 2 timeframes agreeing
    const hasConfluence = maxAgreement >= 2;
    const direction = bullishCount > bearishCount ? 'bullish' : 'bearish';

    // Calculate confluenceScore: how strong is the agreement?
    const confluenceScore = maxAgreement / validSignals.length;

    // Weight signals by strength and recency (higher timeframes matter less for speed)
    const weightedScore = this.calculateWeightedScore(validSignals);

    return {
      hasConfluence,
      direction,
      agreementCount: maxAgreement,
      totalTimeframes: validSignals.length,
      confluenceScore,
      weightedScore,
      signals: validSignals,
      breakdown: {
        bullish: bullishCount,
        bearish: bearishCount,
        noTrade: timeframes.length - validSignals.length
      }
    };
  }

  static getDirection(signal) {
    if (!signal || !signal.signalType) return null;
    return this.SIGNAL_TYPE_TO_DIRECTION[signal.signalType] || null;
  }

  static getSignalStrength(signal) {
    if (!signal) return 0;
    // Strength based on score (0-100 range, normalized to 0-1)
    return (signal.score || 0) / 100;
  }

  // Calculate weighted score: shorter timeframes have higher weight (5m > 15m > 1h > 4h)
  static calculateWeightedScore(validSignals) {
    const weights = {
      '5m': 0.40,
      '15m': 0.30,
      '1h': 0.20,
      '4h': 0.10
    };

    let weightedSum = 0;
    let weightSum = 0;

    validSignals.forEach(({ timeframe, strength }) => {
      const weight = weights[timeframe] || 0.1;
      weightedSum += strength * weight;
      weightSum += weight;
    });

    return weightSum > 0 ? weightedSum / weightSum : 0;
  }

  // Merge signals across timeframes into a consolidated high-confidence signal
  static mergeSignals(symbol, confluence) {
    if (!confluence.hasConfluence) {
      return null;
    }

    // Use the 5m signal as base (fastest & most responsive)
    const baseSignal = confluence.signals.find(s => s.timeframe === '5m')?.signal;
    const bestSignal = baseSignal || confluence.signals[0]?.signal;

    if (!bestSignal) {
      return null;
    }

    // Adjust thresholds based on confluence strength
    const confidenceBoost = confluence.confluenceScore;

    return {
      symbol,
      signalType: this.DIRECTION_TO_SIGNAL_TYPE[confluence.direction],
      price: bestSignal.price,
      score: Math.min(100, Math.round(bestSignal.score + confidenceBoost * 10)),
      confidence: confluence.confluenceScore,
      netScore: bestSignal.netScore,
      entryPrice: bestSignal.entryPrice,
      stopLoss: bestSignal.stopLoss,
      target: bestSignal.target,
      timeframe: 'MTF', // Multi-TimeFrame
      confluenceBreakdown: {
        agreementCount: confluence.agreementCount,
        totalTimeframes: confluence.totalTimeframes,
        direction: confluence.direction,
        weightedScore: confluence.weightedScore
      },
      parentSignals: confluence.signals.map(s => ({
        timeframe: s.timeframe,
        signalType: s.signal.signalType,
        score: s.signal.score,
        direction: s.direction
      })),
      generatedAt: bestSignal.generatedAt,
      validUntil: bestSignal.validUntil,
      breakdown: bestSignal.breakdown,
      indicators: bestSignal.indicators,
      isMock: bestSignal.isMock
    };
  }
}

export default ConfluenceScorer;
