#!/usr/bin/env node

/**
 * Historical Data Endpoint Test
 * Tests all 9 historical data endpoints to verify capture and retrieval
 */

const BASE_URL = 'http://192.168.1.21:3000/api';

const endpoints = [
  {
    name: 'Get Database Stats',
    method: 'GET',
    path: '/history/stats',
    description: 'Returns record counts for all tables'
  },
  {
    name: 'Get PCR History',
    method: 'GET',
    path: '/history/pcr/NIFTY?days=7',
    description: 'PCR history with trend analysis'
  },
  {
    name: 'Get Max Pain History',
    method: 'GET',
    path: '/history/max-pain/NIFTY?days=7',
    description: 'Max pain evolution with statistics'
  },
  {
    name: 'Get IV History',
    method: 'GET',
    path: '/history/iv/NIFTY?days=7',
    description: 'Implied volatility per strike'
  },
  {
    name: 'Get Alerts History',
    method: 'GET',
    path: '/history/alerts/NIFTY?days=7',
    description: 'Alerts with severity summary'
  },
  {
    name: 'Get Daily Stats',
    method: 'GET',
    path: '/history/daily-stats/NIFTY?days=30',
    description: 'Daily statistical summaries'
  },
  {
    name: 'Get Snapshots',
    method: 'GET',
    path: '/history/snapshots/NIFTY?days=7&type=hourly',
    description: 'Hourly market snapshots'
  },
  {
    name: 'Compare Symbols',
    method: 'GET',
    path: '/history/comparison?symbols=NIFTY,BANKNIFTY,SENSEX&days=7',
    description: 'Compare multiple indices'
  },
  {
    name: 'Get Analysis Report',
    method: 'GET',
    path: '/history/analysis/NIFTY?days=30',
    description: 'Comprehensive analysis report'
  }
];

async function testEndpoint(endpoint) {
  const url = BASE_URL + endpoint.path;

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    const success = response.ok && data.success;

    console.log(`${success ? '✅' : '❌'} ${endpoint.name}`);

    if (success) {
      // Show sample data
      if (data.data) {
        if (data.data.pcrCount) {
          console.log(`   📊 PCR Records: ${data.data.pcrCount}`);
          console.log(`   📊 Max Pain Records: ${data.data.maxPainCount}`);
          console.log(`   📊 IV Records: ${data.data.ivCount}`);
          console.log(`   📊 Alerts: ${data.data.alertsCount}`);
        } else if (data.data.history && Array.isArray(data.data.history)) {
          console.log(`   📈 Records: ${data.data.history.length}`);
          if (data.data.history.length > 0) {
            const first = data.data.history[0];
            if (first.pcr_ratio) console.log(`   📊 Latest PCR: ${first.pcr_ratio.toFixed(2)} (${first.sentiment})`);
            if (first.max_pain_level) console.log(`   📊 Latest Max Pain: ${first.max_pain_level}`);
            if (first.atm_iv) console.log(`   📊 Latest IV: ${first.atm_iv.toFixed(2)}`);
          }
        } else if (data.data.symbol) {
          console.log(`   📊 Symbols: ${typeof data.data === 'object' ? Object.keys(data.data).length : 1}`);
        }
      }
    } else {
      console.log(`   Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`❌ ${endpoint.name}`);
    console.log(`   Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('\n🔍 Testing Historical Data Endpoints\n');
  console.log('═'.repeat(50));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Tests: ${endpoints.length}`);
  console.log('═'.repeat(50) + '\n');

  for (const endpoint of endpoints) {
    console.log(`\n📌 ${endpoint.name}`);
    console.log(`   ${endpoint.description}`);
    console.log(`   ${endpoint.method} ${endpoint.path}`);
    await testEndpoint(endpoint);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Test Suite Complete\n');
}

// Run tests
runTests().catch(console.error);
