import cryptoService from '../services/cryptoService.js';
import CryptoSignalEngine from '../services/cryptoSignalEngine.js';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

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

      res.json({
        success: true,
        data: signal,
        isMock: false,
        timestamp: new Date().toISOString()
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
        timestamp: new Date().toISOString()
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
}

export default new CryptoController();
