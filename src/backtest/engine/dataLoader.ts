// src/backtest/engine/dataLoader.ts
// Historical Data Loader - OHLCV data from CSV or database

import * as fs from 'fs'
import * as path from 'path'

export interface OHLCV {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoricalData {
  symbol: string
  data: OHLCV[]
  timeframe: '5m' | '15m' | '1h' | '4h' | '1d'
}

export class DataLoader {
  /**
   * Load OHLCV data from CSV file
   * Format: timestamp,open,high,low,close,volume
   */
  loadFromCSV(filePath: string, timeframe: '5m' | '15m' | '1h' | '4h' | '1d' = '1d'): HistoricalData {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Data file not found: ${filePath}`)
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0)

    if (lines.length < 2) {
      throw new Error('CSV file must have header + data rows')
    }

    const symbol = path.basename(filePath, '.csv')
    const data: OHLCV[] = []

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')

      if (parts.length < 6) continue

      try {
        const ohlcv: OHLCV = {
          timestamp: new Date(parts[0].trim()),
          open: parseFloat(parts[1].trim()),
          high: parseFloat(parts[2].trim()),
          low: parseFloat(parts[3].trim()),
          close: parseFloat(parts[4].trim()),
          volume: parseFloat(parts[5].trim())
        }

        if (isNaN(ohlcv.timestamp.getTime()) || !isFinite(ohlcv.close)) {
          continue
        }

        data.push(ohlcv)
      } catch (e) {
        continue
      }
    }

    if (data.length === 0) {
      throw new Error(`No valid OHLCV data found in ${filePath}`)
    }

    return {
      symbol,
      data: data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      timeframe
    }
  }

  /**
   * Load multiple symbols from directory
   */
  loadDirectory(dirPath: string, timeframe: '5m' | '15m' | '1h' | '4h' | '1d' = '1d'): HistoricalData[] {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`)
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'))

    return files.map(file => {
      try {
        return this.loadFromCSV(path.join(dirPath, file), timeframe)
      } catch (e) {
        console.warn(`Skipped ${file}:`, e instanceof Error ? e.message : String(e))
        return null
      }
    }).filter((d): d is HistoricalData => d !== null)
  }

  /**
   * Filter data by date range
   */
  filterByDateRange(data: HistoricalData, startDate: Date, endDate: Date): HistoricalData {
    const filtered = data.data.filter(
      candle => candle.timestamp >= startDate && candle.timestamp <= endDate
    )

    if (filtered.length === 0) {
      throw new Error(
        `No data found between ${startDate.toISOString()} and ${endDate.toISOString()}`
      )
    }

    return {
      ...data,
      data: filtered
    }
  }

  /**
   * Validate data quality
   */
  validateData(data: OHLCV[]): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (data.length < 100) {
      errors.push(`Insufficient data: ${data.length} bars (need ≥100)`)
    }

    for (let i = 0; i < data.length; i++) {
      const candle = data[i]

      if (!isFinite(candle.open) || !isFinite(candle.high) || !isFinite(candle.low) || !isFinite(candle.close)) {
        errors.push(`Invalid OHLC at index ${i}: ${JSON.stringify(candle)}`)
      }

      if (candle.high < candle.low || candle.high < candle.close || candle.high < candle.open) {
        errors.push(`Invalid high/low at index ${i}: H=${candle.high}, L=${candle.low}`)
      }

      if (candle.volume < 0) {
        errors.push(`Negative volume at index ${i}: ${candle.volume}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get data statistics
   */
  getStatistics(data: HistoricalData): {
    count: number
    startDate: Date
    endDate: Date
    minPrice: number
    maxPrice: number
    avgVolume: number
    priceRange: number
  } {
    const prices = data.data.map(c => c.close)
    const volumes = data.data.map(c => c.volume)

    return {
      count: data.data.length,
      startDate: data.data[0].timestamp,
      endDate: data.data[data.data.length - 1].timestamp,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
      priceRange: Math.max(...prices) - Math.min(...prices)
    }
  }

  /**
   * Calculate technical indicators for each bar
   */
  calculateIndicators(
    data: OHLCV[],
    maShortPeriod: number = 21,
    maLongPeriod: number = 200
  ): Array<
    OHLCV & {
      sma21: number
      sma200: number
      atr: number
      volume_ma: number
    }
  > {
    const result = []

    for (let i = 0; i < data.length; i++) {
      const candle = data[i]

      let sma21 = NaN
      let sma200 = NaN
      let atr = NaN
      let volume_ma = NaN

      if (i >= maShortPeriod - 1) {
        const slice = data.slice(i - maShortPeriod + 1, i + 1)
        sma21 = slice.reduce((sum, c) => sum + c.close, 0) / maShortPeriod
      }

      if (i >= maLongPeriod - 1) {
        const slice = data.slice(i - maLongPeriod + 1, i + 1)
        sma200 = slice.reduce((sum, c) => sum + c.close, 0) / maLongPeriod
      }

      if (i >= 13) {
        const trueRanges = []
        for (let j = Math.max(0, i - 13); j <= i; j++) {
          const prev = j > 0 ? data[j - 1].close : data[j].close
          const tr = Math.max(
            data[j].high - data[j].low,
            Math.abs(data[j].high - prev),
            Math.abs(data[j].low - prev)
          )
          trueRanges.push(tr)
        }
        atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
      }

      if (i >= 19) {
        const volumeSlice = data.slice(i - 19, i + 1)
        volume_ma = volumeSlice.reduce((sum, c) => sum + c.volume, 0) / 20
      }

      result.push({
        ...candle,
        sma21,
        sma200,
        atr,
        volume_ma
      })
    }

    return result
  }
}
