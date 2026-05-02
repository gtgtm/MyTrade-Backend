#!/usr/bin/env node

// Start Paper Trading - Initialize Week 7 validation
// Runs for 7 days, collects metrics, validates divergence detection

import PaperTradingManager from '../services/paperTradingManager.js';
import DivergenceValidator from '../services/divergenceValidator.js';
import { PaperTradingMonitor } from '../config/paperTradingMonitor.js';

const BASELINE_METRICS = {
  avgWinRate: 68.5,
  avgProfitFactor: 2.8,
  avgTargetHitRate: 72.0,
  confidence: 92
};

const MONITORING_DURATION_DAYS = 7;

async function startPaperTrading() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 WEEK 7: PAPER TRADING VALIDATION');
  console.log('='.repeat(70));

  const startTime = new Date();
  console.log(`\n⏰ Start Time: ${startTime.toLocaleString()}`);
  console.log(`📅 Duration: ${MONITORING_DURATION_DAYS} days`);
  console.log(`🎯 Baseline Metrics:`);
  console.log(`   - Win Rate: ${BASELINE_METRICS.avgWinRate}%`);
  console.log(`   - Profit Factor: ${BASELINE_METRICS.avgProfitFactor}`);
  console.log(`   - Target Hit Rate: ${BASELINE_METRICS.avgTargetHitRate}%`);
  console.log(`   - Confidence: ${BASELINE_METRICS.confidence}%`);

  // Initialize services
  const paperTrading = new PaperTradingManager();
  const divergenceValidator = new DivergenceValidator(BASELINE_METRICS);
  const monitor = new PaperTradingMonitor(paperTrading, divergenceValidator);

  // Set up event listeners
  setupEventListeners(paperTrading, divergenceValidator);

  console.log('\n📋 READINESS CHECKLIST');
  console.log('✅ Paper Trading Manager initialized');
  console.log('✅ Divergence Validator initialized');
  console.log('✅ Monitoring scheduler configured');
  console.log('✅ Event listeners attached');

  console.log('\n🎬 STARTING MONITORING...\n');

  // Start 1-week monitoring
  monitor.startMonitoring(MONITORING_DURATION_DAYS);

  // Display initial status
  displayInitialStatus(paperTrading, divergenceValidator);

  // Print monitoring schedule
  printMonitoringSchedule(startTime, MONITORING_DURATION_DAYS);

  // Keep process running
  console.log('\n✅ Paper Trading is now running');
  console.log('📊 Monitor dashboard at: http://localhost:3000/paper-trading-dashboard');
  console.log('⏸️  Press Ctrl+C to stop monitoring\n');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Shutting down paper trading...');
    monitor.stopMonitoring();
    process.exit(0);
  });

  return { paperTrading, divergenceValidator, monitor };
}

function setupEventListeners(paperTrading, divergenceValidator) {
  // Paper trading events
  paperTrading.on('shadow:trade:open', (trade) => {
    console.log(`📊 Trade opened: ${trade.symbol} @ ${trade.entryPrice.toFixed(2)}`);
  });

  paperTrading.on('shadow:trade:closed', (trade) => {
    const icon = trade.result === 'WIN' ? '✅' : '❌';
    console.log(`${icon} Trade closed: ${trade.symbol} ${trade.result} (${trade.pnlPercent.toFixed(2)}%)`);
  });

  paperTrading.on('paper:divergence:event', (event) => {
    console.log(`🔍 Divergence event: ${event.severity} (${event.symbol || 'SYSTEM'})`);
  });

  paperTrading.on('paper:error', (error) => {
    console.error(`❌ Error: ${error.error}`);
  });

  paperTrading.on('paper:recovery', (recovery) => {
    console.log(`🔄 Recovery: ${recovery.recovery}`);
  });

  // Divergence validator events
  divergenceValidator.on('divergence:falsePositive', (event) => {
    console.log(`⚠️  False positive divergence detected`);
  });

  divergenceValidator.on('divergence:latency', (event) => {
    console.log(`⚡ Detection latency: ${event.latencyMs}ms (P95: ${event.p95Latency}ms)`);
  });

  divergenceValidator.on('divergence:recovery', (event) => {
    console.log(`🔄 Divergence recovered after ${event.durationMs}ms`);
  });
}

function displayInitialStatus(paperTrading, divergenceValidator) {
  const status = paperTrading.getStatus();
  const divergenceMetrics = divergenceValidator.getAccuracyMetrics();

  console.log('\n' + '='.repeat(70));
  console.log('📊 INITIAL SYSTEM STATUS');
  console.log('='.repeat(70));

  console.log('\n💰 Trading Metrics');
  console.log(`   Signals Generated: ${status.metrics.signalsGenerated}`);
  console.log(`   Win Rate: ${status.metrics.winRate.toFixed(1)}%`);
  console.log(`   Profit Factor: ${status.metrics.profitFactor.toFixed(2)}`);
  console.log(`   Total P&L: ${status.metrics.totalPnl.toFixed(2)}`);

  console.log('\n💪 System Health');
  console.log(`   Uptime: ${(status.uptime / 1000 / 60).toFixed(0)} minutes`);
  console.log(`   Errors: ${status.systemHealth.errorCount}`);
  console.log(`   Recoveries: ${status.systemHealth.recoveryCount}`);

  console.log('\n🔍 Divergence Detection');
  console.log(`   Accuracy: ${divergenceMetrics.accuracy}`);
  console.log(`   Precision: ${divergenceMetrics.precision}`);
  console.log(`   Recall: ${divergenceMetrics.recall}`);
  console.log(`   F1-Score: ${divergenceMetrics.f1Score}`);

  console.log('\n' + '='.repeat(70));
}

function printMonitoringSchedule(startTime, durationDays) {
  const endTime = new Date(startTime.getTime() + durationDays * 24 * 60 * 60 * 1000);

  console.log('\n📅 MONITORING SCHEDULE');
  console.log('='.repeat(70));

  console.log('\n🔄 Continuous Tasks');
  console.log('   • WebSocket price updates');
  console.log('   • Real-time trade tracking');
  console.log('   • Live market monitoring');

  console.log('\n⏱️  Periodic Tasks');
  console.log('   • Every 60 sec: Collect metrics snapshot');
  console.log('   • Every 10 min: Check divergence detection');
  console.log('   • Every 30 sec: Check alert thresholds');
  console.log('   • Every 1 hour: Generate hourly report');

  console.log('\n📋 Expected Milestones');
  const day1 = new Date(startTime.getTime() + 1 * 24 * 60 * 60 * 1000);
  const day3 = new Date(startTime.getTime() + 3 * 24 * 60 * 60 * 1000);
  const day7 = endTime;

  console.log(`   Day 1 (${day1.toLocaleDateString()}): 50-100 signals collected`);
  console.log(`   Day 3 (${day3.toLocaleDateString()}): 150-200 signals, mid-week assessment`);
  console.log(`   Day 7 (${day7.toLocaleDateString()}): Final validation & GO/NO-GO decision`);

  console.log('\n✅ Success Criteria (all must pass)');
  console.log('   1. Signal Quality: Win rate >60%, Profit factor >1.5');
  console.log('   2. Divergence Detection: Accuracy >95%, Precision >90%');
  console.log('   3. System Stability: Error rate <1%, 10+ hour uptime');
  console.log('   4. Performance: Drawdown <15%, Sharpe ratio >0.5');

  console.log('\n' + '='.repeat(70));
}

// Run paper trading
startPaperTrading().catch((error) => {
  console.error('❌ Failed to start paper trading:', error);
  process.exit(1);
});
