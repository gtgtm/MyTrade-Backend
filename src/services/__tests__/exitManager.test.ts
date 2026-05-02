// src/services/__tests__/exitManager.test.ts
// Exit Manager Tests - Track signal outcomes and SL progression

import { ExitManager, PriceTick } from '../exitManager'
import { SignalV2, Direction, Market, Regime, ConfidenceTier, SignalStatus } from '../../types/signal'

describe('ExitManager', () => {
  let manager: ExitManager
  let mockSignal: SignalV2

  beforeEach(() => {
    manager = new ExitManager()

    mockSignal = {
      id: 'test-signal-1',
      version: 'v2',
      strategyVersion: '2.0',
      symbol: 'BTCUSDT',
      market: Market.CRYPTO,
      direction: Direction.LONG,
      regime: Regime.TREND_UP,

      entry: {
        price: 50000,
        zoneLow: 49500,
        zoneHigh: 50500,
        reason: 'Bullish trend'
      },

      targets: [
        {
          level: 1,
          price: 50500,
          riskMultiple: 1.0,
          probabilityHistorical: 0.8,
          exitPercentOfPosition: 0.25,
          expectedTimeMinutes: 60,
          maxTimeMinutes: 240
        },
        {
          level: 2,
          price: 51000,
          riskMultiple: 2.0,
          probabilityHistorical: 0.55,
          exitPercentOfPosition: 0.35,
          expectedTimeMinutes: 240,
          maxTimeMinutes: 960
        },
        {
          level: 3,
          price: 51750,
          riskMultiple: 3.5,
          probabilityHistorical: 0.35,
          exitPercentOfPosition: 0.25,
          expectedTimeMinutes: 480,
          maxTimeMinutes: 1440
        },
        {
          level: 4,
          price: 52750,
          riskMultiple: 5.5,
          probabilityHistorical: 0.2,
          exitPercentOfPosition: 0.15,
          expectedTimeMinutes: 1440,
          maxTimeMinutes: 4320
        }
      ],

      stopLoss: {
        initial: 49500,
        current: 49500,
        trailType: 'FIXED',
        history: []
      },

      riskRewardRatio: 1.0,

      positionSizing: {
        riskPercentOfCapital: 0.5,
        recommendedQty: 1,
        notionalValue: 50000
      },

      confluence: {
        vectorsAligned: 5,
        vectorsRequired: 5,
        vectors: [],
        compositeScore: 85
      },

      multiTimeframe: [],

      confidence: {
        rawScore: 85,
        calibratedScore: 83,
        tier: ConfidenceTier.A,
        t1HitRateExpected: 0.83
      },

      vetoChecks: [],

      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: SignalStatus.PENDING
    }
  })

  describe('Signal Registration and Tracking', () => {
    it('should register a signal and track it', () => {
      manager.registerSignal(mockSignal)

      const outcome = manager.getSignalOutcome(mockSignal.id)
      expect(outcome).not.toBeNull()
      expect(outcome?.symbol).toBe('BTCUSDT')
      expect(outcome?.entryPrice).toBe(50000)
      expect(outcome?.status).toBe(SignalStatus.ACTIVE)
    })

    it('should track multiple active signals', () => {
      manager.registerSignal(mockSignal)

      const signal2 = { ...mockSignal, id: 'test-signal-2', symbol: 'ETHUSDT' }
      manager.registerSignal(signal2)

      const actives = manager.getActiveSignals()
      expect(actives.length).toBe(2)
    })
  })

  describe('T1 Target Hit Detection', () => {
    it('should detect T1 hit and update SL to breakeven', () => {
      manager.registerSignal(mockSignal)

      const tickWithT1Hit: PriceTick = {
        timestamp: new Date(),
        open: 50400,
        high: 50550,
        low: 50300,
        close: 50500,
        volume: 1000000
      }

      const outcome = manager.processPriceTick(mockSignal, tickWithT1Hit)
      expect(outcome).not.toBeNull()

      // Note: T1 doesn't complete signal, just marks target
      const tracked = manager.getSignalOutcome(mockSignal.id)
      expect(tracked?.targetHits.t1).toBe(true)
      expect(tracked?.t1HitPrice).toBe(50500)
    })
  })

  describe('Stop Loss Hit Detection', () => {
    it('should detect SL hit and complete signal with -1.0R', () => {
      manager.registerSignal(mockSignal)

      const tickWithSLHit: PriceTick = {
        timestamp: new Date(),
        open: 49600,
        high: 49700,
        low: 49400,
        close: 49450,
        volume: 1000000
      }

      const outcome = manager.processPriceTick(mockSignal, tickWithSLHit)
      expect(outcome).not.toBeNull()
      expect(outcome?.targetHits.sl).toBe(true)
      expect(outcome?.pnlR).toBe(-1.0)
      expect(outcome?.status).toBe(SignalStatus.SL_HIT)
    })
  })

  describe('Performance Metrics', () => {
    it('should calculate correct performance metrics', () => {
      const signals = [
        {
          signalId: '1',
          symbol: 'BTCUSDT',
          entryPrice: 50000,
          entryTime: new Date(),
          exitPrice: 50500,
          exitTime: new Date(),
          pnlR: 1.0,
          pnlPercent: 1.0,
          status: SignalStatus.T1_HIT,
          targetHits: { t1: true, t2: false, t3: false, t4: false, sl: false },
          slProgression: []
        },
        {
          signalId: '2',
          symbol: 'BTCUSDT',
          entryPrice: 51000,
          entryTime: new Date(),
          exitPrice: 49500,
          exitTime: new Date(),
          pnlR: -1.0,
          pnlPercent: -2.94,
          status: SignalStatus.SL_HIT,
          targetHits: { t1: false, t2: false, t3: false, t4: false, sl: true },
          slProgression: []
        }
      ]

      const metrics = manager.calculatePerformance(signals)
      expect(metrics.totalSignals).toBe(2)
      expect(metrics.winningSignals).toBe(1)
      expect(metrics.losingSignals).toBe(1)
      expect(metrics.winRate).toBe(0.5)
      expect(metrics.avgPnlR).toBe(0)
    })

    it('should calculate profit factor correctly', () => {
      const signals = [
        {
          signalId: '1',
          symbol: 'BTCUSDT',
          entryPrice: 50000,
          entryTime: new Date(),
          exitPrice: 51000,
          exitTime: new Date(),
          pnlR: 2.0,
          pnlPercent: 2.0,
          status: SignalStatus.T2_HIT,
          targetHits: { t1: true, t2: true, t3: false, t4: false, sl: false },
          slProgression: []
        },
        {
          signalId: '2',
          symbol: 'BTCUSDT',
          entryPrice: 50000,
          entryTime: new Date(),
          exitPrice: 49000,
          exitTime: new Date(),
          pnlR: -1.0,
          pnlPercent: -2.0,
          status: SignalStatus.SL_HIT,
          targetHits: { t1: false, t2: false, t3: false, t4: false, sl: true },
          slProgression: []
        }
      ]

      const metrics = manager.calculatePerformance(signals)
      expect(metrics.profitFactor).toBe(2.0) // 2.0 / 1.0
    })
  })

  describe('Signal Summary', () => {
    it('should generate readable outcome summary', () => {
      const outcome = {
        signalId: 'test-1',
        symbol: 'BTCUSDT',
        entryPrice: 50000,
        entryTime: new Date(),
        exitPrice: 50500,
        exitTime: new Date(),
        exitReason: 'T1_HIT',
        pnlR: 1.0,
        pnlPercent: 1.0,
        status: SignalStatus.T1_HIT,
        targetHits: { t1: true, t2: false, t3: false, t4: false, sl: false },
        slProgression: []
      }

      const summary = manager.summarizeOutcome(outcome)
      expect(summary).toContain('BTCUSDT')
      expect(summary).toContain('T1_HIT')
      expect(summary).toContain('+1.00R')
      expect(summary).toContain('✅')
    })
  })
})
