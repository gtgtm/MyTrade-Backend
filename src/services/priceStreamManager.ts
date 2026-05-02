// src/services/priceStreamManager.ts
// Price Stream Manager - Real-time WebSocket price updates and target/SL hit detection

import { EventEmitter } from 'events'
import { SignalV2 } from '../types/signal'
import { ExitManager, SignalOutcome, PriceTick } from './exitManager'

export interface PriceUpdate {
  symbol: string
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TargetHitEvent {
  signalId: string
  symbol: string
  level: 1 | 2 | 3 | 4
  price: number
  timestamp: Date
}

export interface StopLossHitEvent {
  signalId: string
  symbol: string
  price: number
  timestamp: Date
}

export class PriceStreamManager extends EventEmitter {
  private exitManager: ExitManager
  private signalsMap: Map<string, SignalV2> = new Map()
  private priceBuffer: Map<string, PriceUpdate> = new Map()
  private isConnected: boolean = false

  constructor() {
    super()
    this.exitManager = new ExitManager()
  }

  /**
   * Add signal to tracking
   */
  addSignal(signal: SignalV2): void {
    this.signalsMap.set(signal.id, signal)
    this.exitManager.registerSignal(signal)
    this.emit('signal:registered', { signalId: signal.id, symbol: signal.symbol })
  }

  /**
   * Remove signal from tracking
   */
  removeSignal(signalId: string): void {
    this.signalsMap.delete(signalId)
  }

  /**
   * Get tracked signals
   */
  getTrackedSignals(): SignalV2[] {
    return Array.from(this.signalsMap.values())
  }

  /**
   * Process incoming price update
   */
  processPriceUpdate(priceUpdate: PriceUpdate): void {
    this.priceBuffer.set(priceUpdate.symbol, priceUpdate)

    const tick: PriceTick = {
      timestamp: priceUpdate.timestamp,
      open: priceUpdate.open,
      high: priceUpdate.high,
      low: priceUpdate.low,
      close: priceUpdate.close,
      volume: priceUpdate.volume
    }

    // Check all signals for this symbol
    for (const [signalId, signal] of this.signalsMap) {
      if (signal.symbol === priceUpdate.symbol) {
        const outcome = this.exitManager.processPriceTick(signal, tick)

        if (outcome) {
          // Signal completed
          this.handleSignalCompletion(outcome)
        }
      }
    }
  }

  /**
   * Handle signal completion (emit events, logging)
   */
  private handleSignalCompletion(outcome: SignalOutcome): void {
    if (outcome.targetHits.t1 && !outcome.exitTime) {
      this.emit('target:hit', {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        level: 1,
        price: outcome.t1HitPrice,
        timestamp: outcome.t1HitAt
      } as TargetHitEvent)
    }

    if (outcome.targetHits.t2 && !outcome.exitTime) {
      this.emit('target:hit', {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        level: 2,
        price: outcome.t2HitPrice,
        timestamp: outcome.t2HitAt
      } as TargetHitEvent)
    }

    if (outcome.targetHits.t3 && !outcome.exitTime) {
      this.emit('target:hit', {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        level: 3,
        price: outcome.t3HitPrice,
        timestamp: outcome.t3HitAt
      } as TargetHitEvent)
    }

    if (outcome.targetHits.t4) {
      this.emit('target:hit', {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        level: 4,
        price: outcome.t4HitPrice,
        timestamp: outcome.t4HitAt
      } as TargetHitEvent)

      this.emit('signal:completed', outcome)
    }

    if (outcome.targetHits.sl) {
      this.emit('stopLoss:hit', {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        price: outcome.slHitPrice,
        timestamp: outcome.slHitAt
      } as StopLossHitEvent)

      this.emit('signal:completed', outcome)
    }

    this.removeSignal(outcome.signalId)
  }

  /**
   * Get current price for symbol
   */
  getCurrentPrice(symbol: string): PriceUpdate | null {
    return this.priceBuffer.get(symbol) || null
  }

  /**
   * Get outcome for signal
   */
  getSignalOutcome(signalId: string): SignalOutcome | null {
    return this.exitManager.getSignalOutcome(signalId)
  }

  /**
   * Get all active signal outcomes
   */
  getActiveOutcomes(): SignalOutcome[] {
    return this.exitManager.getActiveSignals()
  }

  /**
   * Get all completed signal outcomes
   */
  getCompletedOutcomes(): SignalOutcome[] {
    return this.exitManager.getCompletedSignals()
  }

  /**
   * Connect to WebSocket price feed (simulated)
   */
  connect(feedUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // In production, connect to actual WebSocket
        // For now, simulate connected state
        this.isConnected = true
        this.emit('connected')
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.isConnected = false
    this.emit('disconnected')
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected
  }

  /**
   * Subscribe to price stream for symbol
   */
  subscribeToSymbol(symbol: string): void {
    this.emit('symbol:subscribed', symbol)
  }

  /**
   * Unsubscribe from price stream for symbol
   */
  unsubscribeFromSymbol(symbol: string): void {
    this.emit('symbol:unsubscribed', symbol)
  }

  /**
   * Get performance metrics from completed signals
   */
  getPerformanceMetrics() {
    return this.exitManager.calculatePerformance(this.exitManager.getCompletedSignals())
  }

  /**
   * Manual price injection (for testing)
   */
  injectPrice(priceUpdate: PriceUpdate): void {
    this.processPriceUpdate(priceUpdate)
  }
}
