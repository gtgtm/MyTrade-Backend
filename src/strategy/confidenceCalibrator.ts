// src/strategy/confidenceCalibrator.ts
// Confidence Calibration - Map Raw Scores to Actual Hit Rates

import { ConfidenceTier } from '../types/signal'

export interface CalibrationPoint {
  rawScore: number
  actualHitRate: number
}

export interface ConfidenceResult {
  rawScore: number
  calibratedScore: number
  tier: ConfidenceTier
  t1HitRateExpected: number
  recommendedPositionSize: number
}

export class ConfidenceCalibrator {
  /**
   * Default calibration map (from walk-forward backtest)
   * Raw score → Actual T1 hit rate from historical data
   * This is populated by backtesting with real signals
   */
  private calibrationMap: Map<number, number> = new Map([
    [50, 0.45],
    [60, 0.58],
    [70, 0.68],
    [75, 0.73],
    [80, 0.79],
    [85, 0.83],
    [90, 0.88],
    [95, 0.92]
  ])

  /**
   * Tier boundaries (calibrated confidence)
   */
  private readonly tierBoundaries = {
    A: { min: 0.88, max: 1.0 },
    B: { min: 0.75, max: 0.87 },
    C: { min: 0.0, max: 0.74 }
  }

  /**
   * Position size multipliers per tier
   */
  private readonly positionSizeByTier = {
    A: 1.0,
    B: 0.5,
    C: 0.0
  }

  /**
   * Calibrate raw score to actual hit rate probability
   */
  calibrateScore(rawScore: number): ConfidenceResult {
    const calibratedScore = this.interpolateHitRate(rawScore)
    const tier = this.assignTier(calibratedScore)
    const positionSize = this.positionSizeByTier[tier]

    return {
      rawScore: Math.round(rawScore),
      calibratedScore: Math.round(calibratedScore * 100),
      tier,
      t1HitRateExpected: Math.round(calibratedScore * 100),
      recommendedPositionSize: positionSize
    }
  }

  /**
   * Interpolate hit rate between calibration points
   * Linear interpolation between known points
   */
  private interpolateHitRate(rawScore: number): number {
    const sortedScores = Array.from(this.calibrationMap.keys()).sort((a, b) => a - b)

    if (rawScore <= sortedScores[0]) {
      return this.calibrationMap.get(sortedScores[0])!
    }

    if (rawScore >= sortedScores[sortedScores.length - 1]) {
      return this.calibrationMap.get(sortedScores[sortedScores.length - 1])!
    }

    for (let i = 0; i < sortedScores.length - 1; i++) {
      const score1 = sortedScores[i]
      const score2 = sortedScores[i + 1]

      if (rawScore >= score1 && rawScore <= score2) {
        const hitRate1 = this.calibrationMap.get(score1)!
        const hitRate2 = this.calibrationMap.get(score2)!

        const t = (rawScore - score1) / (score2 - score1)
        return hitRate1 + t * (hitRate2 - hitRate1)
      }
    }

    return 0.5
  }

  /**
   * Assign tier based on calibrated hit rate
   */
  private assignTier(calibratedScore: number): ConfidenceTier {
    if (calibratedScore >= this.tierBoundaries.A.min) {
      return ConfidenceTier.A
    } else if (calibratedScore >= this.tierBoundaries.B.min) {
      return ConfidenceTier.B
    } else {
      return ConfidenceTier.C
    }
  }

  /**
   * Update calibration map with new backtest data
   * Called after walk-forward validation to refit probabilities
   */
  updateCalibration(calibrationPoints: CalibrationPoint[]): void {
    this.calibrationMap.clear()

    calibrationPoints.forEach(point => {
      this.calibrationMap.set(point.rawScore, point.actualHitRate)
    })
  }

  /**
   * Get current calibration map (for debugging/validation)
   */
  getCalibrationMap(): { rawScore: number; hitRate: number }[] {
    return Array.from(this.calibrationMap.entries()).map(([rawScore, hitRate]) => ({
      rawScore,
      hitRate: Math.round(hitRate * 100)
    }))
  }

  /**
   * Get tier description with expected hit rate
   */
  getTierDescription(tier: ConfidenceTier): string {
    const descriptions = {
      [ConfidenceTier.A]: 'Tier A (High Confidence) - 88%+ expected T1 hit rate',
      [ConfidenceTier.B]: 'Tier B (Medium Confidence) - 75-87% expected T1 hit rate',
      [ConfidenceTier.C]: 'Tier C (Low Confidence) - <75% expected T1 hit rate (do not trade)'
    }

    return descriptions[tier]
  }

  /**
   * Check if signal meets minimum quality threshold for trading
   */
  meetsTradingThreshold(tier: ConfidenceTier): boolean {
    return tier !== ConfidenceTier.C
  }
}
