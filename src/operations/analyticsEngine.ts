// src/operations/analyticsEngine.ts
// Analytics Engine - Performance reporting and trend analysis

import { LiveMetrics } from './liveMonitoring';

export interface AnalyticsReport {
  period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startTime: Date;
  endTime: Date;
  metrics: {
    totalSignals: number;
    totalTrades: number;
    totalPnL: number;
    averagePnL: number;
    t1HitRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
  };
  trends: {
    signalTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
    profitTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
    drawdownTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
    hitRateTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  };
  insights: string[];
  recommendations: string[];
}

export interface DailyReport {
  date: Date;
  dayOfWeek: string;
  timeInMarket: number; // minutes
  signalsGenerated: number;
  tradesExecuted: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  bestTrade: number;
  worstTrade: number;
  avgPnLPerTrade: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  hitRate: number;
}

export interface WeeklyReport {
  weekStartDate: Date;
  weekEndDate: Date;
  totalSignals: number;
  totalTrades: number;
  winningDays: number;
  losingDays: number;
  totalPnL: number;
  avgPnLPerDay: number;
  bestDay: number;
  worstDay: number;
  profitFactor: number;
  maxDrawdown: number;
  consistency: number; // % of positive days
}

export class AnalyticsEngine {
  private dailyReports: Map<string, DailyReport> = new Map();
  private weeklyReports: Map<string, WeeklyReport> = new Map();
  private metrics: LiveMetrics[] = [];
  private updateInterval: NodeJS.Timer | null = null;

  startAnalytics(intervalMinutes: number = 60): void {
    if (this.updateInterval) {
      console.log('⚠️ Analytics already running');
      return;
    }

    this.updateInterval = setInterval(() => {
      this.generateReports();
    }, intervalMinutes * 60 * 1000);

    console.log(`✅ Analytics started (${intervalMinutes}-minute intervals)`);
  }

  stopAnalytics(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log('⏹️ Analytics stopped');
  }

  recordMetrics(metrics: LiveMetrics): void {
    this.metrics.push(metrics);

    // Keep last 7 days (10080 minutes at 1-minute recording)
    if (this.metrics.length > 10080) {
      this.metrics.shift();
    }
  }

  private generateReports(): void {
    const dailyReport = this.generateDailyReport();
    if (dailyReport) {
      const dateKey = dailyReport.date.toISOString().split('T')[0];
      this.dailyReports.set(dateKey, dailyReport);
    }

    const weeklyReport = this.generateWeeklyReport();
    if (weeklyReport) {
      const weekKey = `${weeklyReport.weekStartDate.toISOString().split('T')[0]}`;
      this.weeklyReports.set(weekKey, weeklyReport);
    }
  }

  private generateDailyReport(): DailyReport | null {
    if (this.metrics.length === 0) return null;

    const today = new Date();
    const dayMetrics = this.metrics.filter(
      (m) =>
        new Date(m.timestamp).toDateString() === today.toDateString()
    );

    if (dayMetrics.length === 0) return null;

    const pnls = dayMetrics.map((m) => m.totalPnL || 0);
    const trades = dayMetrics.reduce((sum, m) => sum + (m.executedTrades || 0), 0);
    const signals = dayMetrics.reduce((sum, m) => sum + (m.activeSignals || 0), 0);

    const totalPnL = pnls.reduce((a, b) => a + b, 0);
    const avgPnL = trades > 0 ? totalPnL / trades : 0;
    const bestTrade = Math.max(...pnls, 0);
    const worstTrade = Math.min(...pnls, 0);

    const lastMetrics = dayMetrics[dayMetrics.length - 1];
    const profitFactor = lastMetrics?.profitFactor || 0;
    const maxDrawdown = lastMetrics?.maxDrawdown || 0;
    const hitRate = lastMetrics?.t1HitRate || 0;
    const sharpeRatio = lastMetrics?.sharpeRatio || 0;

    return {
      date: today,
      dayOfWeek: today.toLocaleString('en-US', { weekday: 'long' }),
      timeInMarket: dayMetrics.length,
      signalsGenerated: signals,
      tradesExecuted: trades,
      winningTrades: pnls.filter((p) => p > 0).length,
      losingTrades: pnls.filter((p) => p < 0).length,
      totalPnL,
      bestTrade,
      worstTrade,
      avgPnLPerTrade: avgPnL,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      hitRate,
    };
  }

