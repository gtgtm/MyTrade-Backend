/**
 * Export Service
 * Handles data export to CSV and JSON formats
 */

import historicalDataService from './historicalDataService.js';

class ExportService {
  /**
   * Convert array of objects to CSV string
   */
  convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';

    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }

  /**
   * Export PCR history as CSV
   */
  async exportPCRHistory(symbol, days = 7) {
    try {
      const history = await historicalDataService.getPCRHistory(symbol, days);

      if (history.length === 0) {
        return { success: false, message: 'No data available' };
      }

      const headers = ['recorded_at', 'pcr_ratio', 'sentiment', 'confidence', 'change_percent'];
      const csv = this.convertToCSV(
        history.map(h => ({
          recorded_at: h.recorded_at,
          pcr_ratio: h.pcr_ratio.toFixed(4),
          sentiment: h.sentiment,
          confidence: h.confidence.toFixed(2),
          change_percent: h.change_percent?.toFixed(2) || '0'
        })),
        headers
      );

      return {
        success: true,
        data: csv,
        filename: `PCR-${symbol}-${days}days.csv`,
        records: history.length
      };
    } catch (error) {
      console.error('Error exporting PCR history:', error);
      throw error;
    }
  }

  /**
   * Export Max Pain history as CSV
   */
  async exportMaxPainHistory(symbol, days = 7) {
    try {
      const history = await historicalDataService.getMaxPainHistory(symbol, days);

      if (history.length === 0) {
        return { success: false, message: 'No data available' };
      }

      const headers = ['recorded_at', 'max_pain_level', 'current_price', 'distance', 'direction'];
      const csv = this.convertToCSV(
        history.map(h => ({
          recorded_at: h.recorded_at,
          max_pain_level: h.max_pain_level.toFixed(2),
          current_price: h.current_price.toFixed(2),
          distance: h.distance?.toFixed(2) || '0',
          direction: h.direction || ''
        })),
        headers
      );

      return {
        success: true,
        data: csv,
        filename: `MaxPain-${symbol}-${days}days.csv`,
        records: history.length
      };
    } catch (error) {
      console.error('Error exporting Max Pain history:', error);
      throw error;
    }
  }

  /**
   * Export IV history as CSV
   */
  async exportIVHistory(symbol, days = 7) {
    try {
      const history = await historicalDataService.getIVHistory(symbol, days);

      if (history.length === 0) {
        return { success: false, message: 'No data available' };
      }

      const headers = ['recorded_at', 'strike_price', 'call_iv', 'put_iv', 'atm_iv'];
      const csv = this.convertToCSV(
        history.map(h => ({
          recorded_at: h.recorded_at,
          strike_price: h.strike_price.toFixed(2),
          call_iv: h.call_iv?.toFixed(2) || '0',
          put_iv: h.put_iv?.toFixed(2) || '0',
          atm_iv: h.atm_iv?.toFixed(2) || '0'
        })),
        headers
      );

      return {
        success: true,
        data: csv,
        filename: `IV-${symbol}-${days}days.csv`,
        records: history.length
      };
    } catch (error) {
      console.error('Error exporting IV history:', error);
      throw error;
    }
  }

  /**
   * Export daily stats as CSV
   */
  async exportDailyStats(symbol, days = 30) {
    try {
      const stats = await historicalDataService.getDailyStats(symbol, days);

      if (stats.length === 0) {
        return { success: false, message: 'No data available' };
      }

      const headers = ['trade_date', 'symbol', 'open_price', 'high_price', 'low_price', 'close_price', 'volume'];
      const csv = this.convertToCSV(
        stats.map(s => ({
          trade_date: s.trade_date,
          symbol: s.symbol,
          open_price: s.open_price?.toFixed(2) || '0',
          high_price: s.high_price?.toFixed(2) || '0',
          low_price: s.low_price?.toFixed(2) || '0',
          close_price: s.close_price?.toFixed(2) || '0',
          volume: s.volume || '0'
        })),
        headers
      );

      return {
        success: true,
        data: csv,
        filename: `DailyStats-${symbol}-${days}days.csv`,
        records: stats.length
      };
    } catch (error) {
      console.error('Error exporting daily stats:', error);
      throw error;
    }
  }

  /**
   * Export full analysis (all data types) as CSV
   */
  async exportFullAnalysis(symbol, days = 30) {
    try {
      const [pcr, maxPain, iv, dailyStats] = await Promise.all([
        historicalDataService.getPCRHistory(symbol, days),
        historicalDataService.getMaxPainHistory(symbol, days),
        historicalDataService.getIVHistory(symbol, days),
        historicalDataService.getDailyStats(symbol, days)
      ]);

      const headers = [
        'date',
        'pcr_ratio',
        'pcr_sentiment',
        'max_pain',
        'current_price',
        'atm_iv',
        'daily_close'
      ];

      const dateMap = new Map();

      pcr.forEach(p => {
        const date = p.recorded_at.split(' ')[0];
        if (!dateMap.has(date)) dateMap.set(date, {});
        dateMap.get(date).pcr_ratio = p.pcr_ratio.toFixed(4);
        dateMap.get(date).pcr_sentiment = p.sentiment;
      });

      maxPain.forEach(m => {
        const date = m.recorded_at.split(' ')[0];
        if (!dateMap.has(date)) dateMap.set(date, {});
        dateMap.get(date).max_pain = m.max_pain_level.toFixed(2);
        dateMap.get(date).current_price = m.current_price.toFixed(2);
      });

      iv.forEach(i => {
        const date = i.recorded_at.split(' ')[0];
        if (!dateMap.has(date)) dateMap.set(date, {});
        if (!dateMap.get(date).atm_iv) {
          dateMap.get(date).atm_iv = i.atm_iv?.toFixed(2) || '0';
        }
      });

      dailyStats.forEach(d => {
        if (!dateMap.has(d.trade_date)) dateMap.set(d.trade_date, {});
        dateMap.get(d.trade_date).daily_close = d.close_price?.toFixed(2) || '0';
      });

      const data = Array.from(dateMap.entries())
        .sort()
        .map(([date, values]) => ({
          date,
          pcr_ratio: values.pcr_ratio || '',
          pcr_sentiment: values.pcr_sentiment || '',
          max_pain: values.max_pain || '',
          current_price: values.current_price || '',
          atm_iv: values.atm_iv || '',
          daily_close: values.daily_close || ''
        }));

      const csv = this.convertToCSV(data, headers);

      return {
        success: true,
        data: csv,
        filename: `FullAnalysis-${symbol}-${days}days.csv`,
        records: data.length
      };
    } catch (error) {
      console.error('Error exporting full analysis:', error);
      throw error;
    }
  }

  /**
   * Convert data to JSON format
   */
  async exportAsJSON(symbol, days = 30, dataType = 'full') {
    try {
      let data = {};

      if (dataType === 'pcr' || dataType === 'full') {
        data.pcr = await historicalDataService.getPCRHistory(symbol, days);
      }

      if (dataType === 'maxpain' || dataType === 'full') {
        data.maxPain = await historicalDataService.getMaxPainHistory(symbol, days);
      }

      if (dataType === 'iv' || dataType === 'full') {
        data.iv = await historicalDataService.getIVHistory(symbol, days);
      }

      if (dataType === 'dailystats' || dataType === 'full') {
        data.dailyStats = await historicalDataService.getDailyStats(symbol, days);
      }

      return {
        success: true,
        data,
        filename: `${symbol}-${dataType}-${days}days.json`
      };
    } catch (error) {
      console.error('Error exporting as JSON:', error);
      throw error;
    }
  }
}

export default new ExportService();
