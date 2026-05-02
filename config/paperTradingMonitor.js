// Paper Trading Monitor Configuration
// 1-week continuous monitoring schedule and alerts

export class PaperTradingMonitor {
  constructor(paperTradingManager, divergenceValidator) {
    this.paperTradingManager = paperTradingManager;
    this.divergenceValidator = divergenceValidator;
    this.monitoringActive = false;
    this.metricsSnapshots = [];
    this.hourlyReports = [];
    this.alertLog = [];
    this.startTime = null;
    this.endTime = null;
  }

  // Start 1-week monitoring
  startMonitoring(durationDays = 7) {
    if (this.monitoringActive) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    this.monitoringActive = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + durationDays * 24 * 60 * 60 * 1000;

    console.log(`🚀 Paper Trading Monitoring Started`);
    console.log(`Duration: ${durationDays} days`);
    console.log(`End time: ${new Date(this.endTime)}`);

    // Schedule monitoring tasks
    this.scheduleMetricsCollection();
    this.scheduleDivergenceCheck();
    this.scheduleHourlyReports();
    this.scheduleAlertChecks();
    this.scheduleFinalReport();
  }

  // Collect metrics every 60 seconds
  scheduleMetricsCollection() {
    const interval = setInterval(() => {
      if (!this.monitoringActive || Date.now() > this.endTime) {
        clearInterval(interval);
        return;
      }

      const status = this.paperTradingManager.getStatus();
      this.metricsSnapshots.push({
        timestamp: Date.now(),
        ...status.metrics
      });

      // Keep only last 10,000 snapshots (~7 days at 60s intervals)
      if (this.metricsSnapshots.length > 10000) {
        this.metricsSnapshots.shift();
      }

      // Log every 10 minutes
      if (this.metricsSnapshots.length % 10 === 0) {
        console.log(`✓ Metrics collected: ${this.metricsSnapshots.length} snapshots`);
      }
    }, 60000); // 60 seconds
  }

  // Check divergence every 10 minutes
  scheduleDivergenceCheck() {
    const interval = setInterval(() => {
      if (!this.monitoringActive || Date.now() > this.endTime) {
        clearInterval(interval);
        return;
      }

      const status = this.paperTradingManager.getStatus();
      const metrics = status.metrics;

      // Check divergence
      const isDiverged =
        metrics.winRate < 60 ||
        metrics.profitFactor < 1.5 ||
        metrics.maxDrawdown > 15;

      if (isDiverged) {
        const alert = {
          timestamp: Date.now(),
          type: 'DIVERGENCE_DETECTED',
          severity: this.calculateDivergenceSeverity(metrics),
          metrics
        };

        this.alertLog.push(alert);
        this.logAlert(alert);
      }
    }, 600000); // 10 minutes
  }

  // Generate hourly reports
  scheduleHourlyReports() {
    const interval = setInterval(() => {
      if (!this.monitoringActive || Date.now() > this.endTime) {
        clearInterval(interval);
        return;
      }

      const report = this.generateHourlyReport();
      this.hourlyReports.push(report);

      console.log(`\n📊 Hourly Report - ${new Date(report.timestamp).toLocaleString()}`);
      console.log(`   Win Rate: ${report.metrics.winRate.toFixed(1)}%`);
      console.log(`   Profit Factor: ${report.metrics.profitFactor.toFixed(2)}`);
      console.log(`   Open Trades: ${report.openTrades}`);
      console.log(`   Total P&L: ${report.metrics.totalPnl.toFixed(2)}`);
      console.log(`   Uptime: ${(report.uptime / 3600000).toFixed(1)}h`);
    }, 3600000); // 1 hour
  }

  // Check alert thresholds every 30 seconds
  scheduleAlertChecks() {
    const interval = setInterval(() => {
      if (!this.monitoringActive || Date.now() > this.endTime) {
        clearInterval(interval);
        return;
      }

      this.checkAlertThresholds();
    }, 30000); // 30 seconds
  }

  // Generate final report at end of monitoring
  scheduleFinalReport() {
    const checkInterval = setInterval(() => {
      if (!this.monitoringActive || Date.now() <= this.endTime) {
        return;
      }

      clearInterval(checkInterval);
      this.stopMonitoring();
      this.generateFinalReport();
    }, 60000); // Check every minute
  }

