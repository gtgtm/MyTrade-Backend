// src/strategy/confluenceScorer.ts
// 7-Vector Confluence Scoring System

import { ConfluenceVector, Indicators, Direction } from '../types/signal'

export interface VectorResult {
  name: string
  aligned: boolean
  score: number
  weight: number
  evidence: string
}

export class ConfluenceScorer {
  /**
   * 7 orthogonal vectors (not correlated indicators)
   * Weight allocation: TREND 25% + MOMENTUM 15% + VOLUME 20% + VOLATILITY 10% + SENTIMENT 15% + STRUCTURE 10% + BREADTH 5%
   */
  private readonly vectorWeights = {
    TREND: 0.25,
    MOMENTUM: 0.15,
    VOLUME: 0.20,
    VOLATILITY: 0.10,
    SENTIMENT: 0.15,
    STRUCTURE: 0.10,
    BREADTH: 0.05
  }

  /**
   * Score all 7 vectors based on indicators
   */
  scoreVectors(indicators: Indicators, direction: Direction): VectorResult[] {
    return [
      this.scoreTrendVector(indicators, direction),
      this.scoreMomentumVector(indicators, direction),
      this.scoreVolumeVector(indicators, direction),
      this.scoreVolatilityVector(indicators, direction),
      this.scoreSentimentVector(indicators, direction),
      this.scoreStructureVector(indicators, direction),
      this.scoreBreadthVector(indicators, direction)
    ]
  }

  /**
   * TREND Vector (25%): EMA alignment with ADX confirmation
   */
  private scoreTrendVector(indicators: Indicators, direction: Direction): VectorResult {
    const emaStack = [indicators.ema21, indicators.ema55, indicators.ema200]
    let aligned = false
    let score = 0
    let evidence = ''

    if (direction === Direction.LONG) {
      const bullishEMA = emaStack[0] > emaStack[1] && emaStack[1] > emaStack[2]
      if (bullishEMA && indicators.adx > 25) {
        aligned = true
        score = Math.min(100, 60 + indicators.adx)
        evidence = `Bullish EMA stack (${emaStack[0].toFixed(2)} > ${emaStack[1].toFixed(2)} > ${emaStack[2].toFixed(2)}) + ADX ${indicators.adx.toFixed(1)}`
      } else if (bullishEMA) {
        score = 50
        evidence = `Bullish EMA stack but weak ADX (${indicators.adx.toFixed(1)})`
      } else {
        score = 20
        evidence = `Bearish EMA stack for LONG direction`
      }
    } else {
      const bearishEMA = emaStack[0] < emaStack[1] && emaStack[1] < emaStack[2]
      if (bearishEMA && indicators.adx > 25) {
        aligned = true
        score = Math.min(100, 60 + indicators.adx)
        evidence = `Bearish EMA stack (${emaStack[0].toFixed(2)} < ${emaStack[1].toFixed(2)} < ${emaStack[2].toFixed(2)}) + ADX ${indicators.adx.toFixed(1)}`
      } else if (bearishEMA) {
        score = 50
        evidence = `Bearish EMA stack but weak ADX (${indicators.adx.toFixed(1)})`
      } else {
        score = 20
        evidence = `Bullish EMA stack for SHORT direction`
      }
    }

    return {
      name: 'TREND',
      aligned,
      score,
      weight: this.vectorWeights.TREND,
      evidence
    }
  }

  /**
   * MOMENTUM Vector (15%): MACD + RSI alignment
   */
  private scoreMomentumVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    const macdPositive = indicators.macdHistogram > 0
    const macdAccelerating = indicators.macdHistogramAccel > 0
    const rsiOverbought = indicators.rsi > 70
    const rsiOversold = indicators.rsi < 30
    const rsiNeutral = indicators.rsi >= 40 && indicators.rsi <= 60

    if (direction === Direction.LONG) {
      if (macdPositive && macdAccelerating && !rsiOverbought) {
        aligned = true
        score = Math.min(100, 70 + (indicators.rsi * 0.3))
        evidence = `MACD positive + accelerating, RSI ${indicators.rsi.toFixed(1)} (not overbought)`
      } else if (macdPositive && !rsiOverbought) {
        score = 55
        evidence = `MACD positive but not accelerating, RSI ${indicators.rsi.toFixed(1)}`
      } else if (rsiOverbought) {
        score = 30
        evidence = `RSI overbought (${indicators.rsi.toFixed(1)}) - momentum weakening`
      } else {
        score = 40
        evidence = `Mixed momentum signals`
      }
    } else {
      if (!macdPositive && macdAccelerating === false && !rsiOversold) {
        aligned = true
        score = Math.min(100, 70 + ((100 - indicators.rsi) * 0.3))
        evidence = `MACD negative + decelerating, RSI ${indicators.rsi.toFixed(1)} (not oversold)`
      } else if (!macdPositive && !rsiOversold) {
        score = 55
        evidence = `MACD negative but momentum weak, RSI ${indicators.rsi.toFixed(1)}`
      } else if (rsiOversold) {
        score = 30
        evidence = `RSI oversold (${indicators.rsi.toFixed(1)}) - bounce risk`
      } else {
        score = 40
        evidence = `Mixed momentum signals`
      }
    }

