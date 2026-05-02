// Load Testing Suite - WebSocket and API stress testing
// Using autocannon for load testing + Socket.io for WebSocket

import http from 'http';
import { io } from 'socket.io-client';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'http://localhost:3000';
const LOAD_TEST_DURATION = parseInt(process.env.LOAD_DURATION) || 60000; // 60 seconds

class LoadTest {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      errors: []
    };
  }

  addLatency(latency) {
    this.results.totalLatency += latency;
    this.results.maxLatency = Math.max(this.results.maxLatency, latency);
    this.results.minLatency = Math.min(this.results.minLatency, latency);
  }

  report() {
    const avgLatency = this.results.totalRequests > 0
      ? this.results.totalLatency / this.results.totalRequests
      : 0;

    console.log(`\n📊 Load Test: ${this.name}`);
    console.log(`   Total Requests: ${this.results.totalRequests}`);
    console.log(`   Successful: ${this.results.successfulRequests} (${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`   Failed: ${this.results.failedRequests}`);
    console.log(`   Avg Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`   Min Latency: ${this.results.minLatency.toFixed(2)}ms`);
    console.log(`   Max Latency: ${this.results.maxLatency.toFixed(2)}ms`);

    if (this.results.errors.length > 0) {
      console.log(`   Errors: ${this.results.errors.slice(0, 3).join(', ')}`);
    }

    return this.results.failedRequests === 0;
  }
}

// Test 1: API Endpoint Load Test
async function testAPILoad() {
  const test = new LoadTest('API Endpoints (GET /api/crypto/signals)', {
    concurrency: 50,
    duration: LOAD_TEST_DURATION
  });

  const startTime = Date.now();
  const tasks = [];

  // Spawn 50 concurrent requests
  for (let i = 0; i < 50; i++) {
    const task = (async () => {
      while (Date.now() - startTime < LOAD_TEST_DURATION) {
        try {
          const requestStart = Date.now();
          const response = await fetch(`${BASE_URL}/api/crypto/signals`);
          const latency = Date.now() - requestStart;

          test.results.totalRequests++;

          if (response.ok) {
            test.results.successfulRequests++;
            test.addLatency(latency);
          } else {
            test.results.failedRequests++;
            test.results.errors.push(`HTTP ${response.status}`);
          }
        } catch (error) {
          test.results.totalRequests++;
          test.results.failedRequests++;
          test.results.errors.push((error as Error).message);
        }

        // Small delay between requests
        await new Promise(r => setTimeout(r, 10));
      }
    })();

    tasks.push(task);
  }

  await Promise.all(tasks);
  return test.report();
}

