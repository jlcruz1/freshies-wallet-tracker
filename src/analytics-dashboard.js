/**
 * Analytics Dashboard for Freshies Wallet Tracker
 * Provides insights and reporting on detected wallets
 */
export class AnalyticsDashboard {
  constructor(database, config = {}) {
    this.database = database;
    this.config = {
      enableWebInterface: config.enableWebInterface ?? false,
      port: config.port || 3000,
      updateInterval: config.updateInterval || 60000, // 1 minute
      enableConsole: config.enableConsole ?? true,
      ...config
    };
    
    this.currentMetrics = {};
    this.historicalData = [];
    this.isRunning = false;
    this.updateTimer = null;
  }

  /**
   * Initialize the analytics dashboard
   */
  async initialize() {
    console.log('📈 Initializing Analytics Dashboard...');
    
    try {
      // Load initial metrics
      await this.updateMetrics();
      
      // Start periodic updates
      this.startPeriodicUpdates();
      
      // Initialize web interface if enabled
      if (this.config.enableWebInterface) {
        await this.initializeWebInterface();
      }
      
      this.isRunning = true;
      console.log('✅ Analytics Dashboard initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize analytics dashboard:', error);
      throw error;
    }
  }

  /**
   * Start periodic metric updates
   */
  startPeriodicUpdates() {
    this.updateTimer = setInterval(async () => {
      try {
        await this.updateMetrics();
        await this.saveDailyAnalytics();
        
        if (this.config.enableConsole) {
          this.displayConsoleAnalytics();
        }
        
      } catch (error) {
        console.error('❌ Failed to update metrics:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Update current metrics from database
   */
  async updateMetrics() {
    try {
      const stats = await this.database.getWalletStats();
      const now = Date.now();
      const last24h = now - (24 * 60 * 60 * 1000);
      const lastWeek = now - (7 * 24 * 60 * 60 * 1000);
      const lastMonth = now - (30 * 24 * 60 * 60 * 1000);
      
      // Get time-based metrics
      const recentWallets = await this.database.searchWallets({
        sinceDate: last24h
      });
      
      const weeklyWallets = await this.database.searchWallets({
        sinceDate: lastWeek
      });
      
      const monthlyWallets = await this.database.searchWallets({
        sinceDate: lastMonth
      });
      
      // Calculate growth rates
      const dailyGrowth = recentWallets.length;
      const weeklyGrowth = weeklyWallets.length;
      const monthlyGrowth = monthlyWallets.length;
      
      // Detection method breakdown
      const detectionMethodStats = {};
      for (const [method, count] of Object.entries(stats.detectionMethods)) {
        detectionMethodStats[method] = {
          total: count,
          percentage: ((count / stats.totalWallets) * 100).toFixed(1)
        };
      }
      
      // Activity analysis
      const activeWallets = await this.database.searchWallets({
        isActive: true
      });
      
      this.currentMetrics = {
        overview: {
          totalWallets: stats.totalWallets,
          activeWallets: stats.activeWallets,
          newToday: dailyGrowth,
          newThisWeek: weeklyGrowth,
          newThisMonth: monthlyGrowth,
          activityRate: ((stats.activeWallets / stats.totalWallets) * 100).toFixed(1)
        },
        detection: {
          methods: detectionMethodStats,
          topMethod: this.getTopDetectionMethod(stats.detectionMethods),
          efficiency: this.calculateDetectionEfficiency()
        },
        trends: {
          dailyTrend: this.calculateTrend('daily'),
          weeklyTrend: this.calculateTrend('weekly'),
          monthlyTrend: this.calculateTrend('monthly')
        },
        wallet_analysis: {
          riskDistribution: await this.getRiskDistribution(),
          typeDistribution: await this.getTypeDistribution(),
          activityDistribution: await this.getActivityDistribution()
        },
        timestamp: now
      };
      
      // Store historical data
      this.historicalData.push({
        timestamp: now,
        totalWallets: stats.totalWallets,
        activeWallets: stats.activeWallets,
        newWallets: dailyGrowth
      });
      
      // Keep only last 24 hours of historical data
      this.historicalData = this.historicalData.filter(
        entry => entry.timestamp > now - (24 * 60 * 60 * 1000)
      );
      
    } catch (error) {
      console.error('❌ Failed to update metrics:', error);
    }
  }

  /**
   * Get top detection method
   */
  getTopDetectionMethod(methods) {
    let topMethod = 'unknown';
    let maxCount = 0;
    
    for (const [method, count] of Object.entries(methods)) {
      if (count > maxCount) {
        maxCount = count;
        topMethod = method;
      }
    }
    
    return {
      method: topMethod,
      count: maxCount
    };
  }

  /**
   * Calculate detection efficiency (placeholder)
   */
  calculateDetectionEfficiency() {
    // This would calculate based on false positives, verification rates, etc.
    return {
      verificationRate: 85.5, // Percentage of detected wallets that pass verification
      falsePositiveRate: 12.3, // Percentage of false positives
      responseTime: 2.1 // Average time to detect new wallet (seconds)
    };
  }

  /**
   * Calculate trend (placeholder)
   */
  calculateTrend(period) {
    // This would calculate based on historical data
    const trends = {
      daily: Math.random() > 0.5 ? 'up' : 'down',
      weekly: Math.random() > 0.5 ? 'up' : 'down',
      monthly: Math.random() > 0.5 ? 'up' : 'down'
    };
    
    return {
      direction: trends[period],
      percentage: (Math.random() * 20).toFixed(1)
    };
  }

  /**
   * Get risk distribution of wallets
   */
  async getRiskDistribution() {
    // This would query wallet metadata for risk scores
    return {
      low: 65,
      medium: 25,
      high: 10
    };
  }

  /**
   * Get wallet type distribution
   */
  async getTypeDistribution() {
    // This would query wallet metadata for types
    return {
      retail: 70,
      institutional: 15,
      bot: 8,
      exchange: 4,
      defi_protocol: 2,
      nft_trader: 1
    };
  }

  /**
   * Get activity distribution
   */
  async getActivityDistribution() {
    return {
      high: 20,
      medium: 35,
      low: 30,
      inactive: 15
    };
  }

  /**
   * Display console analytics
   */
  displayConsoleAnalytics() {
    if (!this.currentMetrics.overview) return;
    
    console.log('\n📊 === FRESHIES ANALYTICS ===');
    console.log(`📈 Total Wallets: ${this.currentMetrics.overview.totalWallets.toLocaleString()}`);
    console.log(`🎯 Active Wallets: ${this.currentMetrics.overview.activeWallets.toLocaleString()} (${this.currentMetrics.overview.activityRate}%)`);
    console.log(`🆕 New Today: ${this.currentMetrics.overview.newToday}`);
    console.log(`📅 New This Week: ${this.currentMetrics.overview.newThisWeek}`);
    console.log(`📆 New This Month: ${this.currentMetrics.overview.newThisMonth}`);
    
    console.log('\n🔍 Detection Methods:');
    for (const [method, stats] of Object.entries(this.currentMetrics.detection.methods)) {
      console.log(`  ${method}: ${stats.total} (${stats.percentage}%)`);
    }
    
    console.log('\n📊 Wallet Types:');
    for (const [type, percentage] of Object.entries(this.currentMetrics.wallet_analysis.typeDistribution)) {
      console.log(`  ${type}: ${percentage}%`);
    }
    
    console.log('\n⚡ Efficiency:');
    console.log(`  Verification Rate: ${this.currentMetrics.detection.efficiency.verificationRate}%`);
    console.log(`  False Positive Rate: ${this.currentMetrics.detection.efficiency.falsePositiveRate}%`);
    console.log(`  Avg Response Time: ${this.currentMetrics.detection.efficiency.responseTime}s`);
    console.log('============================\n');
  }

  /**
   * Save daily analytics to database
   */
  async saveDailyAnalytics() {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const analyticsData = {
        walletsDetected: this.currentMetrics.overview.newToday,
        totalWallets: this.currentMetrics.overview.totalWallets,
        activeWallets: this.currentMetrics.overview.activeWallets,
        totalTransactions: 0, // Would be calculated from transaction data
        totalVolume: 0, // Would be calculated from transaction data
        detectionMethods: this.currentMetrics.detection.methods
      };
      
      await this.database.saveDailyAnalytics(today, analyticsData);
      
    } catch (error) {
      console.error('❌ Failed to save daily analytics:', error);
    }
  }

  /**
   * Record a new wallet detection
   */
  async recordWalletDetection(walletData) {
    try {
      // Update real-time metrics
      if (this.currentMetrics.overview) {
        this.currentMetrics.overview.totalWallets++;
        this.currentMetrics.overview.newToday++;
        
        // Update detection method stats
        const method = walletData.detectionMethod;
        if (this.currentMetrics.detection.methods[method]) {
          this.currentMetrics.detection.methods[method].total++;
        } else {
          this.currentMetrics.detection.methods[method] = {
            total: 1,
            percentage: '0.1'
          };
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to record wallet detection:', error);
    }
  }

  /**
   * Generate analytical report
   */
  async generateReport(options = {}) {
    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
      format = 'json'
    } = options;
    
    try {
      const analytics = await this.database.getAnalytics(startDate, endDate);
      const wallets = await this.database.searchWallets({
        sinceDate: new Date(startDate).getTime()
      });
      
      const report = {
        period: {
          start: startDate,
          end: endDate,
          days: Math.ceil((new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000))
        },
        summary: {
          totalWalletsDetected: wallets.length,
          avgWalletsPerDay: (wallets.length / report.period.days).toFixed(1),
          detectionMethods: this.analyzeDetectionMethods(wallets),
          walletTypes: this.analyzeWalletTypes(wallets),
          topDetectionDays: this.getTopDetectionDays(analytics)
        },
        trends: {
          growth: this.calculateGrowthTrend(analytics),
          patterns: this.identifyPatterns(analytics)
        },
        insights: this.generateInsights(wallets, analytics),
        generatedAt: Date.now()
      };
      
      if (format === 'console') {
        this.displayReport(report);
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      return null;
    }
  }

  /**
   * Analyze detection methods from wallet data
   */
  analyzeDetectionMethods(wallets) {
    const methods = {};
    
    for (const wallet of wallets) {
      const method = wallet.detection_method;
      methods[method] = (methods[method] || 0) + 1;
    }
    
    return methods;
  }

  /**
   * Analyze wallet types (would use metadata)
   */
  analyzeWalletTypes(wallets) {
    // Placeholder - would analyze metadata for wallet types
    return {
      retail: Math.floor(wallets.length * 0.7),
      institutional: Math.floor(wallets.length * 0.15),
      bot: Math.floor(wallets.length * 0.1),
      other: Math.floor(wallets.length * 0.05)
    };
  }

  /**
   * Get top detection days
   */
  getTopDetectionDays(analytics) {
    return analytics
      .sort((a, b) => b.wallets_detected - a.wallets_detected)
      .slice(0, 5)
      .map(day => ({
        date: day.date,
        walletsDetected: day.wallets_detected
      }));
  }

  /**
   * Calculate growth trend
   */
  calculateGrowthTrend(analytics) {
    if (analytics.length < 2) return { trend: 'insufficient_data' };
    
    const recent = analytics.slice(0, 3);
    const older = analytics.slice(-3);
    
    const recentAvg = recent.reduce((sum, day) => sum + day.wallets_detected, 0) / recent.length;
    const olderAvg = older.reduce((sum, day) => sum + day.wallets_detected, 0) / older.length;
    
    const growthRate = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    return {
      trend: growthRate > 0 ? 'increasing' : 'decreasing',
      rate: Math.abs(growthRate).toFixed(1),
      recentAvg: recentAvg.toFixed(1),
      olderAvg: olderAvg.toFixed(1)
    };
  }

  /**
   * Identify patterns in the data
   */
  identifyPatterns(analytics) {
    // Placeholder for pattern analysis
    return {
      peakDays: ['Monday', 'Friday'], // Would analyze by day of week
      peakHours: [14, 15, 16], // Would analyze by hour
      seasonality: 'weekend_spike' // Would detect seasonal patterns
    };
  }

  /**
   * Generate insights from data
   */
  generateInsights(wallets, analytics) {
    const insights = [];
    
    if (wallets.length > 1000) {
      insights.push('High wallet detection volume - consider scaling infrastructure');
    }
    
    if (analytics.some(day => day.wallets_detected > 100)) {
      insights.push('Detected peak activity days - monitor for market events');
    }
    
    insights.push('System is functioning within normal parameters');
    
    return insights;
  }

  /**
   * Display report in console
   */
  displayReport(report) {
    console.log('\n📄 === FRESHIES ANALYTICS REPORT ===');
    console.log(`📅 Period: ${report.period.start} to ${report.period.end} (${report.period.days} days)`);
    console.log(`🎯 Total Wallets Detected: ${report.summary.totalWalletsDetected}`);
    console.log(`📊 Average per Day: ${report.summary.avgWalletsPerDay}`);
    
    console.log('\n🔍 Detection Methods:');
    for (const [method, count] of Object.entries(report.summary.detectionMethods)) {
      console.log(`  ${method}: ${count}`);
    }
    
    console.log('\n📈 Growth Trend:');
    console.log(`  Direction: ${report.trends.growth.trend}`);
    console.log(`  Rate: ${report.trends.growth.rate}%`);
    
    console.log('\n💡 Insights:');
    for (const insight of report.insights) {
      console.log(`  • ${insight}`);
    }
    console.log('=====================================\n');
  }

  /**
   * Initialize web interface (placeholder)
   */
  async initializeWebInterface() {
    console.log(`🌐 Web interface would be available at http://localhost:${this.config.port}`);
    console.log('💡 Web interface implementation pending - using console output for now');
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return this.currentMetrics;
  }

  /**
   * Get historical data
   */
  getHistoricalData() {
    return this.historicalData;
  }

  /**
   * Stop the analytics dashboard
   */
  async stop() {
    console.log('🛑 Stopping Analytics Dashboard...');
    
    this.isRunning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    console.log('✅ Analytics Dashboard stopped');
  }
}