    return {
      name: 'MOMENTUM',
      aligned,
      score,
      weight: this.vectorWeights.MOMENTUM,
      evidence
    }
  }

  /**
   * VOLUME Vector (20%): OBV + CVD alignment
   */
  private scoreVolumeVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    const obvHealthy = indicators.obvAboveMA
    const cvdHealthy = indicators.cvdPositive

    if (direction === Direction.LONG) {
      if (obvHealthy && cvdHealthy) {
        aligned = true
        score = 90
        evidence = `OBV above MA + CVD positive (strong volume follow-through)`
      } else if (obvHealthy || cvdHealthy) {
        score = 60
        evidence = `${obvHealthy ? 'OBV above MA' : 'CVD positive'} - partial volume support`
      } else {
        score = 25
        evidence = `OBV below MA + CVD negative (no volume confirmation)`
      }
    } else {
      if (!obvHealthy && !cvdHealthy) {
        aligned = true
        score = 90
        evidence = `OBV below MA + CVD negative (strong selling volume)`
      } else if (!obvHealthy || !cvdHealthy) {
        score = 60
        evidence = `${!obvHealthy ? 'OBV below MA' : 'CVD negative'} - partial volume support`
      } else {
        score = 25
        evidence = `OBV above MA + CVD positive (buying volume active)`
      }
    }

    return {
      name: 'VOLUME',
      aligned,
      score,
      weight: this.vectorWeights.VOLUME,
      evidence
    }
  }

  /**
   * VOLATILITY Vector (10%): ATR percentile + BB/Keltner relationship
   */
  private scoreVolatilityVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    const bbWidth = indicators.bbHigh - indicators.bbLow
    const kelWidth = indicators.kelHigh - indicators.kelLow
    const bbRelativeWidth = bbWidth / (kelWidth || 1)
    const isNormalVolatility = indicators.atrPercentile >= 25 && indicators.atrPercentile <= 75

    if (isNormalVolatility) {
      aligned = true
      score = 85
      evidence = `ATR percentile ${indicators.atrPercentile} (normal), BB/Keltner ratio ${bbRelativeWidth.toFixed(2)}`
    } else if (indicators.atrPercentile < 25) {
      score = 40
      evidence = `Low volatility (ATR ${indicators.atrPercentile}th percentile) - squeeze risk`
    } else if (indicators.atrPercentile > 80) {
      score = 35
      evidence = `Extreme volatility (ATR ${indicators.atrPercentile}th percentile) - chaos risk`
    } else {
      score = 65
      evidence = `Elevated volatility (ATR ${indicators.atrPercentile}th percentile) - acceptable`
    }

    return {
      name: 'VOLATILITY',
      aligned,
      score,
      weight: this.vectorWeights.VOLATILITY,
      evidence
    }
  }

  /**
   * SENTIMENT Vector (15%): PCR (crypto) / Put/Call (stocks) + Funding rate (crypto)
   */
  private scoreSentimentVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    // PCR = Put/Call Ratio (0.8-1.2 = balanced, <0.8 = bullish, >1.2 = bearish)
    const pcr = indicators.pcr ?? 1.0
    const fundingRate = indicators.fundingRate ?? 0

    if (direction === Direction.LONG) {
      const bullishPCR = pcr < 1.0
      const bullishFunding = fundingRate < 0.0001
      if (bullishPCR && bullishFunding) {
        aligned = true
        score = 85
        evidence = `PCR ${pcr.toFixed(3)} (bullish) + Funding ${(fundingRate * 100).toFixed(3)}% (stable)`
      } else if (bullishPCR || bullishFunding) {
        score = 65
        evidence = `Neutral sentiment (PCR ${pcr.toFixed(3)}, Funding ${(fundingRate * 100).toFixed(3)}%)`
      } else {
        score = 30
        evidence = `Bearish sentiment (PCR ${pcr.toFixed(3)}, high funding)`
      }
    } else {
      const bearishPCR = pcr > 1.2
      const bearishFunding = fundingRate > 0.0001
      if (bearishPCR && bearishFunding) {
        aligned = true
        score = 85
        evidence = `PCR ${pcr.toFixed(3)} (bearish) + Funding ${(fundingRate * 100).toFixed(3)}% (high)`
      } else if (bearishPCR || bearishFunding) {
        score = 65
        evidence = `Neutral sentiment (PCR ${pcr.toFixed(3)}, Funding ${(fundingRate * 100).toFixed(3)}%)`
      } else {
        score = 30
        evidence = `Bullish sentiment (PCR ${pcr.toFixed(3)}, low funding)`
      }
    }

    return {
      name: 'SENTIMENT',
      aligned,
      score,
      weight: this.vectorWeights.SENTIMENT,
      evidence
    }
  }

  /**
   * STRUCTURE Vector (10%): Support/Resistance proximity + Price position in BB/Keltner
   */
  private scoreStructureVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    const closePrice = indicators.close
    const bbRange = indicators.bbHigh - indicators.bbLow
    const priceInBB = (closePrice - indicators.bbLow) / (bbRange || 1)

    if (direction === Direction.LONG) {
      const nearBBLow = priceInBB < 0.3
      const aboveKelLow = closePrice > indicators.kelLow
      if (nearBBLow && aboveKelLow) {
        aligned = true
        score = 80
        evidence = `Price near BB low (${(priceInBB * 100).toFixed(0)}%) above Keltner - good entry zone`
      } else if (aboveKelLow) {
        score = 60
        evidence = `Price above Keltner support - acceptable structure`
      } else {
        score = 25
        evidence = `Price below Keltner - weak structure`
      }
    } else {
      const nearBBHigh = priceInBB > 0.7
      const belowKelHigh = closePrice < indicators.kelHigh
      if (nearBBHigh && belowKelHigh) {
        aligned = true
        score = 80
        evidence = `Price near BB high (${(priceInBB * 100).toFixed(0)}%) below Keltner - good entry zone`
      } else if (belowKelHigh) {
        score = 60
        evidence = `Price below Keltner resistance - acceptable structure`
      } else {
        score = 25
        evidence = `Price above Keltner - weak structure`
      }
    }

    return {
      name: 'STRUCTURE',
      aligned,
      score,
      weight: this.vectorWeights.STRUCTURE,
      evidence
    }
  }

  /**
   * BREADTH Vector (5%): Open Interest delta (crypto) or Volume profile (general)
   */
  private scoreBreadthVector(indicators: Indicators, direction: Direction): VectorResult {
    let aligned = false
    let score = 0
    let evidence = ''

    const oiDelta = indicators.oiDelta ?? 0

    if (direction === Direction.LONG) {
      const bullishOI = oiDelta > 0
      if (bullishOI) {
        aligned = true
        score = Math.min(100, 70 + Math.abs(oiDelta) * 10)
        evidence = `OI Delta ${(oiDelta * 100).toFixed(2)}% (longs increasing)`
      } else {
        score = 40
        evidence = `OI Delta ${(oiDelta * 100).toFixed(2)}% (shorts increasing)`
      }
    } else {
      const bearishOI = oiDelta < 0
      if (bearishOI) {
        aligned = true
        score = Math.min(100, 70 + Math.abs(oiDelta) * 10)
        evidence = `OI Delta ${(oiDelta * 100).toFixed(2)}% (shorts increasing)`
      } else {
        score = 40
        evidence = `OI Delta ${(oiDelta * 100).toFixed(2)}% (longs increasing)`
      }
    }

    return {
      name: 'BREADTH',
      aligned,
      score,
      weight: this.vectorWeights.BREADTH,
      evidence
    }
  }

  /**
   * Compute composite confluence score from individual vectors
   * Requires ≥5 of 7 vectors aligned for signal generation
   */
  computeConfluenceScore(vectors: VectorResult[]): {
    vectorsAligned: number
    vectorsRequired: number
    compositeScore: number
    confluenceVectors: ConfluenceVector[]
  } {
    const alignedCount = vectors.filter(v => v.aligned).length
    const requiredCount = 5

    const confluenceVectors: ConfluenceVector[] = vectors.map(v => ({
      name: v.name,
      aligned: v.aligned,
      score: v.score,
      evidence: v.evidence,
      weight: v.weight
    }))

    const compositeScore = vectors.reduce((sum, v) => {
      return sum + (v.score * v.weight)
    }, 0)

    return {
      vectorsAligned: alignedCount,
      vectorsRequired: requiredCount,
      compositeScore: Math.round(compositeScore),
      confluenceVectors
    }
  }

  /**
   * Check if confluence requirements are met
   */
  isConfluenceQualified(vectors: VectorResult[]): boolean {
    const alignedCount = vectors.filter(v => v.aligned).length
    return alignedCount >= 5
  }
}
