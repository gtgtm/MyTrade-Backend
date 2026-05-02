// E2E API Tests - Critical user flows
// Using Node.js testing with built-in assertions

import assert from 'assert';
import fetch from 'node-fetch';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TIMEOUT = 30000;

class APITestSuite {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  async get(path) {
    const response = await fetch(`${BASE_URL}${path}`);
    assert.strictEqual(response.ok, true, `GET ${path} returned ${response.status}`);
    return response.json();
  }

  async post(path, body) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.strictEqual(response.ok, true, `POST ${path} returned ${response.status}`);
    return response.json();
  }

  report() {
    console.log('\n📊 Test Results:');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Total: ${this.results.passed + this.results.failed}`);
    return this.results.failed === 0;
  }
}

// Run tests
async function runTests() {
  const suite = new APITestSuite();

  console.log('🧪 Running E2E API Tests...\n');

  // 1. Signal Generation Flow
  await suite.test('Health check endpoint', async () => {
    const data = await suite.get('/api/health');
    assert.strictEqual(data.status, 'ok');
  });

  await suite.test('Fetch crypto signal', async () => {
    const data = await suite.get('/api/crypto/signals/BTCUSDT');
    assert(data.data);
    assert(data.data.symbol === 'BTCUSDT');
    assert(['BUY CALL', 'BUY PUT', 'NO TRADE'].includes(data.data.signalType));
  });

  await suite.test('Fetch all crypto signals', async () => {
    const data = await suite.get('/api/crypto/signals');
    assert(Array.isArray(data.data));
    assert(data.data.length > 0);
  });

  // 2. Backtesting Flow
  await suite.test('Run walk-forward backtest', async () => {
    const data = await suite.post('/api/backtest/walk-forward/BTCUSDT', {});
    assert(data.status === 'ACCEPTED' || data.status === 'REVIEW_REQUIRED');
    assert(typeof data.confidence === 'number');
    assert(data.confidence >= 0 && data.confidence <= 100);
  });

  await suite.test('Check backtest status', async () => {
    const data = await suite.get('/api/backtest/status');
    assert.strictEqual(data.status, 'ready');
  });

  // 3. Exit Tracking Flow
  await suite.test('Fetch accuracy dashboard', async () => {
    const data = await suite.get('/api/accuracy/dashboard');
    assert(data.summary);
    assert(typeof data.summary.winRate === 'string');
    assert(typeof data.summary.profitFactor === 'number');
  });

  await suite.test('Fetch accuracy metrics', async () => {
    const data = await suite.get('/api/accuracy/metrics');
    assert(data.totalTrades >= 0);
  });

  await suite.test('Fetch recent trade exits', async () => {
    const data = await suite.get('/api/accuracy/recent-exits/BTCUSDT?limit=10');
    assert(Array.isArray(data.exits));
  });

  // 4. Divergence Detection Flow
  await suite.test('Set baseline metrics', async () => {
    const data = await suite.post('/api/divergence/set-baseline', {
      backtestMetrics: {
        avgWinRate: 68.5,
        avgProfitFactor: 2.8,
        avgTargetHitRate: 72.0,
        confidence: 92
      }
    });
    assert.strictEqual(data.status, 'baseline_set');
  });

  await suite.test('Check divergence', async () => {
    const data = await suite.get('/api/divergence/check');
    assert(data.overallStatus);
    assert(['HEALTHY', 'CAUTION', 'WARNING', 'CRITICAL', 'DIVERGED'].includes(data.overallStatus));
  });

  await suite.test('Get divergence report', async () => {
    const data = await suite.get('/api/divergence/report');
    assert(data.analysisTime);
    assert(data.severity);
  });

  // 5. Incident Management Flow
  await suite.test('Get open incidents', async () => {
    const data = await suite.get('/api/incidents/open');
    assert(typeof data.count === 'number');
    assert(Array.isArray(data.incidents));
  });

  await suite.test('Get incident stats', async () => {
    const data = await suite.get('/api/incidents/stats');
    assert(typeof data.total === 'number');
    assert(typeof data.resolved === 'number');
    assert(typeof data.escalated === 'number');
    assert(typeof data.autoRecovered === 'number');
  });

  await suite.test('Create test incident', async () => {
    const data = await suite.post('/api/incidents/test', {
      type: 'NETWORK_FAILURE',
      severity: 'WARNING'
    });
    assert(data.incident);
    assert(data.incident.id);
  });

  // 6. Real-time (Week 5) Flow
  await suite.test('Get real-time stats', async () => {
    const data = await suite.get('/api/realtime/stats');
    assert(typeof data.connectedClients === 'number');
    assert(typeof data.subscriptions === 'number');
  });

  await suite.test('Register push device', async () => {
    const data = await suite.post('/api/push/register', {
      userId: 'test-user-123',
      deviceToken: 'test-device-token-xyz',
      platform: 'ios'
    });
    assert.strictEqual(data.status, 'registered');
  });

  await suite.test('Get push stats', async () => {
    const data = await suite.get('/api/push/stats');
    assert(typeof data.registeredUsers === 'number');
    assert(typeof data.totalDevices === 'number');
  });

  await suite.test('Get notification history', async () => {
    const data = await suite.get('/api/push/history?limit=10');
    assert(Array.isArray(data.notifications));
  });

  // Print results
  const success = suite.report();
  process.exit(success ? 0 : 1);
}

// Run with timeout
setTimeout(() => {
  console.error('❌ Tests timed out');
  process.exit(1);
}, TIMEOUT);

runTests().catch(err => {
  console.error('❌ Test suite error:', err);
  process.exit(1);
});
