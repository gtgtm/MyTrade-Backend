// Real-time Manager - WebSocket updates for prices, exits, and divergence alerts
// Emits live data to connected clients with <100ms latency

class RealtimeManager {
  constructor(io) {
    this.io = io;
    this.clients = new Map(); // socketId -> { symbol, subscribed }
    this.priceUpdateInterval = null;
    this.exitNotifyQueue = [];
    this.lastPriceBroadcast = {};
  }

  // Subscribe to symbol updates (client requests)
  subscribe(socket, symbol) {
    const socketId = socket.id;

    if (!this.clients.has(socketId)) {
      this.clients.set(socketId, new Set());
    }

    this.clients.get(socketId).add(symbol.toUpperCase());

    console.log(`✅ [RealTime] Client ${socketId.substring(0, 8)} subscribed to ${symbol}`);

    socket.emit('subscription:confirmed', {
      symbol: symbol.toUpperCase(),
      timestamp: new Date().toISOString()
    });
  }

  // Unsubscribe from symbol
  unsubscribe(socket, symbol) {
    const socketId = socket.id;

    if (this.clients.has(socketId)) {
      this.clients.get(socketId).delete(symbol.toUpperCase());

      if (this.clients.get(socketId).size === 0) {
        this.clients.delete(socketId);
      }
    }

    console.log(`🔌 [RealTime] Client ${socketId.substring(0, 8)} unsubscribed from ${symbol}`);
  }

  // Client disconnect cleanup
  handleDisconnect(socketId) {
    this.clients.delete(socketId);
    console.log(`🔌 [RealTime] Client ${socketId.substring(0, 8)} disconnected`);
  }

  // Broadcast live price update to subscribed clients
  broadcastPrice(symbol, priceData) {
    const key = symbol.toUpperCase();

    // Throttle: only broadcast if price changed by >0.01%
    const lastBroadcast = this.lastPriceBroadcast[key];
    if (lastBroadcast) {
      const change = Math.abs(priceData.price - lastBroadcast.price) / lastBroadcast.price;
      if (change < 0.0001) return; // Skip small changes
    }

    this.lastPriceBroadcast[key] = priceData;

    // Send only to clients subscribed to this symbol
    for (const [socketId, symbols] of this.clients) {
      if (symbols.has(key)) {
        this.io.to(socketId).emit('price:update', {
          symbol: key,
          price: priceData.price,
          change: priceData.change,
          changePercent: priceData.changePercent,
          timestamp: new Date().toISOString(),
          latency: priceData.latency || 0
        });
      }
    }
  }

  // Notify all clients of trade exit (high priority)
  notifyTradeExit(exit) {
    const payload = {
      id: exit.id,
      symbol: exit.symbol,
      exitType: exit.exitType,
      pnl: exit.pnl,
      pnlPercent: exit.pnlPercent,
      isWin: exit.isWin,
      timestamp: new Date().toISOString()
    };

    console.log(`🎯 [RealTime] Broadcasting exit: ${exit.symbol} ${exit.exitType} ${exit.pnlPercent > 0 ? '+' : ''}${exit.pnlPercent.toFixed(2)}%`);

    // Broadcast to all connected clients (not just subscribed)
    this.io.emit('trade:exit', payload);
  }

  // Alert on divergence detection
  notifyDivergence(divergenceReport) {
    if (divergenceReport.overallStatus === 'DIVERGED') {
      const severity = divergenceReport.severity;

      console.log(`⚠️ [RealTime] Divergence alert: ${severity}`);

      this.io.emit('divergence:alert', {
        severity,
        status: divergenceReport.overallStatus,
        message: divergenceReport.recommendation.message,
        metrics: divergenceReport.actualMetrics,
        timestamp: new Date().toISOString(),
        shouldAutoHalt: divergenceReport.shouldAutoHalt
      });
    }
  }

  // Alert on auto-halt triggered
  notifyAutoHalt(reason) {
    console.log(`🛑 [RealTime] AUTO-HALT triggered: ${reason}`);

    this.io.emit('system:auto-halt', {
      reason,
      timestamp: new Date().toISOString(),
      action: 'SIGNAL_GENERATION_PAUSED'
    });
  }

  // Incident notification
  notifyIncident(incident) {
    console.log(`🚨 [RealTime] Incident: ${incident.type} (${incident.severity})`);

    this.io.emit('incident:alert', {
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
      message: incident.message,
      timestamp: new Date().toISOString()
    });
  }

  // Get subscription stats
  getStats() {
    const subscribedSymbols = new Set();
    for (const symbols of this.clients.values()) {
      symbols.forEach(s => subscribedSymbols.add(s));
    }

    return {
      connectedClients: this.clients.size,
      subscriptions: subscribedSymbols.size,
      symbols: Array.from(subscribedSymbols)
    };
  }

  // Clean shutdown
  shutdown() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    this.clients.clear();
    console.log('✅ [RealTime] Shutdown complete');
  }
}

export default RealtimeManager;
