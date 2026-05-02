// src/strategy/__tests__/signalGenerator.test.ts
// Unit tests for Signal V2 generation pipeline

import { SignalGenerator } from '../signalGenerator'
import {
  Direction,
  Market,
  Regime,
  ConfidenceTier,
  SignalStatus
} from '../../types/signal'
import { Indicators } from '../../types/signal'

describe('SignalGenerator', () => {
  let generator: SignalGenerator

  beforeEach(() => {
    generator = new SignalGenerator()
  })

  describe('Bullish Trend LONG Signal', () => {
    it('should generate Tier A signal in TREND_UP with perfect confluence', () => {
      const indicators: Indicators = {
        // Strong bullish trend
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 35,

        // Strong upward momentum
        macdHistogram: 5,
        macdHistogramAccel: 0.5,
        rsi: 55,

        // Volume confirmation
        atr: 2,
        atrPercentile: 50,
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,

        // Normal volatility
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,

        // Bullish sentiment
        pcr: 0.8,
        fundingRate: -0.0002,

        // Healthy breadth
        oiDelta: 0.1,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.LONG,
        currentHour: 10,
        currentDay: 15
      })

      expect(signal).not.toBeNull()
      if (signal) {
        expect(signal.direction).toBe(Direction.LONG)
        expect(signal.regime).toBe(Regime.TREND_UP)
        expect(signal.confidence.tier).toBe(ConfidenceTier.A)
        expect(signal.status).toBe(SignalStatus.PENDING)
        expect(signal.confluence.vectorsAligned).toBeGreaterThanOrEqual(5)
        expect(signal.targets).toHaveLength(4)
        expect(signal.targets[0].price).toBeGreaterThan(signal.entry.price)
      }
    })
  })

  describe('Bearish Trend SHORT Signal', () => {
    it('should generate Tier A signal in TREND_DOWN with perfect confluence', () => {
      const indicators: Indicators = {
        // Strong bearish trend
        ema21: 85,
        ema55: 95,
        ema200: 105,
        adx: 40,

        // Strong downward momentum
        macdHistogram: -5,
        macdHistogramAccel: -0.5,
        rsi: 35,

        // Volume confirmation
        atr: 2,
        atrPercentile: 55,
        obv: 900000,
        obvAboveMA: false,
        cvdPositive: false,

        // Normal volatility
        bbHigh: 105,
        bbLow: 85,
        kelHigh: 110,
        kelLow: 80,

        // Bearish sentiment
        pcr: 1.3,
        fundingRate: 0.0003,

        // Shorts increasing
        oiDelta: -0.12,
        close: 90
      }

      const signal = generator.generateSignal({
        symbol: 'ETHUSD',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 90,
        direction: Direction.SHORT,
        currentHour: 14,
        currentDay: 10
      })

      expect(signal).not.toBeNull()
      if (signal) {
        expect(signal.direction).toBe(Direction.SHORT)
        expect(signal.regime).toBe(Regime.TREND_DOWN)
        expect(signal.confidence.tier).toBe(ConfidenceTier.A)
        expect(signal.targets[0].price).toBeLessThan(signal.entry.price)
      }
    })
  })

  describe('Regime Filters', () => {
    it('should reject SHORT signals in TREND_UP regime', () => {
      const indicators: Indicators = {
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 30,
        macdHistogram: 3,
        macdHistogramAccel: 0.2,
        rsi: 60,
        atr: 2,
        atrPercentile: 50,
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 0.8,
        fundingRate: -0.0001,
        oiDelta: 0.1,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.SHORT,
        currentHour: 10,
        currentDay: 15
      })

      expect(signal).toBeNull()
    })

    it('should reject LONG signals in TREND_DOWN regime', () => {
      const indicators: Indicators = {
        ema21: 80,
        ema55: 90,
        ema200: 100,
        adx: 35,
        macdHistogram: -3,
        macdHistogramAccel: -0.2,
        rsi: 40,
        atr: 2,
        atrPercentile: 50,
        obv: 900000,
        obvAboveMA: false,
        cvdPositive: false,
        bbHigh: 105,
        bbLow: 85,
        kelHigh: 110,
        kelLow: 80,
        pcr: 1.2,
        fundingRate: 0.0002,
        oiDelta: -0.1,
        close: 90
      }

      const signal = generator.generateSignal({
        symbol: 'ETHUSD',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 90,
        direction: Direction.LONG,
        currentHour: 10,
        currentDay: 15
      })

      expect(signal).toBeNull()
    })
  })

  describe('Veto Checks', () => {
    it('should reject signal during extreme volatility', () => {
      const indicators: Indicators = {
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 30,
        macdHistogram: 3,
        macdHistogramAccel: 0.2,
        rsi: 55,
        atr: 2,
        atrPercentile: 92, // Extreme volatility - veto trigger
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 0.8,
        fundingRate: -0.0001,
        oiDelta: 0.1,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.LONG,
        currentHour: 10,
        currentDay: 15
      })

      expect(signal).toBeNull()
    })

    it('should reject signal during low liquidity hours (crypto)', () => {
      const indicators: Indicators = {
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 30,
        macdHistogram: 3,
        macdHistogramAccel: 0.2,
        rsi: 55,
        atr: 2,
        atrPercentile: 50,
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 0.8,
        fundingRate: -0.0001,
        oiDelta: 0.1,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.LONG,
        currentHour: 3, // Midnight - low liquidity veto
        currentDay: 15
      })

      expect(signal).toBeNull()
    })
  })

  describe('Confidence Tiers', () => {
    it('should hide Tier C signals (do not trade)', () => {
      const indicators: Indicators = {
        // Mixed/weak signals
        ema21: 98,
        ema55: 100,
        ema200: 85,
        adx: 18, // Weak trend
        macdHistogram: 1,
        macdHistogramAccel: -0.1, // Losing momentum
        rsi: 50,
        atr: 2,
        atrPercentile: 50,
        obv: 950000,
        obvAboveMA: true,
        cvdPositive: false, // Conflicting volume
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 1.0,
        fundingRate: 0,
        oiDelta: 0.02,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.LONG,
        currentHour: 10,
        currentDay: 15
      })

      expect(signal).toBeNull()
    })
  })

  describe('Confluence Requirements', () => {
    it('should require 5-of-7 vectors aligned', () => {
      const confluenceScorer = generator.getConfluenceScorer()
      const indicators: Indicators = {
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 35,
        macdHistogram: 5,
        macdHistogramAccel: 0.5,
        rsi: 55,
        atr: 2,
        atrPercentile: 50,
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 0.8,
        fundingRate: -0.0001,
        oiDelta: 0.1,
        close: 100
      }

      const vectors = confluenceScorer.scoreVectors(indicators, Direction.LONG)
      const confluenceResult = confluenceScorer.computeConfluenceScore(vectors)

      expect(confluenceResult.vectorsAligned).toBeGreaterThanOrEqual(5)
      expect(confluenceResult.compositeScore).toBeGreaterThan(70)
    })
  })

  describe('Price Target Calculation', () => {
    it('should generate 4 targets with correct risk multiples', () => {
      const indicators: Indicators = {
        ema21: 100,
        ema55: 95,
        ema200: 85,
        adx: 35,
        macdHistogram: 5,
        macdHistogramAccel: 0.5,
        rsi: 55,
        atr: 10, // Known ATR for calculation
        atrPercentile: 50,
        obv: 1000000,
        obvAboveMA: true,
        cvdPositive: true,
        bbHigh: 105,
        bbLow: 95,
        kelHigh: 107,
        kelLow: 93,
        pcr: 0.8,
        fundingRate: -0.0001,
        oiDelta: 0.1,
        close: 100
      }

      const signal = generator.generateSignal({
        symbol: 'BTCUSDT',
        market: Market.CRYPTO,
        indicators,
        entryPrice: 100,
        direction: Direction.LONG,
        currentHour: 10,
        currentDay: 15
      })

      if (signal) {
        const targets = signal.targets

        expect(targets[0].level).toBe(1)
        expect(targets[0].riskMultiple).toBe(1.0)
        expect(targets[0].probabilityHistorical).toBe(0.8)

        expect(targets[1].level).toBe(2)
        expect(targets[1].riskMultiple).toBe(2.0)
        expect(targets[1].probabilityHistorical).toBe(0.55)

        expect(targets[2].level).toBe(3)
        expect(targets[2].riskMultiple).toBe(3.5)
        expect(targets[2].probabilityHistorical).toBe(0.35)

        expect(targets[3].level).toBe(4)
        expect(targets[3].riskMultiple).toBe(5.5)
        expect(targets[3].probabilityHistorical).toBe(0.2)
      }
    })
  })

  describe('Confidence Calibration', () => {
    it('should calibrate raw scores to actual hit rates', () => {
      const calibrator = generator.getConfidenceCalibrator()

      const result90 = calibrator.calibrateScore(90)
      expect(result90.tier).toBe(ConfidenceTier.A)
      expect(result90.t1HitRateExpected).toBeGreaterThanOrEqual(88)

      const result80 = calibrator.calibrateScore(80)
      expect(result80.tier).toBe(ConfidenceTier.A)

      const result75 = calibrator.calibrateScore(75)
      expect(result75.tier).toBe(ConfidenceTier.B)

      const result65 = calibrator.calibrateScore(65)
      expect(result65.tier).toBe(ConfidenceTier.C)
    })
  })
})
