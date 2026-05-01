/**
 * Report Service
 * Generates daily, weekly, and monthly market reports
 */

import historicalDataService from './historicalDataService.js';

class ReportService {
  /**
   * Generate daily report for a symbol
   */
  async generateDailyReport(symbol, date = null) {
    try {
      const targetDate = date ? new Date(date) : new Date();
      const dateStr = targetDate.toISOString().split('T')[0];

      const pcr = await historicalDataService.getPCRHistory(symbol, 1);
      const maxPain = await historicalDataService.getMaxPainHistory(symbol, 1);
      const dailyStats = await historicalDataService.getDailyStats(symbol, 1);

      const summary = {
        date: dateStr,
        symbol,
        pcr: pcr.length > 0 ? {
          ratio: pcr[pcr.length - 1].pcr_ratio,
          sentiment: pcr[pcr.length - 1].sentiment,
          confidence: pcr[pcr.length - 1].confidence,
          change: pcr[pcr.length - 1].change_percent
        } : null,
        maxPain: maxPain.length > 0 ? {
          level: maxPain[maxPain.length - 1].max_pain_level,
          price: maxPain[maxPain.length - 1].current_price,
          distance: maxPain[maxPain.length - 1].distance,
          direction: maxPain[maxPain.length - 1].direction
        } : null,
        priceAction: dailyStats.length > 0 ? {
          open: dailyStats[0].open_price,
          high: dailyStats[0].high_price,
          low: dailyStats[0].low_price,
          close: dailyStats[0].close_price,
          volume: dailyStats[0].volume
        } : null
      };

      return {
        success: true,
        data: summary,
        type: 'daily'
      };
    } catch (error) {
      console.error(`Error generating daily report for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(symbol, weekOffset = 0) {
    try {
      const days = 7;
      const pcr = await historicalDataService.getPCRHistory(symbol, days);
      const maxPain = await historicalDataService.getMaxPainHistory(symbol, days);

      const stats = {
        pcrStats: this.calculateStats(pcr.map(p => p.pcr_ratio)),
        maxPainStats: this.calculateStats(maxPain.map(m => m.max_pain_level)),
        pcrSentiments: this.countSentiments(pcr.map(p => p.sentiment)),
        avgConfidence: pcr.length > 0 ? (pcr.reduce((sum, p) => sum + p.confidence, 0) / pcr.length).toFixed(2) : 0
      };

      return {
        success: true,
        data: {
          symbol,
          period: `Last 7 days`,
          recordCount: pcr.length,
          statistics: stats
        },
        type: 'weekly'
      };
    } catch (error) {
      console.error(`Error generating weekly report for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(symbol, monthOffset = 0) {
    try {
      const days = 30;
      const pcr = await historicalDataService.getPCRHistory(symbol, days);
      const maxPain = await historicalDataService.getMaxPainHistory(symbol, days);
      const dailyStats = await historicalDataService.getDailyStats(symbol, days);

      const pcrStats = this.calculateStats(pcr.map(p => p.pcr_ratio));
      const maxPainStats = this.calculateStats(maxPain.map(m => m.max_pain_level));
      const priceStats = dailyStats.length > 0 ? {
        highest: Math.max(...dailyStats.map(d => d.high_price)),
        lowest: Math.min(...dailyStats.map(d => d.low_price)),
        avgClose: (dailyStats.reduce((sum, d) => sum + d.close_price, 0) / dailyStats.length).toFixed(2)
      } : null;

      return {
        success: true,
        data: {
          symbol,
          period: `Last 30 days`,
          pcr: {
            stats: pcrStats,
            sentiments: this.countSentiments(pcr.map(p => p.sentiment)),
            avgConfidence: pcr.length > 0 ? (pcr.reduce((sum, p) => sum + p.confidence, 0) / pcr.length).toFixed(2) : 0
          },
          maxPain: {
            stats: maxPainStats,
            migrations: this.countMigrations(maxPain)
          },
          priceAction: priceStats,
          dataPoints: {
            pcrRecords: pcr.length,
            maxPainRecords: maxPain.length,
            dailyRecords: dailyStats.length
          }
        },
        type: 'monthly'
      };
    } catch (error) {
      console.error(`Error generating monthly report for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Calculate basic statistics from an array
   */
  calculateStats(values) {
    if (values.length === 0) return null;

    values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const range = max - min;
    const median = values.length % 2 === 0
      ? ((values[values.length / 2 - 1] + values[values.length / 2]) / 2).toFixed(4)
      : values[Math.floor(values.length / 2)].toFixed(4);

    return {
      min: min.toFixed(4),
      max: max.toFixed(4),
      avg: avg.toFixed(4),
      median: median,
      range: range.toFixed(4)
    };
  }

  /**
   * Count sentiment occurrences
   */
  countSentiments(sentiments) {
    const counts = {};
    sentiments.forEach(sentiment => {
      counts[sentiment] = (counts[sentiment] || 0) + 1;
    });
    return counts;
  }

  /**
   * Count max pain level migrations
   */
  countMigrations(maxPainData) {
    if (maxPainData.length < 2) return 0;

    let migrations = 0;
    for (let i = 1; i < maxPainData.length; i++) {
      const prev = maxPainData[i - 1].max_pain_level;
      const curr = maxPainData[i].max_pain_level;
      if (Math.abs(curr - prev) > 10) {
        migrations++;
      }
    }
    return migrations;
  }

  /**
   * Generate comprehensive market report (all symbols)
   */
  async generateMarketReport(symbols = ['NIFTY', 'BANKNIFTY', 'SENSEX'], days = 7) {
    try {
      const reports = await Promise.all(
        symbols.map(symbol => this.generateWeeklyReport(symbol))
      );

      return {
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
          period: `${days} days`,
          symbols: symbols.length,
          reports: reports.map(r => r.data)
        },
        type: 'market'
      };
    } catch (error) {
      console.error('Error generating market report:', error);
      throw error;
    }
  }
}

export default new ReportService();
