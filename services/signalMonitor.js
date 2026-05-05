import cron from 'node-cron';
import nseService from './nseService.js';
import signalEngine from './signalEngine.js';

class SignalMonitor {
    startMonitoring() {
        console.log('🚀 [SignalMonitor] Starting background signal monitoring...');

        // Run every 5 minutes: */5 * * * *
        cron.schedule('*/5 * * * *', async () => {
            console.log('⏰ [SignalMonitor] Checking for high-confidence signals...');
            await this.checkSignals();
        });

        console.log('✅ [SignalMonitor] Background monitoring started (every 5 minutes)');
    }

    async checkSignals() {
        const symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
        const highScoreSignals = [];

        for (const symbol of symbols) {
            try {
                // Fetch latest option chain
                let chainRows;
                try {
                    chainRows = await nseService.fetchOptionChain(symbol);
                } catch (error) {
                    console.warn(`⚠️ [SignalMonitor] Real data unavailable for ${symbol}, using mock`);
                    chainRows = nseService.mockData(symbol);
                }

                // Prepare data
                const price = chainRows[0]?.underlyingValue || chainRows[0]?.price || 22300;
                const totalCallOI = chainRows.reduce((sum, row) =>
                    sum + (row.CE?.openInterest || 0), 0);
                const totalPutOI = chainRows.reduce((sum, row) =>
                    sum + (row.PE?.openInterest || 0), 0);
                const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
                const maxPain = nseService.computeMaxPain(chainRows);
                const daysToExpiry = chainRows[0]?.expiryDate ? nseService.daysToExpiry(chainRows[0].expiryDate) : null;

                const chain = {
                    symbol,
                    price,
                    pcr,
                    callOI: totalCallOI,
                    putOI: totalPutOI,
                    maxPain,
                    daysToExpiry,
                    rows: chainRows,
                    isMock: false
                };

                // Generate signal
                const signal = signalEngine.generate(chain, []);

                console.log(`📊 [SignalMonitor] ${symbol}: Score ${signal.score}, Signal: ${signal.signalType}`);

                // Check if high confidence (80+)
                if (signal.score >= 80) {
                    console.log(`🎯 [SignalMonitor] HIGH CONFIDENCE SIGNAL FOUND: ${symbol} - ${signal.signalType}`);
                    highScoreSignals.push({
                        symbol,
                        signal,
                        price,
                        confidence: signal.score,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error(`❌ [SignalMonitor] Error checking ${symbol}:`, error);
            }
        }

        // Also check crypto signals
        await this.checkCryptoSignals(highScoreSignals);

        // Log results
        if (highScoreSignals.length > 0) {
            console.log(`✅ [SignalMonitor] Found ${highScoreSignals.length} high-confidence signals`);
            await this.logSignalsForNotification(highScoreSignals);
        } else {
            console.log('📊 [SignalMonitor] No high-confidence signals found');
        }
    }

    async checkCryptoSignals(highScoreSignals) {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

        for (const symbol of symbols) {
            try {
                // Fetch crypto price from Binance
                const price = await this.fetchCryptoPrice(symbol);

                // For crypto, we'd need a crypto signal generator
                // For now, we log that we checked it
                console.log(`📊 [SignalMonitor] Crypto ${symbol}: Price ${price}`);

                // TODO: Implement crypto signal generation from Binance data
                // This would require:
                // 1. Fetch Binance OHLCV data
                // 2. Calculate indicators (RSI, MACD, etc)
                // 3. Generate signal using signal engine
                // 4. Check if score >= 80

            } catch (error) {
                console.error(`❌ [SignalMonitor] Error checking crypto ${symbol}:`, error);
            }
        }
    }

    async fetchCryptoPrice(symbol) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            const data = await response.json();
            return parseFloat(data.price);
        } catch (error) {
            console.error(`❌ [SignalMonitor] Failed to fetch ${symbol} from Binance:`, error);
            throw error;
        }
    }

    async logSignalsForNotification(signals) {
        // This would integrate with APNs (Apple Push Notification service)
        // For production, you'd send via a service like Firebase Cloud Messaging or direct APNs

        console.log('📱 [SignalMonitor] Signal notification logging:');
        for (const signal of signals) {
            console.log(`
  ┌─────────────────────────────┐
  │ 🎯 HIGH CONFIDENCE SIGNAL   │
  │                             │
  │ Symbol: ${signal.symbol}
  │ Signal: ${signal.signal.signalType}
  │ Score: ${signal.confidence}/100
  │ Price: ₹${signal.price.toFixed(2)}
  │ Time: ${signal.timestamp}
  │                             │
  │ Would send APNs notification│
  │ to connected iOS devices    │
  └─────────────────────────────┘
            `);
        }

        // TODO: Implement actual APNs push notifications
        // This requires:
        // 1. APNs certificate from Apple
        // 2. Device tokens stored in database
        // 3. apn package configured
        // 4. User subscription tracking
    }
}

const monitor = new SignalMonitor();
export default monitor;
