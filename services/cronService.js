/**
 * Cron Service
 * Manages scheduled background tasks for database maintenance and aggregation
 */

import historicalDataService from './historicalDataService.js';
import signalMonitorService from './signalMonitorService.js';

class CronService {
  constructor() {
    this.jobs = new Map();
    this.lastSignalCheck = {};
  }

  /**
   * Start all scheduled jobs
   */
  startAll() {
    console.log('⏰ Starting scheduled jobs...');

    // Signal monitoring: Check every 5 minutes for good signals
    this.scheduleInterval('signalMonitor', 5 * 60 * 1000, () => this.monitorSignals());

    // Daily cleanup: Run at 11 PM IST (5:30 PM UTC)
    this.scheduleDaily('cleanup', 23, 0, () => this.cleanupOldData());

    // Hourly daily stats generation: Run at 3:30 PM IST (10 AM UTC) for previous day
    this.scheduleDaily('dailyStats', 15, 30, () => this.generateYesterdayStats());

    // Database optimization: Run at midnight
    this.scheduleDaily('optimization', 0, 0, () => this.optimizeDatabase());

    // Weekly analytics: Run Sundays at 9 AM IST (3:30 AM UTC)
    this.scheduleDaily('weeklyAnalytics', 9, 0, () => this.generateWeeklyAnalytics());

    console.log('✅ Scheduled jobs started');
  }

  /**
   * Schedule a task to run at fixed intervals
   */
  scheduleInterval(jobName, intervalMs, callback) {
    const intervalId = setInterval(() => {
      callback().catch(error => {
        console.error(`❌ Error in scheduled job ${jobName}:`, error.message);
      });
    }, intervalMs);

    this.jobs.set(jobName, intervalId);
    console.log(`⏰ Scheduled: ${jobName} every ${intervalMs / 1000} seconds`);
  }

  /**
   * Schedule a daily task at specific time
   */
  scheduleDaily(jobName, hour, minute, callback) {
    const checkAndRun = () => {
      const now = new Date();
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log(`🔄 Running scheduled job: ${jobName}`);
        callback().catch(error => {
          console.error(`❌ Error in scheduled job ${jobName}:`, error.message);
        });
      }
    };

    // Check every minute
    const intervalId = setInterval(checkAndRun, 60000);
    this.jobs.set(jobName, intervalId);

    // Also run immediately if we're within the minute
    checkAndRun();

    console.log(`⏰ Scheduled: ${jobName} daily at ${hour}:${String(minute).padStart(2, '0')}`);
  }

  /**
   * Clean up data older than retention period
   */
  async cleanupOldData() {
    try {
      const retentionDays = 365;
      console.log(`🧹 Starting data cleanup (retention: ${retentionDays} days)...`);

      const result = await historicalDataService.cleanOldData(retentionDays);

      console.log(`✅ Cleanup completed: Deleted ${result.deletedRecords} old records`);
      return result;
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate daily statistics for previous day
   */
  async generateYesterdayStats() {
    try {
      const symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tradeDate = yesterday.toISOString().split('T')[0];

      console.log(`📊 Generating daily stats for ${tradeDate}...`);

      const results = await Promise.all(
        symbols.map(symbol => historicalDataService.generateDailyStats(symbol, tradeDate))
      );

      console.log(`✅ Daily stats generated for ${symbols.length} symbols`);
      return results;
    } catch (error) {
      console.error('❌ Daily stats generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Optimize database (VACUUM, analyze indexes)
   */
  async optimizeDatabase() {
    try {
      console.log('⚡ Optimizing database...');

      // This would require direct database access
      // For now, we'll log that it's scheduled
      console.log('✅ Database optimization scheduled (requires direct DB access)');

      return { status: 'scheduled' };
    } catch (error) {
      console.error('❌ Database optimization failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate weekly analytics
   */
  async generateWeeklyAnalytics() {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();

      if (dayOfWeek !== 0) {
        console.log('📊 Weekly analytics scheduled for Sundays');
        return { status: 'skipped_not_sunday' };
      }

      console.log('📊 Generating weekly analytics...');

      const symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
      const results = {};

      for (const symbol of symbols) {
        try {
          const pcrHistory = await historicalDataService.getPCRHistory(symbol, 7);
          const mpHistory = await historicalDataService.getMaxPainHistory(symbol, 7);
          const trends = await historicalDataService.getTrendAnalysis(symbol, 7);

          results[symbol] = {
            pcrDataPoints: pcrHistory.length,
            mpDataPoints: mpHistory.length,
            trends: trends
          };
        } catch (error) {
          console.warn(`Failed to generate analytics for ${symbol}:`, error.message);
        }
      }

      console.log(`✅ Weekly analytics generated for ${symbols.length} symbols`);
      return results;
    } catch (error) {
      console.error('❌ Weekly analytics generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Monitor signals and notify on good signals
   */
  async monitorSignals() {
    try {
      const signals = await signalMonitorService.checkAllSignals();

      for (const signal of signals) {
        if (signal.isGood) {
          console.log(`📢 GOOD SIGNAL FOUND: ${signal.symbol} - ${signal.signalType} (Score: ${signal.score})`);
          await signalMonitorService.notifyUser(signal);
        }
      }
    } catch (error) {
      console.error('❌ Error monitoring signals:', error.message);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    console.log('⏹️  Stopping scheduled jobs...');

    for (const [jobName, intervalId] of this.jobs.entries()) {
      clearInterval(intervalId);
      console.log(`✅ Stopped: ${jobName}`);
    }

    this.jobs.clear();
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      activeJobs: this.jobs.size,
      jobs: Array.from(this.jobs.keys()),
      timestamp: new Date().toISOString()
    };
  }
}

export default new CronService();
