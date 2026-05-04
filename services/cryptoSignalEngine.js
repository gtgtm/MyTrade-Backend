class CryptoSignalEngine {
  // Empirically derived weights (tuned for crypto volatility)
  static INDICATOR_WEIGHTS = {
    macd: 0.24,              // strong on momentum + trend changes
    macdHistogram: 0.18,     // leading indicator, faster signal
    volume: 0.20,            // confirms conviction
    emaCrossover: 0.18,      // structural trend marker
    rsi: 0.12,               // demoted from 25% (overweighted historically)
    bollingerBand: 0.05,     // volatile regime marker
    volumeTrend: 0.03        // minor additive value
  };

  static generate(symbol, klines, ticker) {
    if (!klines || klines.length < 50 || !ticker) {
      return this.emptySignal(symbol, ticker?.price || 0);
    }

    const closes = klines.map(k => k.close);
    const prices = klines.map(k => k.close);
    const volumes = klines.map(k => k.volume);

    // Technical indicators
    const rsi14 = this.rsi(closes, 14);
    const ema9 = this.ema(prices, 9);
    const ema21 = this.ema(prices, 21);
    const macd = this.macd(closes);
    const bb = this.bollingerBands(closes, 20, 2);

    // Market data
    const currentPrice = ticker.price;
    const priceChange = ticker.priceChangePercent;

    // Volume analysis
    const totalVolume = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0);
    const takerBuyVolume = klines.slice(-20).reduce((sum, k) => sum + k.takerBuyBaseVolume, 0);
    const volumeRatio = totalVolume > 0 ? takerBuyVolume / totalVolume : 0.5;
    const volumeTrend = this.analyzeVolumeTrend(volumes);

    // Determine trend direction (for symmetric RSI evaluation)
    const trendDirection = currentPrice > ema21 ? 'up' : currentPrice < ema21 ? 'down' : 'neutral';

    // Weighted voting system
    const votes = [];
    votes.push(...this.evaluateRSI(rsi14, trendDirection));
    votes.push(...this.evaluateMACD(macd));
    votes.push(...this.evaluateVolume(volumeRatio, volumeTrend));
    votes.push(...this.evaluateEMA(currentPrice, ema9, ema21));
    votes.push(...this.evaluateBollingerBands(currentPrice, bb));

    // Aggregate votes into signal direction and confidence
    const aggregated = this.aggregateVotes(votes);

    // Breakdown scoring
    const breakdown = this.calculateBreakdown(
      rsi14, ema9, ema21, currentPrice, priceChange,
      volumeRatio, macd, bb, volumeTrend
    );

    const score = aggregated.score;
    const confidence = aggregated.confidence;

    // Determine signal type with weighted voting (fixed asymmetry)
    let signalType = 'NO TRADE';
    const netScore = aggregated.netScore;

    if (netScore > 0.35 && score >= 60) {
      signalType = 'BUY CALL'; // Bullish conviction + score confirmation
    } else if (netScore < -0.35 && score <= 40) {
      signalType = 'BUY PUT'; // Bearish conviction + score confirmation
    } else if (netScore > 0.25 && score >= 55) {
      signalType = 'BUY CALL'; // Moderate bullish
    } else if (netScore < -0.25 && score <= 45) {
      signalType = 'BUY PUT'; // Moderate bearish
    }

    // Entry, stop loss, target
    let entryPrice, stopLoss, target;
    if (signalType === 'BUY CALL') {
      entryPrice = currentPrice;
      stopLoss = entryPrice * 0.97; // 3% below
      target = entryPrice * 1.07; // 7% above
    } else if (signalType === 'BUY PUT') {
      entryPrice = currentPrice;
      stopLoss = entryPrice * 1.03; // 3% above (for short)
      target = entryPrice * 0.93; // 7% below
    } else {
      entryPrice = currentPrice;
      stopLoss = currentPrice * 0.97;
      target = currentPrice * 1.07;
    }

    // Signal validity (how long this signal is valid for)
    const now = new Date();
    const validForHours = 4; // 4-hour validity window
    const validUntil = new Date(now.getTime() + validForHours * 60 * 60 * 1000);

    return {
      symbol,
      price: currentPrice,
      signalType,
      score,
      confidence: Math.round(confidence),
      entryPrice: Number(entryPrice.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      target: Number(target.toFixed(4)),
      generatedAt: now.toISOString(),
      validFor: `${validForHours}hrs`,
      validUntil: validUntil.toISOString(),
      pcr: Number(volumeRatio.toFixed(4)),
      maxPain: Number(priceChange.toFixed(2)),
      daysToExpiry: null,
      generatedAt: new Date().toISOString(),
      isMock: false,
      breakdown,
      indicators: {
        rsi14: Number(rsi14.toFixed(2)),
        ema9: Number(ema9.toFixed(4)),
        ema21: Number(ema21.toFixed(4)),
        macd: Number(macd.macd.toFixed(4)),
        signal: Number(macd.signal.toFixed(4)),
        histogram: Number(macd.histogram.toFixed(4)),
        bbUpper: Number(bb.upper.toFixed(4)),
        bbLower: Number(bb.lower.toFixed(4)),
        priceChange24h: priceChange,
        volumeRatio,
        volumeTrend: volumeTrend.trend
      }
    };
  }

  static calculateBreakdown(rsi14, ema9, ema21, price, priceChange, volumeRatio, macd, bb, volumeTrend) {
    // Trend component (RSI-based)
    let trendComponent;
    if (rsi14 < 30) {
      trendComponent = {
        label: 'RSI (Oversold)',
        score: 15,
        maxScore: 25,
        direction: 'BULLISH',
        reason: `RSI at ${rsi14.toFixed(1)} indicates oversold conditions`
      };
    } else if (rsi14 > 70) {
      trendComponent = {
        label: 'RSI (Overbought)',
        score: 0,
        maxScore: 25,
        direction: 'BEARISH',
        reason: `RSI at ${rsi14.toFixed(1)} indicates overbought conditions`
      };
    } else {
      trendComponent = {
        label: 'RSI (Neutral)',
        score: 5,
        maxScore: 25,
        direction: null,
        reason: `RSI at ${rsi14.toFixed(1)} in neutral zone`
      };
    }

    // Confirmation component (EMA alignment)
    let confirmationComponent;
    if (price > ema9 && ema9 > ema21) {
      confirmationComponent = {
        label: 'EMA Alignment',
        score: 20,
        maxScore: 20,
        direction: 'BULLISH',
        reason: 'Price > EMA9 > EMA21 (uptrend confirmation)'
      };
    } else if (price < ema9 && ema9 < ema21) {
      confirmationComponent = {
        label: 'EMA Alignment',
        score: 20,
        maxScore: 20,
        direction: 'BEARISH',
        reason: 'Price < EMA9 < EMA21 (downtrend confirmation)'
      };
    } else {
      confirmationComponent = {
        label: 'EMA Alignment',
        score: 10,
        maxScore: 20,
        direction: null,
        reason: 'EMA not fully aligned'
      };
    }

    // Entry component (Volume ratio)
    let entryComponent;
    if (volumeRatio > 0.6) {
      entryComponent = {
        label: 'Volume Ratio',
        score: 15,
        maxScore: 15,
        direction: 'BULLISH',
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Strong buy pressure`
      };
    } else if (volumeRatio < 0.4) {
      entryComponent = {
        label: 'Volume Ratio',
        score: 15,
        maxScore: 15,
        direction: 'BEARISH',
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Weak buy pressure`
      };
    } else {
      entryComponent = {
        label: 'Volume Ratio',
        score: 7,
        maxScore: 15,
        direction: null,
        reason: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Balanced`
      };
    }

    // PCR component (MACD)
    let pcrComponent;
    if (macd.histogram > 0 && macd.macd > macd.signal) {
      pcrComponent = {
        label: 'MACD',
        score: 20,
        maxScore: 20,
        direction: 'BULLISH',
        reason: 'MACD above signal line with positive histogram (bullish momentum)'
      };
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      pcrComponent = {
        label: 'MACD',
        score: 20,
        maxScore: 20,
        direction: 'BEARISH',
        reason: 'MACD below signal line with negative histogram (bearish momentum)'
      };
    } else {
      pcrComponent = {
        label: 'MACD',
        score: 10,
        maxScore: 20,
        direction: null,
        reason: 'MACD showing mixed signals'
      };
    }

    // MaxPain component (Bollinger Bands)
    let maxPainComponent;
    if (price < bb.lower) {
      maxPainComponent = {
        label: 'Bollinger Bands',
        score: 10,
        maxScore: 10,
        direction: 'BULLISH',
        reason: 'Price below lower band (potential reversal upward)'
      };
    } else if (price > bb.upper) {
      maxPainComponent = {
        label: 'Bollinger Bands',
        score: 10,
        maxScore: 10,
        direction: 'BEARISH',
        reason: 'Price above upper band (potential reversal downward)'
      };
    } else {
      maxPainComponent = {
        label: 'Bollinger Bands',
        score: 5,
        maxScore: 10,
        direction: null,
        reason: 'Price within normal bands'
      };
    }

    return {
      trend: trendComponent,
      confirmation: confirmationComponent,
      entry: entryComponent,
      pcr: pcrComponent,
      maxPain: maxPainComponent
    };
  }

  static macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = this.ema(closes, fastPeriod);
    const emaSlow = this.ema(closes, slowPeriod);
    const macdLine = emaFast - emaSlow;

    // Signal line is EMA of MACD
    const macdValues = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
      const fast = this.ema(closes.slice(0, i + 1), fastPeriod);
      const slow = this.ema(closes.slice(0, i + 1), slowPeriod);
      macdValues.push(fast - slow);
    }
    const signalLine = this.ema(macdValues, signalPeriod);

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine - signalLine
    };
  }

  static bollingerBands(closes, period = 20, stdDevs = 2) {
    const sma = closes.slice(-period).reduce((a, b) => a + b) / period;
    const variance = closes.slice(-period).reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      middle: sma,
      upper: sma + stdDev * stdDevs,
      lower: sma - stdDev * stdDevs
    };
  }

  static analyzeVolumeTrend(volumes) {
    const recent = volumes.slice(-10);
    const older = volumes.slice(-20, -10);

    const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b) / older.length;

    const trend = recentAvg > olderAvg ? 'increasing' : 'decreasing';
    const strength = Math.abs(recentAvg - olderAvg) / olderAvg;

    return { trend, strength: Math.min(1, strength) };
  }

  static emptySignal(symbol, price) {
    return {
      symbol,
      price: price || 0,
      signalType: 'NO TRADE',
      score: 50,
      confidence: 20,
      entryPrice: price || 0,
      stopLoss: (price || 0) * 0.97,
      target: (price || 0) * 1.07,
      pcr: 0.5,
      maxPain: 0,
      daysToExpiry: null,
      generatedAt: new Date().toISOString(),
      isMock: true,
      breakdown: {
        trend: {
          label: 'No Data',
          score: 0,
          maxScore: 25,
          direction: null,
          reason: 'Insufficient data'
        },
        confirmation: {
          label: 'No Data',
          score: 0,
          maxScore: 20,
          direction: null,
          reason: 'Insufficient data'
        },
        entry: {
          label: 'No Data',
          score: 0,
          maxScore: 15,
          direction: null,
          reason: 'Insufficient data'
        },
        pcr: {
          label: 'No Data',
          score: 0,
          maxScore: 20,
          direction: null,
          reason: 'Insufficient data'
        },
        maxPain: {
          label: 'No Data',
          score: 0,
          maxScore: 10,
          direction: null,
          reason: 'Insufficient data'
        }
      },
      indicators: {}
    };
  }

  // MARK: - Weighted Voting System

  static evaluateRSI(rsi, trendDirection) {
    const votes = [];

    // Symmetric oversold/overbought reversals
    if (rsi <= 30) {
      votes.push({
        indicator: 'rsi',
        direction: 'buy',
        strength: 0.9,
        weight: this.INDICATOR_WEIGHTS.rsi,
        rationale: `RSI ${rsi.toFixed(1)} - Oversold reversal`
      });
    } else if (rsi >= 70) {
      votes.push({
        indicator: 'rsi',
        direction: 'sell',
        strength: 0.9,
        weight: this.INDICATOR_WEIGHTS.rsi,
        rationale: `RSI ${rsi.toFixed(1)} - Overbought reversal`
      });
    }

    // Trend-confirmed momentum (only count if trend agrees)
    if (rsi > 45 && rsi < 55 && trendDirection === 'up') {
      votes.push({
        indicator: 'rsi',
        direction: 'buy',
        strength: 0.4,
        weight: this.INDICATOR_WEIGHTS.rsi,
        rationale: `RSI ${rsi.toFixed(1)} - Trend-confirmed up momentum`
      });
    } else if (rsi > 45 && rsi < 55 && trendDirection === 'down') {
      votes.push({
        indicator: 'rsi',
        direction: 'sell',
        strength: 0.4,
        weight: this.INDICATOR_WEIGHTS.rsi,
        rationale: `RSI ${rsi.toFixed(1)} - Trend-confirmed down momentum`
      });
    }

    return votes;
  }

  static evaluateMACD(macd) {
    const votes = [];

    if (macd.histogram > 0 && macd.macd > macd.signal) {
      votes.push({
        indicator: 'macd',
        direction: 'buy',
        strength: 0.85,
        weight: this.INDICATOR_WEIGHTS.macd,
        rationale: 'MACD histogram positive, above signal line'
      });
    } else if (macd.histogram < 0 && macd.macd < macd.signal) {
      votes.push({
        indicator: 'macd',
        direction: 'sell',
        strength: 0.85,
        weight: this.INDICATOR_WEIGHTS.macd,
        rationale: 'MACD histogram negative, below signal line'
      });
    }

    // Histogram as leading indicator
    if (Math.abs(macd.histogram) > 0.0001) {
      const histStrength = Math.min(1.0, Math.abs(macd.histogram) / 0.001);
      votes.push({
        indicator: 'macdHistogram',
        direction: macd.histogram > 0 ? 'buy' : 'sell',
        strength: histStrength,
        weight: this.INDICATOR_WEIGHTS.macdHistogram,
        rationale: `Histogram momentum ${(macd.histogram * 1000).toFixed(2)} units`
      });
    }

    return votes;
  }

  static evaluateVolume(volumeRatio, volumeTrend) {
    const votes = [];

    // Strong buy/sell pressure
    if (volumeRatio > 0.65) {
      votes.push({
        indicator: 'volume',
        direction: 'buy',
        strength: Math.min(1.0, (volumeRatio - 0.5) / 0.3),
        weight: this.INDICATOR_WEIGHTS.volume,
        rationale: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Strong conviction`
      });
    } else if (volumeRatio < 0.35) {
      votes.push({
        indicator: 'volume',
        direction: 'sell',
        strength: Math.min(1.0, (0.5 - volumeRatio) / 0.3),
        weight: this.INDICATOR_WEIGHTS.volume,
        rationale: `Buy volume ${(volumeRatio * 100).toFixed(1)}% - Weak pressure`
      });
    }

    // Volume trend
    if (volumeTrend.trend === 'increasing') {
      votes.push({
        indicator: 'volumeTrend',
        direction: 'buy',
        strength: volumeTrend.strength,
        weight: this.INDICATOR_WEIGHTS.volumeTrend,
        rationale: `Volume increasing ${(volumeTrend.strength * 100).toFixed(0)}%`
      });
    } else if (volumeTrend.trend === 'decreasing') {
      votes.push({
        indicator: 'volumeTrend',
        direction: 'sell',
        strength: volumeTrend.strength * 0.5,
        weight: this.INDICATOR_WEIGHTS.volumeTrend,
        rationale: `Volume decreasing ${(volumeTrend.strength * 100).toFixed(0)}%`
      });
    }

    return votes;
  }

  static evaluateEMA(price, ema9, ema21) {
    const votes = [];

    if (price > ema9 && ema9 > ema21) {
      votes.push({
        indicator: 'emaCrossover',
        direction: 'buy',
        strength: 0.95,
        weight: this.INDICATOR_WEIGHTS.emaCrossover,
        rationale: 'Price > EMA9 > EMA21 (uptrend)'
      });
    } else if (price < ema9 && ema9 < ema21) {
      votes.push({
        indicator: 'emaCrossover',
        direction: 'sell',
        strength: 0.95,
        weight: this.INDICATOR_WEIGHTS.emaCrossover,
        rationale: 'Price < EMA9 < EMA21 (downtrend)'
      });
    }

    return votes;
  }

  static evaluateBollingerBands(price, bb) {
    const votes = [];

    if (price < bb.lower) {
      votes.push({
        indicator: 'bollingerBand',
        direction: 'buy',
        strength: 0.6,
        weight: this.INDICATOR_WEIGHTS.bollingerBand,
        rationale: 'Price below lower band (reversal candidate)'
      });
    } else if (price > bb.upper) {
      votes.push({
        indicator: 'bollingerBand',
        direction: 'sell',
        strength: 0.6,
        weight: this.INDICATOR_WEIGHTS.bollingerBand,
        rationale: 'Price above upper band (reversal candidate)'
      });
    }

    return votes;
  }

  static aggregateVotes(votes) {
    let buyScore = 0;
    let sellScore = 0;
    let totalWeight = 0;

    for (const vote of votes) {
      const weighted = vote.weight * vote.strength;
      if (vote.direction === 'buy') {
        buyScore += weighted;
      } else if (vote.direction === 'sell') {
        sellScore += weighted;
      }
      totalWeight += vote.weight;
    }

    const normalizedBuy = totalWeight > 0 ? buyScore / totalWeight : 0;
    const normalizedSell = totalWeight > 0 ? sellScore / totalWeight : 0;
    const netScore = normalizedBuy - normalizedSell;

    // Convert net score to 0-100 scale (50 = neutral)
    const finalScore = Math.round(50 + netScore * 50);

    return {
      netScore,
      score: Math.max(0, Math.min(100, finalScore)),
      confidence: Math.round((Math.max(normalizedBuy, normalizedSell) * 100))
    };
  }

  static ema(prices, period) {
    if (!prices || prices.length === 0) return 0;
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
    }
    return Number(ema.toFixed(4));
  }

  static rsi(closes, period = 14) {
    if (!closes || closes.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period + i] - closes[closes.length - period + i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    return Number(rsi.toFixed(2));
  }
}

export default CryptoSignalEngine;
