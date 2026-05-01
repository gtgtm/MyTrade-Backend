/**
 * Export Controller
 * Handles data export API endpoints
 */

import exportService from '../services/exportService.js';
import reportService from '../services/reportService.js';

class ExportController {
  /**
   * GET /api/export/pcr/:symbol?days=7&format=csv
   * Export PCR history
   */
  async exportPCRHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 7, format = 'csv' } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      if (format === 'csv') {
        const result = await exportService.exportPCRHistory(symbol, parseInt(days));
        if (!result.success) {
          return res.status(404).json(result);
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.data);
      } else if (format === 'json') {
        const result = await exportService.exportAsJSON(symbol, parseInt(days), 'pcr');
        return res.status(200).json({
          success: true,
          data: result.data,
          metadata: {
            symbol,
            days: parseInt(days),
            format: 'json',
            timestamp: new Date().toISOString()
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Format must be csv or json'
        });
      }
    } catch (error) {
      console.error('Error exporting PCR history:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to export PCR history'
      });
    }
  }

  /**
   * GET /api/export/max-pain/:symbol?days=7&format=csv
   * Export Max Pain history
   */
  async exportMaxPainHistory(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 7, format = 'csv' } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      if (format === 'csv') {
        const result = await exportService.exportMaxPainHistory(symbol, parseInt(days));
        if (!result.success) {
          return res.status(404).json(result);
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.data);
      } else if (format === 'json') {
        const result = await exportService.exportAsJSON(symbol, parseInt(days), 'maxpain');
        return res.status(200).json({
          success: true,
          data: result.data,
          metadata: {
            symbol,
            days: parseInt(days),
            format: 'json',
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Error exporting Max Pain history:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to export Max Pain history'
      });
    }
  }

  /**
   * GET /api/export/full/:symbol?days=30&format=csv
   * Export all data (PCR, Max Pain, IV, Daily Stats)
   */
  async exportFullAnalysis(req, res) {
    try {
      const { symbol } = req.params;
      const { days = 30, format = 'csv' } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      if (format === 'csv') {
        const result = await exportService.exportFullAnalysis(symbol, parseInt(days));
        if (!result.success) {
          return res.status(404).json(result);
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.send(result.data);
      } else if (format === 'json') {
        const result = await exportService.exportAsJSON(symbol, parseInt(days), 'full');
        return res.status(200).json({
          success: true,
          data: result.data,
          metadata: {
            symbol,
            days: parseInt(days),
            format: 'json',
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Error exporting full analysis:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to export full analysis'
      });
    }
  }

  /**
   * GET /api/reports/daily/:symbol?date=YYYY-MM-DD
   * Generate daily market report
   */
  async getDailyReport(req, res) {
    try {
      const { symbol } = req.params;
      const { date } = req.query;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const report = await reportService.generateDailyReport(symbol, date);

      return res.status(200).json({
        success: true,
        data: report.data,
        metadata: {
          type: 'daily',
          symbol,
          date: date || new Date().toISOString().split('T')[0],
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating daily report:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate daily report'
      });
    }
  }

  /**
   * GET /api/reports/weekly/:symbol
   * Generate weekly market report
   */
  async getWeeklyReport(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const report = await reportService.generateWeeklyReport(symbol);

      return res.status(200).json({
        success: true,
        data: report.data,
        metadata: {
          type: 'weekly',
          symbol,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating weekly report:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate weekly report'
      });
    }
  }

  /**
   * GET /api/reports/monthly/:symbol
   * Generate monthly market report
   */
  async getMonthlyReport(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter required'
        });
      }

      const report = await reportService.generateMonthlyReport(symbol);

      return res.status(200).json({
        success: true,
        data: report.data,
        metadata: {
          type: 'monthly',
          symbol,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating monthly report:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate monthly report'
      });
    }
  }

  /**
   * GET /api/reports/market?symbols=NIFTY,BANKNIFTY,SENSEX&days=7
   * Generate market-wide report
   */
  async getMarketReport(req, res) {
    try {
      const { symbols = 'NIFTY,BANKNIFTY,SENSEX', days = 7 } = req.query;
      const symbolList = typeof symbols === 'string' ? symbols.split(',') : symbols;

      const report = await reportService.generateMarketReport(symbolList, parseInt(days));

      return res.status(200).json({
        success: true,
        data: report.data,
        metadata: {
          type: 'market',
          symbols: symbolList,
          days: parseInt(days),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error generating market report:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate market report'
      });
    }
  }
}

export default new ExportController();
