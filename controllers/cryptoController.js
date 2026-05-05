import cryptoService from '../services/cryptoService.js';
import CryptoSignalEngine from '../services/cryptoSignalEngine.js';
import signalLogger from '../services/signalAccuracyLogger.js';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'LINKUSDT', 'BNBUSDT', 'ADAUSDT', 'MATICUSDT', 'UNIUSDT'];

class CryptoController {
  async getSignal(req, res) {
    const { symbol } = req.params;
    const normalizedSymbol = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;

    if (!SYMBOLS.includes(normalizedSymbol)) {
      return res.status(400).json({
        success: false,
        error: `Invalid crypto symbol. Supported: ${SYMBOLS.join(', ')}`
      });
    }

    const cacheKey = `crypto_signal_${normalizedSymbol}`;
    const cached = global.cache?.getFromCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        isMock: cached.isMock || false,
        cached: true,
        timestamp: cached.generatedAt || new Date().toISOString()
      });
    }

    try {
      const data = await cryptoService.fetchAll(normalizedSymbol);
      if (!data) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch crypto data'
        });
      }

      const signal = CryptoSignalEngine.generate(normalizedSymbol, data.klines, data.ticker);
      global.cache?.setCache(cacheKey, signal);

      // Log signal for accuracy tracking
      signalLogger.logGenerated(signal).catch(err => console.error('Signal logging error:', err.message));

      res.json({
        success: true,
        data: signal,
        isMock: false,
        timestamp: signal.generatedAt,
        metadata: {
          timestamp: signal.generatedAt,
          fromCache: false,
          validFor: signal.validFor,
          validUntil: signal.validUntil,
          livePrice: data.ticker.price
        }
      });
    } catch (err) {
      console.error('CryptoController.getSignal error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  async getAllSignals(req, res) {
    try {
      // Priority 1: Return high-confidence MTF signals from scheduler if available
      if (global.exitManager) {
        const confluencedSignals = await global.exitManager.getConfluencedSignals(null, 50);
        if (confluencedSignals && confluencedSignals.length > 0) {
          // Enrich with timeframe label
          const enriched = confluencedSignals.map(s => ({
            ...s,
            label: `${s.confluenceBreakdown?.agreementCount}/${s.confluenceBreakdown?.totalTimeframes} TF Agreement`
          }));

          return res.json({
            success: true,
            data: enriched,
            count: enriched.length,
            source: 'live-scheduler-mtf',
            timestamp: new Date().toISOString(),
            metadata: {
              timestamp: new Date().toISOString(),
              fromScheduler: true,
              confluenceValidated: true,
              note: 'High-confidence multi-timeframe signals from live scheduler'
            }
          });
        }
      }

      // Priority 2: Fall back to generating fresh signals
      const signals = await Promise.allSettled(
        SYMBOLS.map(async symbol => {
          const cacheKey = `crypto_signal_${symbol}`;
          const cached = global.cache?.getFromCache(cacheKey);
          if (cached) return cached;

          const data = await cryptoService.fetchAll(symbol);
          if (!data) return null;

          const signal = CryptoSignalEngine.generate(symbol, data.klines, data.ticker);
          global.cache?.setCache(cacheKey, signal);
          return signal;
        })
      );

      const results = signals
        .map(s => s.status === 'fulfilled' ? s.value : null)
        .filter(Boolean);

      res.json({
        success: true,
        data: results,
        count: results.length,
        source: 'on-demand-generation',
        timestamp: new Date().toISOString(),
        metadata: {
          timestamp: new Date().toISOString(),
          fromCache: false,
          confluenceValidated: false,
          note: 'On-demand generated signals (not from scheduler). Each signal includes validFor and validUntil timestamps'
        }
      });
    } catch (err) {
      console.error('CryptoController.getAllSignals error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
        data: []
      });
    }
  }

  async getAccuracyMetrics(req, res) {
    const { symbol } = req.params;
    const windowDays = parseInt(req.query.window || '30');

    try {
      const metrics = await signalLogger.getMetrics(symbol, windowDays);
      res.json({
        success: true,
        data: metrics
      });
    } catch (err) {
      console.error('CryptoController.getAccuracyMetrics error:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve accuracy metrics'
      });
    }
  }
}

export default new CryptoController();
