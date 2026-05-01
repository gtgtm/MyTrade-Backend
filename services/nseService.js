import axios from 'axios';

class NSEService {
  constructor() {
    this.baseURL = process.env.NSE_API_BASE || 'https://www.nseindia.com';
    this.timeout = parseInt(process.env.NSE_API_TIMEOUT) || 15000;
    this.cookieExpiry = new Date(0);
    this.cookieTTL = 600000;
    this.cookies = '';

    this.client = axios.create({
      timeout: this.timeout,
      baseURL: this.baseURL,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'sec-ch-ua': '"Not_A Brand";v="99", "Google Chrome";v="124"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'DNT': '1'
      }
    });
  }

  async refreshCookies() {
    try {
      console.log('🔄 Refreshing NSE cookies...');

      const response = await this.client.get('/');
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.client.defaults.headers['Cookie'] = this.cookies;
      }

      await new Promise(resolve => setTimeout(resolve, 800));

      await this.client.get('/option-chain', {
        headers: { 'Referer': this.baseURL }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      this.cookieExpiry = new Date(Date.now() + this.cookieTTL);
      console.log('✅ Cookies refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Cookie refresh failed:', error.message);
      return false;
    }
  }

  async fetchOptionChain(symbol, retryCount = 0) {
    const now = new Date();
    if (now >= this.cookieExpiry) {
      await this.refreshCookies();
    }

    try {
      const url = `/api/option-chain-indices?symbol=${symbol}`;
      const response = await this.client.get(url, {
        headers: { 'Referer': `${this.baseURL}/option-chain` }
      });

      if (response.status === 200) {
        console.log(`✅ Fetched ${symbol} chain successfully`);
        return this.parseOptionChain(response.data, symbol);
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if ((error.response?.status === 401 || error.response?.status === 403) && retryCount === 0) {
        console.log(`⚠️  Session expired for ${symbol}, retrying...`);
        this.cookieExpiry = new Date(0);
        return this.fetchOptionChain(symbol, 1);
      }

      console.error(`❌ Error fetching ${symbol}:`, error.message);
      throw error;
    }
  }

  parseOptionChain(data, symbol) {
    const { records } = data;

    if (!records || !records.data || records.data.length === 0) {
      throw new Error('Empty option chain');
    }

    const price = records.underlyingValue;
    const expiryDates = records.expiryDates || [];

    if (!price || price <= 0 || expiryDates.length === 0) {
      throw new Error('Invalid chain data');
    }

    const nearestExpiry = expiryDates[0];
    const rows = records.data.filter(row => row.expiryDate === nearestExpiry);

    // Return detailed strike-by-strike data for enhanced services
    // Include underlying price info for Greeks calculation
    const enhancedRows = rows.map(row => ({
      strikePrice: row.strikePrice,
      underlyingValue: price,
      expiryDate: nearestExpiry,
      CE: {
        strikePrice: row.strikePrice,
        expiryDate: nearestExpiry,
        bidPrice: row.CE?.bidprice || 0,
        askPrice: row.CE?.askprice || 0,
        lastPrice: row.CE?.lastPrice || 0,
        bidQty: row.CE?.bidQty || 0,
        askQty: row.CE?.askQty || 0,
        impliedVolatility: row.CE?.impliedVolatility || 0,
        openInterest: row.CE?.openInterest || 0,
        totalTradedVolume: row.CE?.totalTradedVolume || 0,
        change: row.CE?.change || 0,
        changePercent: row.CE?.pChange || 0
      },
      PE: {
        strikePrice: row.strikePrice,
        expiryDate: nearestExpiry,
        bidPrice: row.PE?.bidprice || 0,
        askPrice: row.PE?.askprice || 0,
        lastPrice: row.PE?.lastPrice || 0,
        bidQty: row.PE?.bidQty || 0,
        askQty: row.PE?.askQty || 0,
        impliedVolatility: row.PE?.impliedVolatility || 0,
        openInterest: row.PE?.openInterest || 0,
        totalTradedVolume: row.PE?.totalTradedVolume || 0,
        change: row.PE?.change || 0,
        changePercent: row.PE?.pChange || 0
      }
    }));

    return enhancedRows;
  }

  computeMaxPain(rows) {
    const strikes = [...new Set(rows.map(r => r.strikePrice).filter(Boolean))].sort((a, b) => a - b);
    if (strikes.length === 0) return 0;

    let minPain = Infinity;
    let best = strikes[Math.floor(strikes.length / 2)];

    strikes.forEach(target => {
      let pain = 0;
      rows.forEach(row => {
        const s = row.strikePrice;
        if (!s) return;
        if (target > s) pain += (target - s) * (row.CE?.openInterest || 0);
        if (target < s) pain += (s - target) * (row.PE?.openInterest || 0);
      });
      if (pain < minPain) {
        minPain = pain;
        best = target;
      }
    });

    return best;
  }

  daysToExpiry(dateStr) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const [month, day, year] = dateStr.split('-');
    const expiryDate = new Date(`${year}-${month}-${day}`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diff = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  mockData(symbol) {
    const base = symbol === 'BANKNIFTY' ? 48500 : 22300;
    const price = Math.round(base + (Math.random() - 0.5) * 600);
    const expiryDate = '29-May-2026';

    // Return array of strike data in the format that enhanceOptionChain expects
    const strikes = [];
    for (let offset = -5; offset <= 5; offset++) {
      const strikePrice = Math.round((base + offset * 100) / 100) * 100;
      const callOI = 1e6 + Math.random() * 5e6;
      const putOI = 1e6 + Math.random() * 5e6;
      const callIV = 15 + Math.random() * 8;
      const putIV = 15 + Math.random() * 8;

      strikes.push({
        strikePrice,
        underlyingValue: price,
        expiryDate,
        symbol,
        CE: {
          strikePrice,
          expiryDate,
          bidPrice: price * 0.01 * (Math.random() + 0.5),
          askPrice: price * 0.01 * (Math.random() + 0.7),
          lastPrice: price * 0.01 * (Math.random() + 0.6),
          bidQty: 100,
          askQty: 100,
          impliedVolatility: callIV,
          openInterest: callOI,
          totalTradedVolume: Math.round(callOI * 0.1),
          change: Math.random() * 10 - 5,
          pChange: Math.random() * 10 - 5
        },
        PE: {
          strikePrice,
          expiryDate,
          bidPrice: price * 0.01 * (Math.random() + 0.5),
          askPrice: price * 0.01 * (Math.random() + 0.7),
          lastPrice: price * 0.01 * (Math.random() + 0.6),
          bidQty: 100,
          askQty: 100,
          impliedVolatility: putIV,
          openInterest: putOI,
          totalTradedVolume: Math.round(putOI * 0.1),
          change: Math.random() * 10 - 5,
          pChange: Math.random() * 10 - 5
        }
      });
    }

    return strikes;
  }
}

export default new NSEService();
