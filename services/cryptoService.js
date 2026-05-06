import axios from 'axios';

const BINANCE_API_BASE = 'https://api.binance.com/api/v3';
// Fallback: Use proxy service when Render's IP is blocked
const PROXY_API_BASE = 'https://api.coingecko.com/api/v3';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

class CryptoService {
  constructor() {
    this.binanceClient = axios.create({
      baseURL: BINANCE_API_BASE,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    // CoinGecko as fallback (free, no blocking)
    this.fallbackClient = axios.create({
      baseURL: PROXY_API_BASE,
      timeout: 10000
    });
  }

  // Convert CoinGecko price to match Binance format
  async getFallbackPrice(symbol) {
    try {
      const coinId = this.getCoinGeckoId(symbol);
      if (!coinId) return null;

      const res = await this.fallbackClient.get('/simple/price', {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
          include_market_cap: false
        }
      });

      const price = res.data[coinId]?.usd;
      if (price) {
        console.log(`[CryptoService] Using CoinGecko fallback for ${symbol}: $${price}`);
        return price;
      }
    } catch (err) {
      console.error(`[CryptoService] CoinGecko fallback failed for ${symbol}:`, err.message);
    }
    return null;
  }

  getCoinGeckoId(symbol) {
    const map = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'SOLUSDT': 'solana',
      'XRPUSDT': 'ripple',
      'DOGEUSDT': 'dogecoin',
      'LINKUSDT': 'chainlink',
      'BNBUSDT': 'binancecoin',
      'ADAUSDT': 'cardano',
      'MATICUSDT': 'matic-network',
      'UNIUSDT': 'uniswap'
    };
    return map[symbol] || null;
  }

  async fetchKlines(symbol, interval = '15m', limit = 100, retries = 2) {
    try {
      const res = await this.binanceClient.get('/klines', {
        params: { symbol, interval, limit }
      });
      return res.data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quoteVolume: parseFloat(k[7]),
        takerBuyBaseVolume: parseFloat(k[9])
      }));
    } catch (err) {
      if (retries > 0) {
        console.log(`CryptoService.fetchKlines(${symbol}) retry ${3 - retries}/2...`);
        await new Promise(r => setTimeout(r, 500));
        return this.fetchKlines(symbol, interval, limit, retries - 1);
      }
      console.error(`CryptoService.fetchKlines(${symbol}) failed:`, err.message);
      return null;
    }
  }

  async fetchTicker(symbol, retries = 2) {
    try {
      const res = await this.binanceClient.get('/ticker/24hr', {
        params: { symbol }
      });
      return {
        symbol: res.data.symbol,
        price: parseFloat(res.data.lastPrice),
        priceChangePercent: parseFloat(res.data.priceChangePercent),
        volume: parseFloat(res.data.volume),
        quoteVolume: parseFloat(res.data.quoteAssetVolume),
        highPrice: parseFloat(res.data.highPrice),
        lowPrice: parseFloat(res.data.lowPrice),
        bidPrice: parseFloat(res.data.bidPrice),
        askPrice: parseFloat(res.data.askPrice)
      };
    } catch (err) {
      // Binance blocked - try CoinGecko fallback
      console.log(`[CryptoService] Binance failed for ${symbol}, trying CoinGecko fallback...`);
      const fallbackPrice = await this.getFallbackPrice(symbol);
      if (fallbackPrice) {
        return {
          symbol: symbol,
          price: fallbackPrice,
          priceChangePercent: 0, // CoinGecko doesn't provide 24h change easily
          volume: 0,
          quoteVolume: 0,
          highPrice: fallbackPrice,
          lowPrice: fallbackPrice,
          bidPrice: fallbackPrice,
          askPrice: fallbackPrice
        };
      }

      if (retries > 0) {
        console.log(`CryptoService.fetchTicker(${symbol}) retry ${3 - retries}/2...`);
        await new Promise(r => setTimeout(r, 500));
        return this.fetchTicker(symbol, retries - 1);
      }
      console.error(`CryptoService.fetchTicker(${symbol}) failed:`, err.message);
      return null;
    }
  }

  async fetchAll(symbol) {
    const [klines, ticker] = await Promise.all([
      this.fetchKlines(symbol),
      this.fetchTicker(symbol)
    ]);
    if (!klines || !ticker) {
      console.warn(`CryptoService.fetchAll(${symbol}): falling back to mock data`);
      return this.mockData(symbol);
    }
    return { klines, ticker };
  }

  mockData(symbol) {
    const seeds = {
      BTCUSDT: 78300,
      ETHUSDT: 2300,
      SOLUSDT: 180,
      XRPUSDT: 2.50,
      DOGEUSDT: 0.42
    };
    const basePrice = seeds[symbol] || 1000;
    const priceVariation = basePrice * (0.02 * Math.random() - 0.01);
    const price = basePrice + priceVariation;

    const klines = Array.from({ length: 100 }, (_, i) => ({
      time: Date.now() - (100 - i) * 15 * 60 * 1000,
      open: price * (0.99 + Math.random() * 0.02),
      high: price * (1.00 + Math.random() * 0.01),
      low: price * (0.99 - Math.random() * 0.01),
      close: price * (0.99 + Math.random() * 0.02),
      volume: 1000000 + Math.random() * 5000000,
      takerBuyBaseVolume: 500000 + Math.random() * 4000000,
      quoteVolume: 1000000 + Math.random() * 5000000
    }));

    return {
      klines,
      ticker: {
        symbol,
        price,
        priceChangePercent: -5 + Math.random() * 10,
        volume: 50000000 + Math.random() * 100000000,
        quoteVolume: 1000000000 + Math.random() * 5000000000,
        highPrice: basePrice * 1.03,
        lowPrice: basePrice * 0.97,
        bidPrice: price - 1,
        askPrice: price + 1
      }
    };
  }
}

export default new CryptoService();
