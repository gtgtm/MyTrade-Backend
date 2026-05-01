#!/usr/bin/env node

/**
 * Phase 4 Endpoint Test
 * Tests all Phase 4 endpoints (Export, Analytics, Backtesting, ML, Preferences)
 */

const BASE_URL = 'http://192.168.1.21:3000/api';

const tests = [
  // Sprint 1: Export & Reporting
  { name: 'Export PCR History (CSV)', method: 'GET', path: '/export/pcr/NIFTY?days=7&format=csv', description: 'Export PCR data as CSV' },
  { name: 'Export Max Pain (JSON)', method: 'GET', path: '/export/max-pain/NIFTY?days=7&format=json', description: 'Export Max Pain as JSON' },
  { name: 'Export Full Analysis', method: 'GET', path: '/export/full/NIFTY?days=30', description: 'Export comprehensive data' },
  { name: 'Daily Report', method: 'GET', path: '/reports/daily/NIFTY', description: 'Get daily market report' },
  { name: 'Weekly Report', method: 'GET', path: '/reports/weekly/NIFTY', description: 'Get weekly market report' },
  { name: 'Monthly Report', method: 'GET', path: '/reports/monthly/NIFTY', description: 'Get monthly market report' },
  { name: 'Market Report', method: 'GET', path: '/reports/market?symbols=NIFTY,BANKNIFTY,SENSEX&days=7', description: 'Compare all indices' },

  // Sprint 2: Analytics
  { name: 'Technical Analysis', method: 'GET', path: '/analytics/technical/NIFTY?days=30', description: 'Get MA, RSI, MACD, Bollinger' },
  { name: 'Volatility Analysis', method: 'GET', path: '/analytics/volatility/NIFTY?days=30', description: 'Get IV analysis' },
  { name: 'Correlation Matrix', method: 'GET', path: '/analytics/correlation?symbols=NIFTY,BANKNIFTY,SENSEX&days=30', description: 'Compare symbol correlations' },
  { name: 'Trend Strength', method: 'GET', path: '/analytics/trend/NIFTY?days=20', description: 'Trend strength score' },
  { name: 'Support/Resistance', method: 'GET', path: '/analytics/support-resistance/NIFTY?days=30', description: 'S/R levels' },

  // Sprint 3: Backtesting
  { name: 'List Backtests', method: 'GET', path: '/backtest/list', description: 'List all backtest runs' },
  { name: 'Backtest Results', method: 'GET', path: '/backtest/list?symbol=NIFTY&limit=5', description: 'Get NIFTY backtests' },
  { name: 'Signal Accuracy', method: 'GET', path: '/backtest/signal-accuracy/NIFTY', description: 'Signal accuracy by type' },

  // Sprint 4: ML
  { name: 'Detect Patterns', method: 'GET', path: '/ml/patterns/NIFTY?days=30', description: 'Find PCR patterns' },
  { name: 'Predict Next Value', method: 'GET', path: '/ml/predict/NIFTY?days=30', description: 'Predict next PCR' },
  { name: 'Detect Anomalies', method: 'GET', path: '/ml/anomalies?days=7&threshold=2.5', description: 'Find anomalies' },
  { name: 'Signal Accuracy (ML)', method: 'GET', path: '/ml/signal-accuracy/NIFTY?days=30', description: 'Historical accuracy' },
  { name: 'Trend Reversal', method: 'GET', path: '/ml/trend-reversal/NIFTY?days=20', description: 'Reversal probability' },

  // Sprint 4: Preferences
  { name: 'Get All Preferences', method: 'GET', path: '/preferences', description: 'Get all settings' },
  { name: 'Get Defaults', method: 'GET', path: '/preferences/defaults', description: 'Get default preferences' },
  { name: 'Get Trading Config', method: 'GET', path: '/preferences/config/trading', description: 'Get trading settings' }
];

async function testEndpoint(test) {
  const url = BASE_URL + test.path;

  try {
    const response = await fetch(url, {
      method: test.method,
      headers: { 'Content-Type': 'application/json' }
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('text/csv')) {
      data = { csv: 'CSV data returned' };
    } else {
      data = await response.json();
    }

    const success = response.ok && (data.success !== false || contentType?.includes('text/csv'));

    console.log(`${success ? '✅' : '❌'} ${test.name}`);

    if (!success && data.error) {
      console.log(`   Error: ${data.error}`);
    }

    if (data.data) {
      if (typeof data.data === 'object' && !Array.isArray(data.data)) {
        const keys = Object.keys(data.data);
        if (keys.length > 0) {
          console.log(`   📊 Response fields: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
        }
      } else if (Array.isArray(data.data)) {
        console.log(`   📊 Records: ${data.data.length}`);
      } else if (typeof data.data === 'string') {
        console.log(`   📊 CSV/Text data received`);
      }
    }

    return success;
  } catch (error) {
    console.log(`❌ ${test.name}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n🚀 Phase 4 Endpoint Test Suite\n');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Total Tests: ${tests.length}`);
  console.log('═'.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Sprint 1
  console.log('📌 SPRINT 1: Export & Reporting\n');
  for (let i = 0; i < 7; i++) {
    const result = await testEndpoint(tests[i]);
    result ? passed++ : failed++;
  }

  // Sprint 2
  console.log('\n📌 SPRINT 2: Analytics\n');
  for (let i = 7; i < 12; i++) {
    const result = await testEndpoint(tests[i]);
    result ? passed++ : failed++;
  }

  // Sprint 3
  console.log('\n📌 SPRINT 3: Backtesting\n');
  for (let i = 12; i < 15; i++) {
    const result = await testEndpoint(tests[i]);
    result ? passed++ : failed++;
  }

  // Sprint 4
  console.log('\n📌 SPRINT 4: ML & Preferences\n');
  for (let i = 15; i < tests.length; i++) {
    const result = await testEndpoint(tests[i]);
    result ? passed++ : failed++;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${tests.length}`);
  console.log(`🎯 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!\n');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Please check the errors above.\n`);
  }
}

runTests().catch(console.error);
