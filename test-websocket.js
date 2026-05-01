#!/usr/bin/env node

/**
 * WebSocket Real-Time Testing Script
 * Tests enhanced data streaming to connected clients
 *
 * Usage: node test-websocket.js
 */

import io from 'socket.io-client';
import chalk from 'chalk';

const SERVER_URL = 'http://192.168.1.21:3000';
const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
const TEST_DURATION = 30000; // 30 seconds

let socket;
let updateCount = 0;
let startTime;
let lastUpdate = {};

const colors = {
  nifty: '\x1b[34m',      // Blue
  banknifty: '\x1b[33m',  // Yellow
  sensex: '\x1b[36m',     // Cyan
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

function header(text) {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${text}`);
  console.log('═'.repeat(80) + '\n');
}

function formatPrice(price) {
  return `₹${price.toFixed(2)}`;
}

function formatPercent(value) {
  if (!value) return 'N/A';
  const symbol = value > 0 ? '↑' : '↓';
  const color = value > 0 ? '\x1b[32m' : '\x1b[31m'; // Green for up, red for down
  return `${color}${symbol} ${Math.abs(value).toFixed(2)}%${colors.reset}`;
}

function displayGreeks(symbol, greeks) {
  if (!greeks) return '';

  const call = greeks.call;
  return `  Δ: ${call.delta.toFixed(3)} | Γ: ${call.gamma.toFixed(4)} | Θ: ${call.theta.toFixed(3)} | Ν: ${call.vega.toFixed(3)} | IV: ${call.iv.toFixed(2)}%`;
}

function displayMaxPain(symbol, maxPain) {
  if (!maxPain) return '';

  const arrow = maxPain.direction === 'up' ? '⬆' : '⬇';
  return `  Level: ${formatPrice(maxPain.level)} | Distance: ${maxPain.distance.toFixed(0)} pts ${arrow} | Move: ${maxPain.percentageMove}%`;
}

function displayPCR(symbol, pcr) {
  if (!pcr) return '';

  const color = pcr.sentiment.includes('Bearish') ? '\x1b[31m' :
                pcr.sentiment.includes('Bullish') ? '\x1b[32m' : '\x1b[33m';

  return `  Ratio: ${pcr.ratio.toFixed(2)} | Signal: ${color}${pcr.sentiment}${colors.reset} | Confidence: ${(pcr.confidence * 100).toFixed(0)}% | Change: ${formatPercent(pcr.change)}`;
}

function displayAlerts(symbol, alerts) {
  if (!alerts || alerts.totalAlerts === 0) return '';

  const critical = alerts.critical.length;
  const warnings = alerts.warnings.length;

  let summary = '  🚨 ';
  if (critical > 0) summary += `Critical: ${critical} | `;
  if (warnings > 0) summary += `Warnings: ${warnings}`;
  if (critical === 0 && warnings === 0) summary = '  ✓ No critical alerts';

  return summary;
}

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    socket = io(SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      log(`✅ Connected to ${SERVER_URL}`, 'reset');
      resolve();
    });

    socket.on('connect_error', (error) => {
      log(`❌ Connection error: ${error.message}`, 'reset');
      reject(error);
    });

    socket.on('error', (error) => {
      log(`❌ WebSocket error: ${error}`, 'reset');
    });

    socket.on('disconnect', () => {
      log(`⚠️  Disconnected from server`, 'reset');
    });
  });
}

function setupListeners() {
  // Listen for connection confirmation
  socket.on('connected', (data) => {
    header('CONNECTION CONFIRMED');
    console.log(`Client ID: ${data.clientId}`);
    console.log(`Version: ${data.version}`);
    console.log(`Features: ${Object.keys(data.features).join(', ')}`);
    console.log(`Update Frequency: ${data.updateFrequency.clientBroadcast}`);
  });

  // Listen for subscription confirmation
  socket.on('subscribed', (data) => {
    log(`✅ Subscribed to: ${data.symbols.join(', ')}`, 'reset');
  });

  // Main real-time data listener
  socket.on('enhanced_prices', (payload) => {
    updateCount++;
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    if (updateCount === 1) {
      header('REAL-TIME DATA STREAMING');
    }

    // Display only every 5th update to avoid spam (since we broadcast every second)
    if (updateCount % 5 !== 0) return;

    console.log(`\n📊 Update #${updateCount} [${elapsedSeconds.toFixed(1)}s elapsed]`);

    // Display data for each symbol
    SYMBOLS.forEach(symbol => {
      const price = payload.prices[symbol];
      const greeks = payload.greeks[symbol];
      const maxPain = payload.maxPain[symbol];
      const pcr = payload.pcr[symbol];
      const alerts = payload.alerts[symbol];

      log(`\n${symbol}`, symbol.toLowerCase());
      log(`  Price: ${formatPrice(price)}`, symbol.toLowerCase());

      if (greeks) {
        log(displayGreeks(symbol, greeks), symbol.toLowerCase());
      }

      if (maxPain) {
        log(displayMaxPain(symbol, maxPain), symbol.toLowerCase());
      }

      if (pcr) {
        log(displayPCR(symbol, pcr), symbol.toLowerCase());
      }

      if (alerts) {
        log(displayAlerts(symbol, alerts), symbol.toLowerCase());
      }
    });

    lastUpdate = payload;
  });

  // Handle stats responses
  socket.on('stats', (stats) => {
    header('SERVER STATISTICS');
    console.log(`Status: ${stats.status}`);
    console.log(`Active Connections: ${stats.activeConnections}`);
    console.log(`Uptime: ${(stats.uptime / 60).toFixed(1)} minutes`);
    console.log(`Last Update: ${stats.timestamp}`);
  });
}

