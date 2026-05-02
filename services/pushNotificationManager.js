// Push Notification Manager - APNs (iOS) and FCM (Android) integration
// Sends alerts for trade exits, divergence, and system events

import crypto from 'crypto';

class PushNotificationManager {
  constructor() {
    this.deviceTokens = new Map(); // userId -> [tokens]
    this.notificationHistory = [];
    this.maxHistory = 1000;
    this.dedupeWindow = 5000; // 5s dedup window
    this.lastNotifications = new Map();
  }

  // Register device token (iOS/Android)
  registerDeviceToken(userId, token, platform = 'ios') {
    if (!this.deviceTokens.has(userId)) {
      this.deviceTokens.set(userId, []);
    }

    const tokens = this.deviceTokens.get(userId);
    if (!tokens.includes(token)) {
      tokens.push({ token, platform, registeredAt: new Date() });
      console.log(`📱 [Push] Device token registered: ${userId} (${platform})`);
    }
  }

  // Unregister device token
  unregisterDeviceToken(userId, token) {
    if (this.deviceTokens.has(userId)) {
      const tokens = this.deviceTokens.get(userId);
      const idx = tokens.findIndex(t => t.token === token);
      if (idx >= 0) {
        tokens.splice(idx, 1);
        console.log(`📴 [Push] Device token unregistered: ${userId}`);
      }
    }
  }

  // Send trade exit notification
  async notifyTradeExit(exit, userIds = []) {
    const dedupeKey = `exit:${exit.symbol}:${exit.exitTime}`;

    // Check deduplication window
    if (this.lastNotifications.has(dedupeKey)) {
      const lastTime = this.lastNotifications.get(dedupeKey);
      if (Date.now() - lastTime < this.dedupeWindow) {
        return; // Skip duplicate
      }
    }

    this.lastNotifications.set(dedupeKey, Date.now());

    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'TRADE_EXIT',
      title: `${exit.symbol}: ${exit.exitType}`,
      body: exit.isWin
        ? `✅ Target hit! P&L: +${exit.pnlPercent.toFixed(2)}%`
        : `❌ Stop loss hit. P&L: ${exit.pnlPercent.toFixed(2)}%`,
      data: {
        tradeId: exit.id,
        symbol: exit.symbol,
        pnl: exit.pnl.toString(),
        pnlPercent: exit.pnlPercent.toFixed(2),
        exitType: exit.exitType,
        deeplink: `fnos://trade/${exit.id}`
      },
      badge: exit.isWin ? 1 : 2, // 1=green, 2=red
      sound: 'default',
      priority: 'high',
      sentAt: new Date().toISOString()
    };

    // Send to all users if not specified
    const targets = userIds.length > 0 ? userIds : Array.from(this.deviceTokens.keys());

    for (const userId of targets) {
      const tokens = this.deviceTokens.get(userId) || [];
      for (const tokenObj of tokens) {
        await this.sendPushNotification(tokenObj.token, notification, tokenObj.platform);
      }
    }

    this.recordNotification(notification);
    return notification;
  }

  // Send divergence alert
  async notifyDivergence(divergenceData, severity) {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'DIVERGENCE_ALERT',
      title: `Divergence Alert: ${severity}`,
      body: divergenceData.recommendation.message,
      data: {
        severity,
        winRate: divergenceData.actualMetrics.winRate,
        expectedWinRate: divergenceData.baselineExpectations.winRate,
        deeplink: 'fnos://metrics'
      },
      badge: 3, // 3=yellow alert
      sound: 'alert',
      priority: severity === 'CRITICAL' ? 'high' : 'normal',
      sentAt: new Date().toISOString()
    };

    // Send to all users
    for (const userId of this.deviceTokens.keys()) {
      const tokens = this.deviceTokens.get(userId) || [];
      for (const tokenObj of tokens) {
        await this.sendPushNotification(tokenObj.token, notification, tokenObj.platform);
      }
    }

    this.recordNotification(notification);
    return notification;
  }

  // Send auto-halt notification
  async notifyAutoHalt(reason) {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'AUTO_HALT',
      title: '⛔ Auto-Halt Triggered',
      body: `Signal generation paused: ${reason}`,
      data: {
        reason,
        deeplink: 'fnos://incidents'
      },
      badge: 4, // 4=critical
      sound: 'critical_alert',
      priority: 'high',
      sentAt: new Date().toISOString()
    };

    // Send to all users
    for (const userId of this.deviceTokens.keys()) {
      const tokens = this.deviceTokens.get(userId) || [];
      for (const tokenObj of tokens) {
        await this.sendPushNotification(tokenObj.token, notification, tokenObj.platform);
      }
    }

    this.recordNotification(notification);
    return notification;
  }

  // Internal: Send push to a single device
  async sendPushNotification(token, notification, platform) {
    try {
      if (platform === 'ios') {
        // APNs integration (stubbed - would use apn package)
        console.log(`📤 [Push] Sending to iOS: ${token.substring(0, 16)}... | ${notification.title}`);
        // const apn = require('apn');
        // await apn.send(token, notification);
      } else if (platform === 'android') {
        // FCM integration (stubbed - would use firebase-admin)
        console.log(`📤 [Push] Sending to Android: ${token.substring(0, 16)}... | ${notification.title}`);
        // const admin = require('firebase-admin');
        // await admin.messaging().send(message);
      }

      return { sent: true, platform, token: token.substring(0, 16) };
    } catch (error) {
      console.error(`❌ [Push] Failed to send: ${error.message}`);
      return { sent: false, error: error.message };
    }
  }

  // Record notification in history
  recordNotification(notification) {
    this.notificationHistory.push(notification);

    // Trim history if too large
    if (this.notificationHistory.length > this.maxHistory) {
      this.notificationHistory = this.notificationHistory.slice(-this.maxHistory);
    }
  }

  // Get notification history
  getHistory(type = null, limit = 50) {
    let history = this.notificationHistory;

    if (type) {
      history = history.filter(n => n.type === type);
    }

    return history.slice(-limit).reverse();
  }

  // Get stats
  getStats() {
    return {
      registeredUsers: this.deviceTokens.size,
      totalDevices: Array.from(this.deviceTokens.values()).reduce((sum, tokens) => sum + tokens.length, 0),
      historyCount: this.notificationHistory.length,
      byType: this.notificationHistory.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

export default PushNotificationManager;
