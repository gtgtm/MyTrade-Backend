// src/services/notificationService.ts
// Notification Service - Push notifications for signal events

import { SignalV2, ConfidenceTier, Direction } from '../types/signal'
import { SignalOutcome, TargetHitEvent, StopLossHitEvent } from './priceStreamManager'

export interface PushNotification {
  title: string
  body: string
  data: {
    signalId: string
    symbol: string
    type: 'signal_generated' | 'target_hit' | 'sl_hit' | 'signal_completed'
    tier?: ConfidenceTier
    level?: 1 | 2 | 3 | 4
    pnlR?: number
    pnlPercent?: number
  }
  timestamp: Date
  priority: 'high' | 'normal' | 'low'
}

export class NotificationService {
  private notificationQueue: PushNotification[] = []
  private sentNotifications: Set<string> = new Set()
  private dedupeWindow: number = 60000 // 60 seconds

  /**
   * Generate signal generated notification
   */
  notifySignalGenerated(signal: SignalV2): PushNotification {
    const tierLabel = {
      [ConfidenceTier.A]: 'High Confidence',
      [ConfidenceTier.B]: 'Medium Confidence',
      [ConfidenceTier.C]: 'Low Confidence'
    }

    const directionLabel = signal.direction === Direction.LONG ? 'BUY' : 'SELL'

    const notification: PushNotification = {
      title: `${signal.symbol} ${directionLabel} Signal (${tierLabel[signal.confidence.tier]})`,
      body: `Entry: ${signal.entry.price.toFixed(2)} | T1: ${signal.targets[0].price.toFixed(2)} (${(signal.targets[0].probabilityHistorical * 100).toFixed(0)}%) | SL: ${signal.stopLoss.initial.toFixed(2)}`,
      data: {
        signalId: signal.id,
        symbol: signal.symbol,
        type: 'signal_generated',
        tier: signal.confidence.tier,
        pnlR: signal.targets[0].riskMultiple
      },
      timestamp: new Date(),
      priority: this.getPriorityForTier(signal.confidence.tier)
    }

    return this.queueNotification(notification)
  }

  /**
   * Generate target hit notification
   */
  notifyTargetHit(event: TargetHitEvent, signal: SignalV2): PushNotification {
    const targetLabel = {
      1: 'T1',
      2: 'T2',
      3: 'T3',
      4: 'T4'
    }

    const notification: PushNotification = {
      title: `🎯 ${signal.symbol} ${targetLabel[event.level]} HIT!`,
      body: `${signal.symbol} hit target ${event.level} at ${event.price.toFixed(2)} | P&L: +${signal.targets[event.level - 1].riskMultiple.toFixed(2)}R`,
      data: {
        signalId: event.signalId,
        symbol: event.symbol,
        type: 'target_hit',
        level: event.level,
        pnlR: signal.targets[event.level - 1].riskMultiple
      },
      timestamp: new Date(),
      priority: 'high'
    }

    return this.queueNotification(notification)
  }

  /**
   * Generate stop loss hit notification
   */
  notifyStopLossHit(event: StopLossHitEvent): PushNotification {
    const notification: PushNotification = {
      title: `⛔ ${event.symbol} STOP LOSS HIT`,
      body: `${event.symbol} stop loss triggered at ${event.price.toFixed(2)} | P&L: -1.0R`,
      data: {
        signalId: event.signalId,
        symbol: event.symbol,
        type: 'sl_hit',
        pnlR: -1.0
      },
      timestamp: new Date(),
      priority: 'high'
    }

    return this.queueNotification(notification)
  }

