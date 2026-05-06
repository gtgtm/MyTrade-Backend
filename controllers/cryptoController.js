import cryptoService from '../services/cryptoService.js';
import CryptoSignalEngine from '../services/cryptoSignalEngine.js';
import signalLogger from '../services/signalAccuracyLogger.js';

// Default supported symbols for dashboard display
const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'LINKUSDT', 'BNBUSDT', 'ADAUSDT', 'MATICUSDT', 'UNIUSDT', 'ARBUSDT', 'OPUSDT', 'FLOKIUSDT', 'PEPEUSDT', 'MEMEUSDT', 'BOMEUSDT', 'BONKUSDT', 'FILUSDT', 'ATOMUSDT', 'DOTUSDT', 'LTCUSDT', 'AVAXUSDT', 'VETUSDT', 'FTMUSDT', 'HBARUSDT', 'NEARUSDT'];

class CryptoController {
  async getSignal(req, res) {
    const { symbol } = req.params;
    const normalizedSymbol = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;

    // Validate symbol format (must be valid Binance symbol)
    if (!/^[A-Z0-9]+USDT$/.test(normalizedSymbol)) {
      return res.status(400).json({
        success: false,
        error: `Invalid symbol format. Expected format: XXXUSDT (e.g., BTCUSDT)`
      });
    }

    try {
      // Use cache for prices (5 min TTL) to avoid rate limiting
      const cacheKey = `price_${normalizedSymbol}`;
      const cachedPrice = global.cache?.getFromCache(cacheKey);

      let livePrice = null;

      if (cachedPrice) {
        console.log(`[CryptoController] Using cached price for ${normalizedSymbol}: $${cachedPrice}`);
        livePrice = cachedPrice;
      } else {
        // Try to fetch fresh price from CoinGecko
        console.log(`[CryptoController] Fetching fresh price for ${normalizedSymbol}...`);
        livePrice = await cryptoService.getFallbackPrice(normalizedSymbol);

        if (livePrice) {
          // Cache for 5 minutes
          global.cache?.setCache(cacheKey, livePrice);
          console.log(`[CryptoController] Cached price for ${normalizedSymbol}: $${livePrice}`);
        }
      }

      if (!livePrice) {
        return res.status(500).json({
          success: false,
          error: `Failed to fetch price for ${normalizedSymbol} - symbol may not exist or API rate limited`
        });
      }

      // Try to get klines, but they might fail
      let klines = [];
      let priceChange = 0;
      try {
        const data = await cryptoService.fetchAll(normalizedSymbol);
        klines = data?.klines || [];
        priceChange = data?.ticker?.priceChangePercent || 0;
      } catch (err) {
        console.log(`[CryptoController] Could not fetch klines for ${normalizedSymbol}`);
      }

      // Create ticker with real-time price
      const ticker = {
        symbol: normalizedSymbol,
        price: livePrice,
        priceChangePercent: priceChange,
        volume: 0,
        quoteVolume: 0,
        highPrice: livePrice,
        lowPrice: livePrice,
        bidPrice: livePrice,
        askPrice: livePrice
      };

      const signal = CryptoSignalEngine.generate(normalizedSymbol, klines, ticker);

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
          livePrice
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
        DEFAULT_SYMBOLS.map(async symbol => {
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