// Test 2: WebSocket Connection Load Test
async function testWebSocketLoad() {
  const test = new LoadTest('WebSocket Connections (100 concurrent)', {
    concurrency: 100,
    duration: LOAD_TEST_DURATION
  });

  const clients: any[] = [];
  const connectionPromises: Promise<void>[] = [];

  console.log('   Connecting 100 clients...');

  // Connect 100 clients
  for (let i = 0; i < 100; i++) {
    const promise = new Promise<void>((resolve, reject) => {
      const socket = io(WS_URL, {
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionDelayMax: 500
      });

      socket.on('connect', () => {
        test.results.successfulRequests++;
        test.results.totalRequests++;

        // Subscribe to symbols
        socket.emit('subscribe:realtime', {
          symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
          userId: `user-load-test-${i}`
        });

        clients.push(socket);
        resolve();
      });

      socket.on('error', (error: Error) => {
        test.results.failedRequests++;
        test.results.totalRequests++;
        test.results.errors.push(error.message);
        reject(error);
      });

      socket.on('connect_error', (error: Error) => {
        test.results.failedRequests++;
        test.results.errors.push(`Connect error: ${error.message}`);
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!socket.connected) {
          socket.disconnect();
          test.results.failedRequests++;
          test.results.totalRequests++;
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });

    connectionPromises.push(promise);
  }

  // Wait for all connections (with timeout)
  await Promise.allSettled(connectionPromises);

  console.log(`   Connected: ${clients.length}/100`);

  // Keep connections alive and measure message throughput
  const startTime = Date.now();
  let messageCount = 0;

  clients.forEach(socket => {
    socket.on('price:update', () => {
      messageCount++;
      test.addLatency(Date.now() - startTime);
    });

    socket.on('trade:exit', () => {
      messageCount++;
    });

    socket.on('disconnect', () => {
      test.results.failedRequests++;
    });
  });

  // Keep connections open for duration
  await new Promise(r => setTimeout(r, LOAD_TEST_DURATION));

  // Disconnect all
  clients.forEach(socket => socket.disconnect());

  console.log(`   Messages received: ${messageCount}`);
  return test.report();
}

// Test 3: Backtest Load Test
async function testBacktestLoad() {
  const test = new LoadTest('Backtest Endpoint (10 concurrent)', {
    concurrency: 10,
    duration: LOAD_TEST_DURATION
  });

  const startTime = Date.now();
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

  // Queue backtest requests
  for (let batch = 0; batch < 5; batch++) {
    for (const symbol of symbols) {
      try {
        const requestStart = Date.now();
        const response = await fetch(`${BASE_URL}/api/backtest/walk-forward/${symbol}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        const latency = Date.now() - requestStart;
        test.results.totalRequests++;

        if (response.ok) {
          test.results.successfulRequests++;
          test.addLatency(latency);
        } else {
          test.results.failedRequests++;
          test.results.errors.push(`HTTP ${response.status}`);
        }
      } catch (error) {
        test.results.totalRequests++;
        test.results.failedRequests++;
        test.results.errors.push((error as Error).message);
      }
    }

    // Prevent overwhelming backend
    await new Promise(r => setTimeout(r, 5000));

    if (Date.now() - startTime > LOAD_TEST_DURATION) break;
  }

  return test.report();
}

// Test 4: Push Notification Load Test
async function testPushNotificationLoad() {
  const test = new LoadTest('Push Notifications (Device Registration)', {
    concurrency: 50,
    duration: LOAD_TEST_DURATION
  });

  const startTime = Date.now();
  let deviceCount = 0;

  // Register 50 devices concurrently
  for (let i = 0; i < 50; i++) {
    try {
      const requestStart = Date.now();
      const response = await fetch(`${BASE_URL}/api/push/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `load-test-user-${i}`,
          deviceToken: `device-token-${i}-${Date.now()}`,
          platform: i % 2 === 0 ? 'ios' : 'android'
        })
      });

      const latency = Date.now() - requestStart;
      test.results.totalRequests++;
      deviceCount++;

      if (response.ok) {
        test.results.successfulRequests++;
        test.addLatency(latency);
      } else {
        test.results.failedRequests++;
      }
    } catch (error) {
      test.results.totalRequests++;
      test.results.failedRequests++;
      test.results.errors.push((error as Error).message);
    }

    // Spread out registrations
    if (i % 10 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`   Devices registered: ${deviceCount}`);
  return test.report();
}

// Test 5: Concurrent Mixed Load
async function testMixedLoad() {
  const test = new LoadTest('Mixed Concurrent Load (100 total)', {
    concurrency: 100,
    duration: LOAD_TEST_DURATION
  });

  const startTime = Date.now();
  const workloads = [
    // 30% - API endpoint calls
    async () => {
      while (Date.now() - startTime < LOAD_TEST_DURATION) {
        try {
          const start = Date.now();
          const response = await fetch(`${BASE_URL}/api/crypto/signals`);
          test.results.totalRequests++;

          if (response.ok) {
            test.results.successfulRequests++;
            test.addLatency(Date.now() - start);
          } else {
            test.results.failedRequests++;
          }
        } catch (error) {
          test.results.failedRequests++;
        }

        await new Promise(r => setTimeout(r, 100));
      }
    },

    // 30% - Backtest calls
    async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      while (Date.now() - startTime < LOAD_TEST_DURATION) {
        try {
          const symbol = symbols[Math.floor(Math.random() * symbols.length)];
          const start = Date.now();
          const response = await fetch(`${BASE_URL}/api/divergence/check`);
          test.results.totalRequests++;

          if (response.ok) {
            test.results.successfulRequests++;
            test.addLatency(Date.now() - start);
          } else {
            test.results.failedRequests++;
          }
        } catch (error) {
          test.results.failedRequests++;
        }

        await new Promise(r => setTimeout(r, 200));
      }
    },

    // 40% - WebSocket subscriptions
    async () => {
      const socket = io(WS_URL);

      socket.on('connect', () => {
        test.results.successfulRequests++;
        socket.emit('subscribe:realtime', {
          symbols: ['BTCUSDT'],
          userId: 'mixed-load-test'
        });
      });

      socket.on('price:update', () => {
        test.results.totalRequests++;
      });

      socket.on('error', () => {
        test.results.failedRequests++;
      });

      await new Promise(r => setTimeout(r, LOAD_TEST_DURATION));
      socket.disconnect();
    }
  ];

  // Spawn mixed workloads
  const tasks = [];
  for (let i = 0; i < 30; i++) tasks.push(workloads[0]());
  for (let i = 0; i < 30; i++) tasks.push(workloads[1]());
  for (let i = 0; i < 40; i++) tasks.push(workloads[2]());

  await Promise.allSettled(tasks);

  return test.report();
}

// Run all tests
async function runLoadTests() {
  console.log('🚀 Starting Load Tests...\n');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Duration: ${LOAD_TEST_DURATION}ms\n`);

  const results: boolean[] = [];

  try {
    results.push(await testAPILoad());
    results.push(await testWebSocketLoad());
    results.push(await testBacktestLoad());
    results.push(await testPushNotificationLoad());
    results.push(await testMixedLoad());
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }

  const allPassed = results.every(r => r);

  console.log(`\n${'='.repeat(50)}`);
  if (allPassed) {
    console.log('✅ All load tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some load tests failed');
    process.exit(1);
  }
}

runLoadTests();
