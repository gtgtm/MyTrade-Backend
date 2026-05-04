import nseService from './nseService.js';
import cryptoService from './cryptoService.js';
import signalEngine from './signalEngine.js';
import CryptoSignalEngine from './cryptoSignalEngine.js';
import pushNotificationManager from './pushNotificationManager.js';

class SignalMonitorService {
  constructor() {
    this.lastNotifiedSignals = new Map();
    this.notificationCooldown = 3600000; // 1 hour cooldown between same signal notifications
  }

  /**
   * Check all NSE and Crypto signals
   */
  async checkAllSignals() {
    const signals = [];

    // Check NSE signals
    const nseSymbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
    for (const symbol of nseSymbols) {
      try {
        const signal = await this.checkNSESignal(symbol);
        if (signal) {
          signals.push(signal);
        }
      } catch (error) {
        console.error(`Error checking NSE signal for ${symbol}:`, error.message);
      }
    }

    // Check Crypto signals
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    for (const symbol of cryptoSymbols) {
      try {
        const signal = await this.checkCryptoSignal(symbol);
        if (signal) {
          signals.push(signal);
        }
      } catch (error) {
        console.error(`Error checking Crypto signal for ${symbol}:`, error.message);
      }
    }

    return signals;
  }

  /**
   * Check NSE signal for a symbol
   */
  async checkNSESignal(symbol) {
    try {
      let chainRows;
      try {
        chainRows = await nseService.fetchOptionChain(symbol);
      } catch {
        chainRows = nseService.mockData(symbol);
      }

      const price = chainRows[0]?.underlyingValue || 22300;
      const totalCallOI = chainRows.reduce((sum, row) => sum + (row.CE?.openInterest || 0), 0);
      const totalPutOI = chainRows.reduce((sum, row) => sum + (row.PE?.openInterest || 0), 0);
      const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
      const maxPain = nseService.computeMaxPain(chainRows);
      const daysToExpiry = chainRows[0]?.expiryDate ? nseService.daysToExpiry(chainRows[0].expiryDate) : null;

      const chain = {
        symbol,
        price,
        pcr,
        maxPain,
        daysToExpiry,
        rows: chainRows,
        isMock: false
      };

      const signal = signalEngine.generate(chain, []);

      return {
        symbol,
        type: 'NSE',
        signalType: signal.signalType,
        score: signal.score,
        confidence: signal.confidence,
        price,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        target: signal.target,
        isGood: this.isGoodSignal(signal),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error checking NSE signal for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Check Crypto signal for a symbol
   */
  async checkCryptoSignal(symbol) {
    try {
      const data = await cryptoService.fetchAll(symbol);

      if (!data || !data.klines || !data.ticker) {
        return null;
      }

      const signal = CryptoSignalEngine.generate(symbol, data.klines, data.ticker);

      return {
        symbol,
        type: 'CRYPTO',
        signalType: signal.signalType,
        score: signal.score,
        confidence: signal.confidence,
        price: signal.price,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        target: signal.target,
        isGood: this.isGoodSignal(signal),
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error checking Crypto signal for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Determine if a signal is good enough to notify
   */
  isGoodSignal(signal) {
    // Consider a signal good if:
    // 1. It's a BUY signal (CALL or PUT)
    // 2. Score is >= 70 (strong signal)
    // 3. Has valid entry, stopLoss, and target

    const isBuySignal = signal.signalType === 'BUY CALL' || signal.signalType === 'BUY PUT';
    const hasHighScore = signal.score >= 70;
    const hasValidPrices = signal.entryPrice && signal.stopLoss && signal.target;

    return isBuySignal && hasHighScore && hasValidPrices;
  }

  /**
   * Send notification to user
   */
  async notifyUser(signal) {
    const signalKey = `${signal.symbol}_${signal.signalType}`;
    const lastNotified = this.lastNotifiedSignals.get(signalKey);
    const now = Date.now();

    // Skip if already notified recently (cooldown)
    if (lastNotified && (now - lastNotified) < this.notificationCooldown) {
      return;
    }

    try {
      const message = this.formatNotificationMessage(signal);

      // Send push notification
      if (global.pushNotificationManager) {
        await global.pushNotificationManager.sendBroadcast({
          title: `📊 ${signal.symbol} Signal Alert`,
          body: message,
          data: {
            symbol: signal.symbol,
            signalType: signal.signalType,
            score: signal.score,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            target: signal.target
          }
        });
      }

      // Update last notified timestamp
      this.lastNotifiedSignals.set(signalKey, now);

      console.log(`✅ Notification sent for ${signal.symbol}`);
    } catch (error) {
      console.error(`❌ Error sending notification:`, error.message);
    }
  }

  /**
   * Format notification message
   */
  formatNotificationMessage(signal) {
    const rrRatio = signal.target && signal.stopLoss && signal.entryPrice
      ? ((signal.target - signal.entryPrice) / (signal.entryPrice - signal.stopLoss)).toFixed(2)
      : 'N/A';

    return `${signal.signalType} | Score: ${signal.score}/100 | Entry: ${signal.entryPrice?.toFixed(2)} | SL: ${signal.stopLoss?.toFixed(2)} | Target: ${signal.target?.toFixed(2)} | R:R ${rrRatio}`;
  }
}

export default new SignalMonitorService();