  // Check various alert thresholds
  checkAlertThresholds() {
    const status = this.paperTradingManager.getStatus();
    const metrics = status.metrics;
    const health = status.systemHealth;

    // Win rate drop alert
    if (metrics.winRate < 60 && metrics.signalsGenerated > 20) {
      this.createAlert('WIN_RATE_LOW', 'WARNING', {
        winRate: metrics.winRate,
        threshold: 60
      });
    }

    // Profit factor drop alert
    if (metrics.profitFactor < 1.5 && metrics.lossCount > 5) {
      this.createAlert('PROFIT_FACTOR_LOW', 'WARNING', {
        profitFactor: metrics.profitFactor,
        threshold: 1.5
      });
    }

    // Error rate spike alert
    const errorRate = health.errorCount / (metrics.signalsGenerated || 1);
    if (errorRate > 0.01) {
      this.createAlert('ERROR_RATE_HIGH', 'WARNING', {
        errorRate: (errorRate * 100).toFixed(2) + '%',
        threshold: '1%'
      });
    }

    // Drawdown exceeded alert
    if (metrics.maxDrawdown > 15) {
      this.createAlert('DRAWDOWN_HIGH', 'CRITICAL', {
        drawdown: metrics.maxDrawdown.toFixed(2) + '%',
        threshold: '15%'
      });
    }

    // Divergence accuracy drop alert
    const divergenceMetrics = this.divergenceValidator.getAccuracyMetrics();
    if (parseFloat(divergenceMetrics.accuracy) < 95) {
      this.createAlert('DIVERGENCE_ACCURACY_LOW', 'WARNING', {
        accuracy: divergenceMetrics.accuracy,
        threshold: '95%'
      });
    }
  }

  // Create alert entry
  createAlert(type, severity, details) {
    const existingAlert = this.alertLog.find(
      a =>
        a.type === type &&
        Date.now() - a.timestamp < 3600000 // Don't repeat within 1 hour
    );

    if (!existingAlert) {
      const alert = {
        timestamp: Date.now(),
        type,
        severity,
        details,
        acknowledged: false
      };

      this.alertLog.push(alert);
      this.logAlert(alert);
    }
  }

  // Log alert
  logAlert(alert) {
    const severityEmoji = {
      CRITICAL: '🔴',
      WARNING: '⚠️',
      INFO: 'ℹ️'
    };

    console.log(`${severityEmoji[alert.severity]} [${alert.severity}] ${alert.type}`);
    if (alert.details) {
      Object.entries(alert.details).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    }
  }

  // Calculate divergence severity
  calculateDivergenceSeverity(metrics) {
    let severity = 0;

    if (metrics.winRate < 40) severity += 3; // CRITICAL
    else if (metrics.winRate < 50) severity += 2; // WARNING
    else if (metrics.winRate < 60) severity += 1; // INFO

    if (metrics.profitFactor < 1.0) severity += 3; // CRITICAL
    else if (metrics.profitFactor < 1.5) severity += 2; // WARNING

    if (metrics.maxDrawdown > 20) severity += 3; // CRITICAL
    else if (metrics.maxDrawdown > 15) severity += 2; // WARNING

    if (severity >= 3) return 'CRITICAL';
    if (severity >= 2) return 'WARNING';
    return 'INFO';
  }

  // Generate hourly report
  generateHourlyReport() {
    const status = this.paperTradingManager.getStatus();
    const accuracy = this.divergenceValidator.getAccuracyMetrics();
    const latency = this.divergenceValidator.getDetectionLatencyStats();

    return {
      timestamp: Date.now(),
      metrics: status.metrics,
      openTrades: status.openTrades,
      closedTrades: status.closedTrades,
      uptime: status.uptime,
      systemHealth: status.systemHealth,
      divergence: {
        accuracy: parseFloat(accuracy.accuracy),
        precision: parseFloat(accuracy.precision),
        latencyP95: parseInt(latency.p95)
      }
    };
  }

  // Generate final report
  generateFinalReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 WEEK 7 PAPER TRADING - FINAL REPORT');
    console.log('='.repeat(60));

    const finalStatus = this.paperTradingManager.getStatus();
    const readiness = this.paperTradingManager.checkDeploymentReadiness();
    const divergenceReady = this.divergenceValidator.isReadyForProduction();

    // Summary
    console.log('\n📊 SUMMARY');
    console.log(`Total Monitoring Duration: ${(finalStatus.uptime / 3600000).toFixed(1)} hours`);
    console.log(`Total Signals: ${finalStatus.metrics.signalsGenerated}`);
    console.log(`Closed Trades: ${finalStatus.closedTrades}`);
    console.log(`Total P&L: ${finalStatus.metrics.totalPnl.toFixed(2)}`);

