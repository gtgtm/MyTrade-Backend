// src/strategy/signalGenerator.ts
// Signal V2 Generator - Orchestrator for all services

import { v4 as uuidv4 } from 'uuid'
import {
  SignalV2,
  Indicators,
  Direction,
  Market,
  Regime,
  SignalStatus,
  ConfidenceTier,
  PriceTarget
} from '../types/signal'
import { RegimeDetector } from './regimeDetector'
import { ConfluenceScorer } from './confluenceScorer'
import { VetoChecker, VetoContext } from './vetoChecker'
import { ConfidenceCalibrator } from './confidenceCalibrator'

export interface SignalGenerationContext {
  symbol: string
  market: Market
  indicators: Indicators
  entryPrice: number
  direction: Direction
  currentHour: number
  currentDay: number
}

export class SignalGenerator {
  private regimeDetector: RegimeDetector
  private confluenceScorer: ConfluenceScorer
  private vetoChecker: VetoChecker
  private confidenceCalibrator: ConfidenceCalibrator

  constructor() {
    this.regimeDetector = new RegimeDetector()
    this.confluenceScorer = new ConfluenceScorer()
    this.vetoChecker = new VetoChecker()
    this.confidenceCalibrator = new ConfidenceCalibrator()
  }

  /**
   * Generate Signal V2 - Full pipeline
   * Returns null if any filter blocks signal
   */
  generateSignal(context: SignalGenerationContext): SignalV2 | null {
    // Step 1: Detect market regime
    const regime = this.regimeDetector.detectRegime(context.indicators)

    // Step 2: Check regime compatibility with direction
    if (!this.regimeDetector.shouldTradeRegime(regime, context.direction)) {
      return null
    }

    // Step 3: Check veto conditions
    const vetoContext: VetoContext = {
      symbol: context.symbol,
      market: context.market,
      direction: context.direction,
      entryPrice: context.entryPrice,
      indicators: context.indicators,
      currentHour: context.currentHour,
      currentDay: context.currentDay,
      bbHigh: context.indicators.bbHigh,
      bbLow: context.indicators.bbLow
    }

    const vetoChecks = this.vetoChecker.runAllChecks(vetoContext)
    if (!this.vetoChecker.allChecksPassed(vetoChecks)) {
      return null
    }

    // Step 4: Score confluence vectors
    const vectors = this.confluenceScorer.scoreVectors(context.indicators, context.direction)

    // Step 5: Check confluence qualification (need 5-of-7)
    if (!this.confluenceScorer.isConfluenceQualified(vectors)) {
      return null
    }

    // Step 6: Calculate composite confidence score
    const confluenceResult = this.confluenceScorer.computeConfluenceScore(vectors)
    const confidenceResult = this.confidenceCalibrator.calibrateScore(confluenceResult.compositeScore)

    // Step 7: Only generate Tier A or B signals (hide Tier C)
    if (confidenceResult.tier === ConfidenceTier.C) {
      return null
    }

    // Step 8: Calculate price targets
    const risk = this.calculateRisk(context)
    const targets = this.calculateTargets(context, risk)

    // Step 9: Calculate dynamic stop loss
    const stopLoss = {
      initial: context.entryPrice - (context.direction === Direction.LONG ? risk : -risk),
      current: context.entryPrice - (context.direction === Direction.LONG ? risk : -risk),
      trailType: 'FIXED' as const,
      history: [
        {
          at: new Date(),
          from: 0,
          to: context.entryPrice - (context.direction === Direction.LONG ? risk : -risk),
          reason: 'Initial SL'
        }
      ]
    }

    // Step 10: Calculate position sizing
    const riskPercentOfCapital = 0.5
    const recommendedQty = this.calculateRecommendedQty(
      context,
      risk,
      riskPercentOfCapital,
      confidenceResult.recommendedPositionSize
    )
    const notionalValue = recommendedQty * context.entryPrice

    // Step 11: Build final signal object
    const signal: SignalV2 = {
      id: uuidv4(),
      version: 'v2',
      strategyVersion: '2.0',
      symbol: context.symbol,
      market: context.market,
      direction: context.direction,
      regime,

      entry: {
        price: context.entryPrice,
        zoneLow: context.indicators.bbLow,
        zoneHigh: context.indicators.bbHigh,
        reason: this.getEntryReason(regime, context.direction)
      },

      targets,
      stopLoss,
      riskRewardRatio: this.calculateRiskRewardRatio(context, targets, stopLoss),

      positionSizing: {
        riskPercentOfCapital,
        recommendedQty,
        notionalValue
      },

      confluence: {
        vectorsAligned: confluenceResult.vectorsAligned,
        vectorsRequired: confluenceResult.vectorsRequired,
        vectors: confluenceResult.confluenceVectors,
        compositeScore: confluenceResult.compositeScore
      },

      multiTimeframe: [],

      confidence: {
        rawScore: confidenceResult.rawScore,
        calibratedScore: confidenceResult.calibratedScore,
        tier: confidenceResult.tier,
        t1HitRateExpected: confidenceResult.t1HitRateExpected / 100
      },

      vetoChecks,

      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: SignalStatus.PENDING
    }

    return signal
  }