  private generateWeeklyReport(): WeeklyReport | null {
    const dailyReports = Array.from(this.dailyReports.values());
    if (dailyReports.length === 0) return null;

    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStartDate = new Date(today);
    weekStartDate.setDate(today.getDate() - dayOfWeek);
    weekStartDate.setHours(0, 0, 0, 0);

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const weekDailyReports = dailyReports.filter(
      (r) => r.date >= weekStartDate && r.date <= weekEndDate
    );

    if (weekDailyReports.length === 0) return null;

    const totalSignals = weekDailyReports.reduce((sum, r) => sum + r.signalsGenerated, 0);
    const totalTrades = weekDailyReports.reduce((sum, r) => sum + r.tradesExecuted, 0);
    const winningDays = weekDailyReports.filter((r) => r.totalPnL > 0).length;
    const losingDays = weekDailyReports.filter((r) => r.totalPnL < 0).length;
    const totalPnL = weekDailyReports.reduce((sum, r) => sum + r.totalPnL, 0);
    const avgPnLPerDay = weekDailyReports.length > 0 ? totalPnL / weekDailyReports.length : 0;

    const dayPnLs = weekDailyReports.map((r) => r.totalPnL);
    const bestDay = Math.max(...dayPnLs, 0);
    const worstDay = Math.min(...dayPnLs, 0);

    const profitFactor =
      weekDailyReports.reduce((sum, r) => sum + r.profitFactor, 0) / weekDailyReports.length;
    const maxDrawdown =
      Math.max(...weekDailyReports.map((r) => r.maxDrawdown), 0);
    const consistency =
      weekDailyReports.length > 0 ? (winningDays / weekDailyReports.length) * 100 : 0;

    return {
      weekStartDate,
      weekEndDate,
      totalSignals,
      totalTrades,
      winningDays,
      losingDays,
      totalPnL,
      avgPnLPerDay,
      bestDay,
      worstDay,
      profitFactor,
      maxDrawdown,
      consistency,
    };
  }

  generateAnalyticsReport(period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'): AnalyticsReport {
    const now = new Date();
    const startTime = this.calculatePeriodStart(now, period);

    const periodMetrics = this.metrics.filter((m) => m.timestamp >= startTime && m.timestamp <= now);

    const metrics = {
      totalSignals: periodMetrics.reduce((sum, m) => sum + (m.activeSignals || 0), 0),
      totalTrades: periodMetrics.reduce((sum, m) => sum + (m.executedTrades || 0), 0),
      totalPnL: periodMetrics.reduce((sum, m) => sum + (m.totalPnL || 0), 0),
      averagePnL:
        periodMetrics.length > 0
          ? periodMetrics.reduce((sum, m) => sum + (m.totalPnL || 0), 0) / periodMetrics.length
          : 0,
      t1HitRate:
        periodMetrics.length > 0
          ? periodMetrics.reduce((sum, m) => sum + (m.t1HitRate || 0), 0) / periodMetrics.length
          : 0,
      profitFactor:
        periodMetrics.length > 0
          ? periodMetrics.reduce((sum, m) => sum + (m.profitFactor || 0), 0) / periodMetrics.length
          : 0,
      maxDrawdown: Math.max(...periodMetrics.map((m) => m.maxDrawdown || 0), 0),
      sharpeRatio:
        periodMetrics.length > 0
          ? periodMetrics.reduce((sum, m) => sum + (m.sharpeRatio || 0), 0) / periodMetrics.length
          : 0,
      winRate:
        periodMetrics.length > 0
          ? periodMetrics.reduce((sum, m) => sum + (m.winRate || 0), 0) / periodMetrics.length
          : 0,
    };

    const trends = this.analyzeTrends(period, metrics);
    const insights = this.generateInsights(metrics, trends);
    const recommendations = this.generateRecommendations(metrics, trends);

    return {
      period,
      startTime,
      endTime: now,
      metrics,
      trends,
      insights,
      recommendations,
    };
  }

  private calculatePeriodStart(now: Date, period: string): Date {
    const start = new Date(now);

    switch (period) {
      case 'HOURLY':
        start.setHours(start.getHours() - 1);
        break;
      case 'DAILY':
        start.setDate(start.getDate() - 1);
        break;
      case 'WEEKLY':
        start.setDate(start.getDate() - 7);
        break;
      case 'MONTHLY':
        start.setMonth(start.getMonth() - 1);
        break;
    }

    return start;
  }