    // Signal Quality
    console.log('\n📈 SIGNAL QUALITY');
    console.log(`Win Rate: ${finalStatus.metrics.winRate.toFixed(1)}% (target: >60%) ${readiness.signalQuality ? '✅' : '❌'}`);
    console.log(`Profit Factor: ${finalStatus.metrics.profitFactor.toFixed(2)} (target: >1.5) ${readiness.signalQuality ? '✅' : '❌'}`);
    console.log(`Max Drawdown: ${finalStatus.metrics.maxDrawdown.toFixed(2)}% (target: <15%) ${readiness.performanceTargets ? '✅' : '❌'}`);
    console.log(`Sharpe Ratio: ${finalStatus.metrics.sharpeRatio.toFixed(2)} (target: >0.5) ${readiness.performanceTargets ? '✅' : '❌'}`);

    // System Health
    console.log('\n💪 SYSTEM HEALTH');
    console.log(`Error Count: ${finalStatus.systemHealth.errorCount}`);
    console.log(`Recovery Count: ${finalStatus.systemHealth.recoveryCount}`);
    console.log(`Error Rate: ${((finalStatus.systemHealth.errorCount / finalStatus.metrics.signalsGenerated) * 100).toFixed(2)}% ${readiness.systemStability ? '✅' : '❌'}`);

    // Divergence Detection
    const divergenceMetrics = this.divergenceValidator.getAccuracyMetrics();
    const latencyStats = this.divergenceValidator.getDetectionLatencyStats();
    console.log('\n🔍 DIVERGENCE DETECTION');
    console.log(`Accuracy: ${divergenceMetrics.accuracy} (target: >95%) ${divergenceReady.highAccuracy ? '✅' : '❌'}`);
    console.log(`Precision: ${divergenceMetrics.precision} (target: >90%)`);
    console.log(`Recall: ${divergenceMetrics.recall} (target: >80%)`);
    console.log(`Detection Latency P95: ${latencyStats.p95} (target: <200ms)`);

    // Alerts
    console.log(`\n🚨 ALERTS & EVENTS`);
    console.log(`Total Alerts: ${this.alertLog.length}`);
    const criticalAlerts = this.alertLog.filter(a => a.severity === 'CRITICAL').length;
    const warningAlerts = this.alertLog.filter(a => a.severity === 'WARNING').length;
    console.log(`Critical: ${criticalAlerts}, Warnings: ${warningAlerts}`);

    // GO/NO-GO Decision
    console.log('\n' + '='.repeat(60));
    const overallReady = readiness.overallReady && divergenceReady.overallReady;
    if (overallReady) {
      console.log('✅ GO FOR PHASE 1 DEPLOYMENT');
      console.log('Ready to deploy to 10% user base with real money');
    } else {
      console.log('❌ NO-GO - CONTINUE TESTING');
      console.log('Address gaps and retest before Phase 1 deployment');
    }
    console.log('='.repeat(60));

    // Detailed readiness criteria
    console.log('\n📋 READINESS CRITERIA');
    console.log(`Signal Quality: ${readiness.signalQuality ? '✅' : '❌'}`);
    console.log(`Divergence Detection: ${readiness.divergenceDetection ? '✅' : '❌'}`);
    console.log(`System Stability: ${readiness.systemStability ? '✅' : '❌'}`);
    console.log(`Performance Targets: ${readiness.performanceTargets ? '✅' : '❌'}`);

    return {
      timestamp: Date.now(),
      finalStatus,
      readiness,
      divergenceReady,
      alerts: this.alertLog,
      hourlyReports: this.hourlyReports,
      metricsSnapshots: this.metricsSnapshots,
      overallReady
    };
  }

  // Stop monitoring
  stopMonitoring() {
    this.monitoringActive = false;
    console.log('\n⏹️ Paper Trading Monitoring Stopped');
  }

  // Get current monitoring status
  getMonitoringStatus() {
    if (!this.monitoringActive) {
      return { active: false };
    }

    const elapsed = Date.now() - this.startTime;
    const remaining = this.endTime - Date.now();

    return {
      active: true,
      startTime: new Date(this.startTime),
      endTime: new Date(this.endTime),
      elapsedHours: (elapsed / 3600000).toFixed(1),
      remainingHours: Math.max(0, (remaining / 3600000).toFixed(1)),
      metricsSnapshots: this.metricsSnapshots.length,
      hourlyReports: this.hourlyReports.length,
      alerts: this.alertLog.length
    };
  }
}

export default PaperTradingMonitor;