async function runTests() {
  try {
    // Connect to WebSocket
    log('🔌 Connecting to WebSocket server...', 'reset');
    await connectWebSocket();

    // Setup event listeners
    setupListeners();

    // Record start time
    startTime = Date.now();

    // Subscribe to symbols
    log(`📡 Subscribing to symbols: ${SYMBOLS.join(', ')}`, 'reset');
    socket.emit('subscribe', { symbols: SYMBOLS });

    // Request initial stats
    socket.emit('getStats');

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, TEST_DURATION));

    // Display final summary
    header('TEST SUMMARY');
    console.log(`Total Updates Received: ${updateCount}`);
    console.log(`Test Duration: ${(TEST_DURATION / 1000).toFixed(1)} seconds`);
    console.log(`Average Updates/Second: ${(updateCount / (TEST_DURATION / 1000)).toFixed(2)}`);
    console.log(`Last Timestamp: ${lastUpdate.metadata?.timestamp || 'N/A'}`);

    // Display validation results
    header('VALIDATION RESULTS');

    let allGood = true;

    SYMBOLS.forEach(symbol => {
      const price = lastUpdate.prices?.[symbol];
      const greeks = lastUpdate.greeks?.[symbol];
      const maxPain = lastUpdate.maxPain?.[symbol];
      const pcr = lastUpdate.pcr?.[symbol];

      const hasPrice = price && price > 0;
      const hasGreeks = greeks && greeks.call && greeks.call.delta;
      const hasMaxPain = maxPain && maxPain.level > 0;
      const hasPCR = pcr && pcr.ratio > 0;

      const status = (hasPrice && hasGreeks && hasMaxPain && hasPCR) ? '✅' : '❌';

      if (!(hasPrice && hasGreeks && hasMaxPain && hasPCR)) {
        allGood = false;
      }

      console.log(`${status} ${symbol}: Price ${hasPrice ? '✓' : '✗'} | Greeks ${hasGreeks ? '✓' : '✗'} | MaxPain ${hasMaxPain ? '✓' : '✗'} | PCR ${hasPCR ? '✓' : '✗'}`);
    });

    console.log();
    if (allGood) {
      log('✅ All validation tests PASSED!', 'reset');
    } else {
      log('⚠️  Some validation tests FAILED - check data above', 'reset');
    }

    // Disconnect
    socket.disconnect();
    process.exit(allGood ? 0 : 1);

  } catch (error) {
    log(`❌ Test failed: ${error.message}`, 'reset');
    process.exit(1);
  }
}

// Run tests
runTests();