  private analyzeTrends(
    period: string,
    current: any
  ): {
    signalTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
    profitTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
    drawdownTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
    hitRateTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  } {
    // Simplified trend analysis - in production would compare with previous period
    return {
      signalTrend: 'STABLE',
      profitTrend: current.totalPnL > 0 ? 'INCREASING' : 'DECREASING',
      drawdownTrend: current.maxDrawdown < 0.1 ? 'IMPROVING' : 'WORSENING',
      hitRateTrend: current.t1HitRate > 0.88 ? 'IMPROVING' : 'WORSENING',
    };
  }

  private generateInsights(metrics: any, trends: any): string[] {
    const insights: string[] = [];

    if (metrics.profitFactor > 2.5) {
      insights.push('✅ Excellent profit factor - strategy performing well');
    } else if (metrics.profitFactor < 1.5) {
      insights.push('⚠️ Low profit factor - review risk management');
    }

    if (metrics.t1HitRate > 0.9) {
      insights.push('✅ High T1 hit rate - signal quality excellent');
    } else if (metrics.t1HitRate < 0.85) {
      insights.push('⚠️ Low T1 hit rate - investigate signal generation');
    }

    if (metrics.maxDrawdown < 0.08) {
      insights.push('✅ Excellent drawdown control - strong risk management');
    } else if (metrics.maxDrawdown > 0.15) {
      insights.push('🔴 High drawdown - consider reducing position size');
    }

    if (metrics.totalTrades > 50) {
      insights.push(`📊 Strong activity - ${metrics.totalTrades} trades executed`);
    }

    return insights;
  }

  private generateRecommendations(metrics: any, trends: any): string[] {
    const recommendations: string[] = [];

    if (metrics.profitFactor < 2.5) {
      recommendations.push('Review stop loss levels - may be too tight');
    }

    if (metrics.t1HitRate < 0.88) {
      recommendations.push('Analyze signal confluence patterns - consider adjusting thresholds');
    }

    if (metrics.maxDrawdown > 0.1) {
      recommendations.push('Reduce position size by 25-50% to lower drawdown');
    }

    if (metrics.totalTrades < 30) {
      recommendations.push('Increase signal frequency or expand symbol coverage');
    }

    if (trends.profitTrend === 'DECREASING') {
      recommendations.push('Market conditions may be changing - review adaptive parameters');
    }

    return recommendations;
  }

  getDailyReport(date: Date): DailyReport | undefined {
    const dateKey = date.toISOString().split('T')[0];
    return this.dailyReports.get(dateKey);
  }

  getWeeklyReport(date: Date): WeeklyReport | undefined {
    const dateKey = date.toISOString().split('T')[0];
    return this.weeklyReports.get(dateKey);
  }

  getAllDailyReports(): DailyReport[] {
    return Array.from(this.dailyReports.values());
  }

  printAnalyticsReport(report: AnalyticsReport): void {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║ ${report.period} ANALYTICS REPORT                           ║`);
    console.log(`║ Period: ${report.startTime.toLocaleDateString()} - ${report.endTime.toLocaleDateString()} ║`);
    console.log(`║                                                        ║`);
    console.log(`║ Performance:                                           ║`);
    console.log(
      `║   Total Signals: ${this.padRight(report.metrics.totalSignals.toString(), 31)} ║`
    );
    console.log(
      `║   Total Trades: ${this.padRight(report.metrics.totalTrades.toString(), 32)} ║`
    );
    console.log(
      `║   Total P&L: ${this.padRight(`${report.metrics.totalPnL.toFixed(2)}R`, 35)} ║`
    );
    console.log(
      `║   Profit Factor: ${this.padRight(`${report.metrics.profitFactor.toFixed(2)}`, 30)} ║`
    );
    console.log(`║   T1 Hit Rate: ${this.padRight(`${(report.metrics.t1HitRate * 100).toFixed(1)}%`, 32)} ║`);
    console.log(
      `║   Max Drawdown: ${this.padRight(`${(report.metrics.maxDrawdown * 100).toFixed(1)}%`, 30)} ║`
    );
    console.log(`║                                                        ║`);
    console.log(`║ Insights:                                              ║`);
    for (const insight of report.insights.slice(0, 3)) {
      const truncated = insight.substring(0, 44);
      console.log(`║   ${truncated.padEnd(44)} ║`);
    }
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private padRight(str: string, width: number): string {
    return str + ' '.repeat(Math.max(0, width - str.length));
  }
}

export default AnalyticsEngine;
