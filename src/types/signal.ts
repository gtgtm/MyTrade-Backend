// src/types/signal.ts
// Signal V2 Types & Models

export enum Direction {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum Market {
  CRYPTO = 'CRYPTO',
  FNO = 'FNO'
}

export enum Regime {
  TREND_UP = 'TREND_UP',
  TREND_DOWN = 'TREND_DOWN',
  RANGE = 'RANGE',
  SQUEEZE = 'SQUEEZE',
  VOLATILE = 'VOLATILE'
}

export enum ConfidenceTier {
  A = 'A',
  B = 'B',
  C = 'C'
}

export enum SignalStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  T1_HIT = 'T1_HIT',
  T2_HIT = 'T2_HIT',
  T3_HIT = 'T3_HIT',
  T4_HIT = 'T4_HIT',
  SL_HIT = 'SL_HIT',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED'
}

export interface PriceTarget {
  level: 1 | 2 | 3 | 4
  price: number
  riskMultiple: number
  probabilityHistorical: number
  exitPercentOfPosition: number
  expectedTimeMinutes: number
  maxTimeMinutes: number
  hitAt?: Date
  hitPrice?: number
  actualTimeMinutes?: number
}

export interface StopLossHistory {
  at: Date
  from: number
  to: number
  reason: string
}

export interface DynamicStopLoss {
  initial: number
  current: number
  trailType: 'FIXED' | 'BREAKEVEN' | 'TRAIL_T1' | 'TRAIL_T2' | 'CHANDELIER'
  history: StopLossHistory[]
}

export interface ConfluenceVector {
  name: string
  aligned: boolean
  score: number
  evidence: string
  weight: number
}

export interface VetoCheck {
  name: string
  passed: boolean
  detail?: string
}

export interface TimeframeAnalysis {
  timeframe: '5m' | '15m' | '1h' | '4h' | '1d'
  trend: Direction | 'NEUTRAL'
  strength: number
}

export interface SignalV2 {
  id: string
  version: 'v2'
  strategyVersion: string
  symbol: string
  market: Market
  direction: Direction
  regime: Regime

  entry: {
    price: number
    zoneLow: number
    zoneHigh: number
    reason: string
  }

  targets: [PriceTarget, PriceTarget, PriceTarget, PriceTarget]
  stopLoss: DynamicStopLoss
  riskRewardRatio: number

  positionSizing: {
    riskPercentOfCapital: number
    recommendedQty: number
    notionalValue: number
  }

  confluence: {
    vectorsAligned: number
    vectorsRequired: number
    vectors: ConfluenceVector[]
    compositeScore: number
  }

  multiTimeframe: TimeframeAnalysis[]

  confidence: {
    rawScore: number
    calibratedScore: number
    tier: ConfidenceTier
    t1HitRateExpected: number
  }

  vetoChecks: VetoCheck[]

  createdAt: Date
  expiresAt: Date
  status: SignalStatus
}

export interface Indicators {
  ema21: number
  ema55: number
  ema200: number
  adx: number
  atr: number
  atrPercentile: number
  bbHigh: number
  bbLow: number
  kelHigh: number
  kelLow: number
  macdHistogram: number
  macdHistogramAccel: number
  obv: number
  obvAboveMA: boolean
  cvdPositive: boolean
  rsi: number
  pcr?: number
  fundingRate?: number
  oiDelta?: number
  close: number
}