  /**
   * Calculate risk (distance to stop loss in rupees/dollars)
   */
  private calculateRisk(context: SignalGenerationContext): number {
    const atrValue = context.indicators.atr
    const supportResistanceBuffer = 0.3

    const riskDistance = atrValue * (1 + supportResistanceBuffer)
    return riskDistance
  }

  /**
   * Calculate 4 price targets (T1, T2, T3, T4)
   */
  private calculateTargets(context: SignalGenerationContext, risk: number): [PriceTarget, PriceTarget, PriceTarget, PriceTarget] {
    const direction = context.direction === Direction.LONG ? 1 : -1

    const t1Price = context.entryPrice + direction * risk * 1.0
    const t2Price = context.entryPrice + direction * risk * 2.0
    const t3Price = context.entryPrice + direction * risk * 3.5
    const t4Price = context.entryPrice + direction * risk * 5.5

    return [
      {
        level: 1,
        price: t1Price,
        riskMultiple: 1.0,
        probabilityHistorical: 0.80,
        exitPercentOfPosition: 0.25,
        expectedTimeMinutes: 60,
        maxTimeMinutes: 240
      },
      {
        level: 2,
        price: t2Price,
        riskMultiple: 2.0,
        probabilityHistorical: 0.55,
        exitPercentOfPosition: 0.35,
        expectedTimeMinutes: 240,
        maxTimeMinutes: 960
      },
      {
        level: 3,
        price: t3Price,
        riskMultiple: 3.5,
        probabilityHistorical: 0.35,
        exitPercentOfPosition: 0.25,
        expectedTimeMinutes: 480,
        maxTimeMinutes: 1440
      },
      {
        level: 4,
        price: t4Price,
        riskMultiple: 5.5,
        probabilityHistorical: 0.20,
        exitPercentOfPosition: 0.15,
        expectedTimeMinutes: 1440,
        maxTimeMinutes: 4320
      }
    ]
  }

  /**
   * Calculate recommended quantity based on risk management
   */
  private calculateRecommendedQty(
    context: SignalGenerationContext,
    risk: number,
    riskPercentOfCapital: number,
    positionSizeMultiplier: number
  ): number {
    const capitalPerTrade = 100000
    const riskAmount = (capitalPerTrade * riskPercentOfCapital) / 100

    const adjustedRiskAmount = riskAmount * positionSizeMultiplier

    const recommendedQty = adjustedRiskAmount / risk

    return Math.floor(recommendedQty)
  }

  /**
   * Calculate risk-reward ratio
   */
  private calculateRiskRewardRatio(
    context: SignalGenerationContext,
    targets: [PriceTarget, PriceTarget, PriceTarget, PriceTarget],
    stopLoss: any
  ): number {
    const risk = Math.abs(stopLoss.initial - context.entryPrice)
    const expectedReward = Math.abs(targets[0].price - context.entryPrice)

    return expectedReward / (risk || 1)
  }

  /**
   * Get entry reason description
   */
  private getEntryReason(regime: Regime, direction: Direction): string {
    const regimeNames = {
      [Regime.TREND_UP]: 'Bullish trend detected',
      [Regime.TREND_DOWN]: 'Bearish trend detected',
      [Regime.RANGE]: 'Range-bound market',
      [Regime.SQUEEZE]: 'Pre-breakout squeeze',
      [Regime.VOLATILE]: 'Volatile market'
    }

    const trendNames = {
      [Direction.LONG]: ' - Buy signal',
      [Direction.SHORT]: ' - Sell signal'
    }

    return regimeNames[regime] + trendNames[direction]
  }

  /**
   * Get regime detector (for testing)
   */
  getRegimeDetector(): RegimeDetector {
    return this.regimeDetector
  }

  /**
   * Get confluence scorer (for testing)
   */
  getConfluenceScorer(): ConfluenceScorer {
    return this.confluenceScorer
  }

  /**
   * Get veto checker (for testing)
   */
  getVetoChecker(): VetoChecker {
    return this.vetoChecker
  }

  /**
   * Get confidence calibrator (for testing)
   */
  getConfidenceCalibrator(): ConfidenceCalibrator {
    return this.confidenceCalibrator
  }
}
