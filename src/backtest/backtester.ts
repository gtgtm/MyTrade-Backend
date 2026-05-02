// src/backtest/backtester.ts
// Main Backtester Orchestrator

import { DataLoader, HistoricalData } from './engine/dataLoader'
import { WalkForwardEngine, BacktestSignal, WalkForwardWindow } from './engine/walkForwardEngine'
import { AcceptanceGates } from './validator/acceptanceGates'
import { ReportGenerator } from './validator/reportGenerator'

export interface BacktestConfig {
  symbol: string
  market: 'CRYPTO' | 'FNO'
  dataPath: string
  startDate: Date
  endDate: Date
  trainDays?: number
  testDays?: number
  outputDir?: string
}

export interface BacktestResult {
  symbol: string
  dataLoaded: boolean
  windowsCount: number
  totalSignalsGenerated: number
  acceptancePass: boolean
  metricsFile: string
  reportFile: string
  csvFile: string
}

export class Backtester {
  private dataLoader: DataLoader
  private wfEngine: WalkForwardEngine
  private acceptanceGates: AcceptanceGates
  private reportGenerator: ReportGenerator

  constructor() {
    this.dataLoader = new DataLoader()
    this.wfEngine = new WalkForwardEngine()
    this.acceptanceGates = new AcceptanceGates()
    this.reportGenerator = new ReportGenerator()
  }

  /**
   * Run complete backtest
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`\n🚀 Starting backtest for ${config.symbol}...`)

    try {
      // 1. Load historical data
      console.log(`📊 Loading historical data from ${config.dataPath}`)
      const historicalData = this.dataLoader.loadFromCSV(config.dataPath)

      // 2. Validate data
      const validation = this.dataLoader.validateData(historicalData.data)
      if (!validation.valid) {
        console.error('❌ Data validation failed:')
        validation.errors.forEach(e => console.error(`  - ${e}`))
        throw new Error('Invalid historical data')
      }

      // 3. Filter by date range
      console.log(`📅 Filtering data from ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`)
      const filteredData = this.dataLoader.filterByDateRange(historicalData, config.startDate, config.endDate)

      // 4. Get data statistics
      const stats = this.dataLoader.getStatistics(filteredData)
      console.log(`✅ Data loaded: ${stats.count} bars from ${stats.startDate.toISOString()} to ${stats.endDate.toISOString()}`)
      console.log(`   Price range: ${stats.minPrice.toFixed(2)} - ${stats.maxPrice.toFixed(2)} (${stats.priceRange.toFixed(2)})`)
      console.log(`   Avg volume: ${stats.avgVolume.toFixed(0)}`)

      // 5. Generate walk-forward windows
      const trainDays = config.trainDays || 180
      const testDays = config.testDays || 30
      const windows = this.wfEngine.generateWindows(filteredData.data, trainDays, testDays)
      console.log(`\n📈 Generated ${windows.length} walk-forward windows (${trainDays}d train, ${testDays}d test)`)

      // 6. Run backtest on each window
      const allSignals: BacktestSignal[] = []
      let windowNumber = 1

      for (const window of windows) {
        console.log(`   Window ${windowNumber}/${windows.length}: ${window.testStart.toISOString().split('T')[0]} to ${window.testEnd.toISOString().split('T')[0]}`)

        const windowSignals = this.wfEngine.backtestWindow(
          filteredData.data,
          window,
          config.symbol,
          config.market
        )

        allSignals.push(...windowSignals)
        windowNumber++
      }

      console.log(`\n✅ Backtest complete: Generated ${allSignals.length} signals across all windows`)

      // 7. Calculate metrics
      const metrics = this.wfEngine.calculateMetrics(allSignals)

      // 8. Run acceptance gates
      const acceptanceReport = this.acceptanceGates.validateMetrics(metrics)

      // 9. Generate reports
      const outputDir = config.outputDir || './backtest-reports'
      if (!require('fs').existsSync(outputDir)) {
        require('fs').mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const htmlFile = `${outputDir}/${config.symbol}_backtest_${timestamp}.html`
      const csvFile = `${outputDir}/${config.symbol}_backtest_${timestamp}.csv`
      const metricsFile = `${outputDir}/${config.symbol}_metrics_${timestamp}.json`

      this.reportGenerator.generateHTMLReport(metrics, acceptanceReport, config.symbol, htmlFile)
      this.reportGenerator.generateCSVReport(metrics, config.symbol, csvFile)

      require('fs').writeFileSync(metricsFile, JSON.stringify({
        config,
        metrics,
        acceptanceReport,
        timestamp: new Date().toISOString()
      }, null, 2))

      // 10. Print summary
      console.log(acceptanceReport.summary)

      console.log(`\n📄 Reports generated:`)
      console.log(`   HTML: ${htmlFile}`)
      console.log(`   CSV:  ${csvFile}`)
      console.log(`   JSON: ${metricsFile}`)

      return {
        symbol: config.symbol,
        dataLoaded: true,
        windowsCount: windows.length,
        totalSignalsGenerated: allSignals.length,
        acceptancePass: acceptanceReport.passed,
        metricsFile,
        reportFile: htmlFile,
        csvFile
      }
    } catch (error) {
      console.error('❌ Backtest failed:', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /**
   * Run backtest on multiple symbols
   */
  async runBatchBacktest(configs: BacktestConfig[]): Promise<BacktestResult[]> {
    const results: BacktestResult[] = []

    for (const config of configs) {
      try {
        const result = await this.runBacktest(config)
        results.push(result)
      } catch (error) {
        console.error(`Failed to backtest ${config.symbol}:`, error instanceof Error ? error.message : String(error))
      }
    }

    return results
  }

  /**
   * Print summary of all results
   */
  printSummary(results: BacktestResult[]): void {
    console.log('\n╔════════════════════════════════════════════╗')
    console.log('║         BACKTEST BATCH SUMMARY             ║')
    console.log('╚════════════════════════════════════════════╝')

    let passed = 0
    let failed = 0

    results.forEach(result => {
      const status = result.acceptancePass ? '✅' : '❌'
      const rate = `${result.totalSignalsGenerated} signals`
      console.log(`${status} ${result.symbol}: ${rate} (${result.windowsCount} windows)`)

      if (result.acceptancePass) {
        passed++
      } else {
        failed++
      }
    })

    console.log(`\nSummary: ${passed} passed, ${failed} failed out of ${results.length} symbols`)
  }
}

// Example usage
export async function runExample() {
  const backtester = new Backtester()

  const config: BacktestConfig = {
    symbol: 'BTCUSDT',
    market: 'CRYPTO',
    dataPath: './data/BTCUSDT_daily.csv',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    trainDays: 180,
    testDays: 30,
    outputDir: './backtest-reports'
  }

  try {
    const result = await backtester.runBacktest(config)
    console.log('\n✅ Backtest completed:', result)
  } catch (error) {
    console.error('❌ Backtest failed:', error)
  }
}