  /**
   * Generate signal completed notification
   */
  notifySignalCompleted(outcome: SignalOutcome): PushNotification {
    let summary = ''
    if (outcome.targetHits.t4) {
      summary = `T4 HIT (${outcome.pnlR.toFixed(2)}R)`
    } else if (outcome.targetHits.t3) {
      summary = `T3 HIT (${outcome.pnlR.toFixed(2)}R)`
    } else if (outcome.targetHits.t2) {
      summary = `T2 HIT (${outcome.pnlR.toFixed(2)}R)`
    } else if (outcome.targetHits.t1) {
      summary = `T1 HIT (${outcome.pnlR.toFixed(2)}R)`
    } else if (outcome.targetHits.sl) {
      summary = `STOPPED OUT (-1.0R)`
    } else {
      summary = `EXITED at ${outcome.exitReason}`
    }

    const notification: PushNotification = {
      title: `✅ ${outcome.symbol} Signal Completed`,
      body: `${summary} | P&L: ${outcome.pnlPercent >= 0 ? '+' : ''}${outcome.pnlPercent.toFixed(2)}%`,
      data: {
        signalId: outcome.signalId,
        symbol: outcome.symbol,
        type: 'signal_completed',
        pnlR: outcome.pnlR,
        pnlPercent: outcome.pnlPercent
      },
      timestamp: new Date(),
      priority: 'normal'
    }

    return this.queueNotification(notification)
  }

  /**
   * Generate daily summary notification
   */
  notifyDailySummary(metrics: {
    totalSignalsToday: number
    winnersToday: number
    losersToday: number
    totalPnlRToday: number
    bestSignal?: { symbol: string; pnlR: number }
    worstSignal?: { symbol: string; pnlR: number }
  }): PushNotification {
    const winRate = metrics.totalSignalsToday > 0 ? (metrics.winnersToday / metrics.totalSignalsToday * 100).toFixed(0) : 0

    const notification: PushNotification = {
      title: '📊 Daily Trading Summary',
      body: `Signals: ${metrics.totalSignalsToday} | W: ${metrics.winnersToday} L: ${metrics.losersToday} (${winRate}%) | P&L: ${metrics.totalPnlRToday >= 0 ? '+' : ''}${metrics.totalPnlRToday.toFixed(2)}R`,
      data: {
        signalId: 'daily_summary',
        symbol: 'SUMMARY',
        type: 'signal_completed',
        pnlR: metrics.totalPnlRToday
      },
      timestamp: new Date(),
      priority: 'normal'
    }

    return this.queueNotification(notification)
  }

  /**
   * Queue notification for sending
   */
  private queueNotification(notification: PushNotification): PushNotification {
    const dedupeKey = `${notification.data.signalId}-${notification.data.type}`

    // Check if we've sent this notification recently
    if (!this.sentNotifications.has(dedupeKey)) {
      this.notificationQueue.push(notification)
      this.sentNotifications.add(dedupeKey)

      // Clear dedupe after window
      setTimeout(() => {
        this.sentNotifications.delete(dedupeKey)
      }, this.dedupeWindow)
    }

    return notification
  }

  /**
   * Get queued notifications
   */
  getQueuedNotifications(): PushNotification[] {
    return [...this.notificationQueue]
  }

  /**
   * Clear notification queue (after sending)
   */
  clearQueue(): void {
    this.notificationQueue = []
  }

  /**
   * Send notification (placeholder - integrate with FCM, APNs, etc.)
   */
  async sendNotification(notification: PushNotification): Promise<boolean> {
    try {
      // In production, integrate with:
      // - Firebase Cloud Messaging (FCM) for Android
      // - Apple Push Notification service (APNs) for iOS
      // - Web Push Notification API for web

      console.log(`📤 Sending notification: [${notification.priority.toUpperCase()}] ${notification.title}`)
      console.log(`    ${notification.body}`)

      // Simulate successful send
      return true
    } catch (error) {
      console.error('Failed to send notification:', error)
      return false
    }
  }

  /**
   * Send all queued notifications
   */
  async sendAllQueued(): Promise<number> {
    let sentCount = 0

    for (const notification of this.notificationQueue) {
      const success = await this.sendNotification(notification)
      if (success) {
        sentCount++
      }
    }

    if (sentCount > 0) {
      this.clearQueue()
    }

    return sentCount
  }

  /**
   * Get priority for tier
   */
  private getPriorityForTier(tier: ConfidenceTier): 'high' | 'normal' | 'low' {
    if (tier === ConfidenceTier.A) {
      return 'high'
    } else if (tier === ConfidenceTier.B) {
      return 'normal'
    } else {
      return 'low'
    }
  }

  /**
   * Format notification for display
   */
  formatForDisplay(notification: PushNotification): string {
    return `[${notification.timestamp.toLocaleTimeString()}] ${notification.title}\n${notification.body}`
  }
}
