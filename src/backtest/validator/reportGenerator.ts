// src/backtest/validator/reportGenerator.ts
// HTML Report Generator - Beautiful backtest reports

import * as fs from 'fs'
import * as path from 'path'
import { BacktestMetrics } from '../engine/walkForwardEngine'
import { AcceptanceReport } from './acceptanceGates'

export class ReportGenerator {
  /**
   * Generate HTML backtest report
   */
  generateHTMLReport(
    metrics: BacktestMetrics,
    acceptanceReport: AcceptanceReport,
    symbol: string,
    outputPath: string
  ): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backtest Report - ${symbol}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 600;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 14px;
        }
        .content {
            padding: 30px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .metric-card.success {
            background: #d4edda;
            border-color: #28a745;
        }
        .metric-card.warning {
            background: #fff3cd;
            border-color: #ffc107;
        }
        .metric-card.danger {
            background: #f8d7da;
            border-color: #dc3545;
        }
        .metric-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 600;
        }
        .metric-value {
            font-size: 28px;
            font-weight: 700;
            color: #333;
        }
        .metrics-grid .metric-card.success .metric-value {
            color: #155724;
        }
        .metrics-grid .metric-card.warning .metric-value {
            color: #856404;
        }
        .metrics-grid .metric-card.danger .metric-value {
            color: #721c24;
        }
        .section {
            margin-top: 30px;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th {
            background: #f8f9fa;
            padding: 12px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #666;
            border-bottom: 2px solid #dee2e6;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .gate-pass {
            color: #28a745;
            font-weight: 600;
        }
        .gate-fail {
            color: #dc3545;
            font-weight: 600;
        }
        .summary-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-top: 20px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 13px;
            line-height: 1.6;
            color: #333;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #dee2e6;
            color: #666;
            font-size: 12px;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-pass {
            background: #d4edda;
            color: #155724;
        }
        .status-fail {
            background: #f8d7da;
            color: #721c24;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Backtest Report</h1>
            <p>${symbol} • ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="content">
            <!-- Status Badge -->
            <div style="text-align: center; margin-bottom: 30px;">
                <span class="status-badge ${acceptanceReport.passed ? 'status-pass' : 'status-fail'}">
                    ${acceptanceReport.passed ? '✅ BACKTEST PASSED' : '❌ BACKTEST FAILED'}
                </span>
            </div>

            <!-- Key Metrics -->
            <div class="metrics-grid">
                <div class="metric-card ${metrics.t1HitRate >= 0.9 ? 'success' : metrics.t1HitRate >= 0.8 ? 'warning' : 'danger'}">
                    <div class="metric-label">T1 Hit Rate</div>
                    <div class="metric-value">${(metrics.t1HitRate * 100).toFixed(1)}%</div>
                </div>
                <div class="metric-card ${metrics.profitFactor >= 2.5 ? 'success' : metrics.profitFactor >= 2.0 ? 'warning' : 'danger'}">
                    <div class="metric-label">Profit Factor</div>
                    <div class="metric-value">${metrics.profitFactor.toFixed(2)}</div>
                </div>
                <div class="metric-card ${metrics.maxDrawdown <= 0.08 ? 'success' : metrics.maxDrawdown <= 0.12 ? 'warning' : 'danger'}">
                    <div class="metric-label">Max Drawdown</div>
                    <div class="metric-value">${(metrics.maxDrawdown * 100).toFixed(1)}%</div>
                </div>
                <div class="metric-card ${metrics.sharpeRatio >= 2.0 ? 'success' : metrics.sharpeRatio >= 1.5 ? 'warning' : 'danger'}">
                    <div class="metric-label">Sharpe Ratio</div>
                    <div class="metric-value">${metrics.sharpeRatio.toFixed(2)}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Signals</div>
                    <div class="metric-value">${metrics.totalSignals}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Avg P&L per Signal</div>
                    <div class="metric-value">${metrics.avgPnlR >= 0 ? '+' : ''}${metrics.avgPnlR.toFixed(2)}R</div>
                </div>
            </div>

            <!-- Target Hit Rates -->
            <div class="section">
                <h3 class="section-title">Target Hit Analysis</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Target Level</th>
                            <th>Hit Count</th>
                            <th>Hit Rate</th>
                            <th>Expected Probability</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>T1 (1.0R)</td>
                            <td>${metrics.t1HitCount}</td>
                            <td><strong>${(metrics.t1HitRate * 100).toFixed(1)}%</strong></td>
                            <td>80%</td>
                        </tr>
                        <tr>
                            <td>T2 (2.0R)</td>
                            <td>${metrics.t2HitCount}</td>
                            <td><strong>${(metrics.t2HitRate * 100).toFixed(1)}%</strong></td>
                            <td>55%</td>
                        </tr>
                        <tr>
                            <td>T3 (3.5R)</td>
                            <td>${metrics.t3HitCount}</td>
                            <td><strong>${(metrics.t3HitRate * 100).toFixed(1)}%</strong></td>
                            <td>35%</td>
                        </tr>
                        <tr>
                            <td>T4 (5.5R)</td>
                            <td>${metrics.t4HitCount}</td>
                            <td><strong>${(metrics.t4HitRate * 100).toFixed(1)}%</strong></td>
                            <td>20%</td>
                        </tr>
                        <tr style="background: #f0f0f0; font-weight: 600;">
                            <td>Stop Loss Hit</td>
                            <td>${metrics.slHitCount}</td>
                            <td><strong>${((metrics.slHitCount / metrics.totalSignals) * 100).toFixed(1)}%</strong></td>
                            <td>≤ 10%</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Acceptance Gates -->
            <div class="section">
                <h3 class="section-title">Acceptance Gate Results</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Gate</th>
                            <th>Status</th>
                            <th>Requirement</th>
                            <th>Actual</th>
                            <th>Severity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${acceptanceReport.gates.map(gate => `
                        <tr>
                            <td><strong>${gate.gate}</strong></td>
                            <td class="${gate.passed ? 'gate-pass' : 'gate-fail'}">
                                ${gate.passed ? '✅ PASS' : '❌ FAIL'}
                            </td>
                            <td>${gate.requirement}</td>
                            <td><strong>${gate.actual}</strong></td>
                            <td>${gate.severity.toUpperCase()}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Summary -->
            <div class="section">
                <h3 class="section-title">Summary</h3>
                <div class="summary-box">${acceptanceReport.summary}</div>
            </div>
        </div>

        <div class="footer">
            <p>Generated on ${new Date().toLocaleString()} | 90%+ Signal Accuracy Backtest Engine</p>
        </div>
    </div>
</body>
</html>
    `

    fs.writeFileSync(outputPath, html)
    return outputPath
  }

  /**
   * Generate CSV report for detailed analysis
   */
  generateCSVReport(
    metrics: BacktestMetrics,
    symbol: string,
    outputPath: string
  ): string {
    const csv = [
      ['Metric', 'Value'],
      ['Symbol', symbol],
      ['Total Signals', metrics.totalSignals.toString()],
      ['T1 Hit Count', metrics.t1HitCount.toString()],
      ['T1 Hit Rate', `${(metrics.t1HitRate * 100).toFixed(2)}%`],
      ['T2 Hit Count', metrics.t2HitCount.toString()],
      ['T2 Hit Rate', `${(metrics.t2HitRate * 100).toFixed(2)}%`],
      ['T3 Hit Count', metrics.t3HitCount.toString()],
      ['T3 Hit Rate', `${(metrics.t3HitRate * 100).toFixed(2)}%`],
      ['T4 Hit Count', metrics.t4HitCount.toString()],
      ['T4 Hit Rate', `${(metrics.t4HitRate * 100).toFixed(2)}%`],
      ['SL Hit Count', metrics.slHitCount.toString()],
      ['SL Hit Rate', `${((metrics.slHitCount / metrics.totalSignals) * 100).toFixed(2)}%`],
      ['Timeout Count', metrics.timeoutCount.toString()],
      ['Win Rate', `${(metrics.winRate * 100).toFixed(2)}%`],
      ['Avg P&L (R)', metrics.avgPnlR.toFixed(2)],
      ['Profit Factor', metrics.profitFactor.toFixed(2)],
      ['Max Drawdown', `${(metrics.maxDrawdown * 100).toFixed(2)}%`],
      ['Sharpe Ratio', metrics.sharpeRatio.toFixed(2)]
    ]

    const csvContent = csv.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    fs.writeFileSync(outputPath, csvContent)
    return outputPath
  }
}
