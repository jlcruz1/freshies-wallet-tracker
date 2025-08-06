import dotenv from 'dotenv';
import { HeliusWebSocketManager } from './helius-websocket.js';
import { WalletDetector } from './wallet-detector.js';
import { WalletDatabase } from './database.js';
import { SolanaMCPIntegration } from './mcp-integration.js';
import { AnalyticsDashboard } from './analytics-dashboard.js';
import { WebDashboard } from './web-dashboard.js';

// Load environment variables
dotenv.config();

/**
 * Freshies - New Wallet Tracker for Solana
 * Tracks new wallets using Helius RPC and Solana MCP
 */
class FreshiesWalletTracker {
  constructor() {
    this.config = this.loadConfiguration();
    this.components = {};
    this.isRunning = false;
    
    // Statistics
    this.stats = {
      startTime: Date.now(),
      walletsDetected: 0,
      totalEvents: 0,
      errors: 0
    };
  }

  /**
   * Load configuration from environment variables
   */
  loadConfiguration() {
    const requiredEnvVars = ['HELIUS_API_KEY'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        console.log('💡 Please copy env.example to .env and fill in your configuration');
        process.exit(1);
      }
    }

    return {
      // Helius Configuration
      helius: {
        apiKey: process.env.HELIUS_API_KEY,
        network: process.env.SOLANA_NETWORK || 'mainnet',
        maxRetries: parseInt(process.env.MAX_RETRIES) || 10,
        baseDelay: parseInt(process.env.BASE_DELAY) || 1000
      },
      
      // Database Configuration
      database: {
        path: process.env.DATABASE_PATH || './data/wallets.db'
      },
      
      // Detection Configuration
      detection: {
        trackSystemProgram: process.env.TRACK_SYSTEM_PROGRAM === 'true',
        trackTokenProgram: process.env.TRACK_TOKEN_PROGRAM === 'true',
        trackPopularPrograms: process.env.TRACK_POPULAR_PROGRAMS === 'true',
        popularPrograms: process.env.POPULAR_PROGRAMS?.split(',') || [],
        batchSize: parseInt(process.env.BATCH_SIZE) || 100,
        maxSubscriptions: parseInt(process.env.MAX_SUBSCRIPTIONS) || 50,
        
        // Throttling Configuration
        enableThrottling: process.env.ENABLE_THROTTLING !== 'false',
        maxDetectionsPerMinute: parseInt(process.env.MAX_DETECTIONS_PER_MINUTE) || 10,
        processingDelay: parseInt(process.env.PROCESSING_DELAY) || 2000,
        samplingRate: parseFloat(process.env.SAMPLING_RATE) || 0.1
      },
      
      // MCP Configuration
      mcp: {
        enableEnhancedAnalysis: true,
        enableHistoricalQueries: true,
        cacheTimeout: 300000 // 5 minutes
      },
      
      // Notification Configuration
      notifications: {
        enableConsole: process.env.ENABLE_CONSOLE_LOGS !== 'false',
        enableWebhooks: process.env.ENABLE_WEBHOOKS === 'true',
        webhookUrl: process.env.WEBHOOK_URL
      },
      
      // Web Dashboard Configuration
      webDashboard: {
        enabled: process.env.ENABLE_WEB_DASHBOARD !== 'false',
        port: parseInt(process.env.WEB_DASHBOARD_PORT) || 3000,
        enableCors: true,
        maxWalletsDisplay: 100
      }
    };
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('🚀 Initializing Freshies Wallet Tracker...');
    console.log(`📡 Network: ${this.config.helius.network}`);
    console.log(`💾 Database: ${this.config.database.path}`);
    
    try {
      // Initialize database
      console.log('📊 Setting up database...');
      this.components.database = new WalletDatabase(this.config.database.path);
      await this.components.database.initialize();
      
      // Initialize WebSocket manager
      console.log('🔌 Setting up WebSocket connection...');
      this.components.wsManager = new HeliusWebSocketManager(this.config.helius);
      await this.components.wsManager.connect();
      
      // Initialize MCP integration
      console.log('🧠 Setting up MCP integration...');
      this.components.mcp = new SolanaMCPIntegration(this.config.mcp);
      await this.components.mcp.initialize();
      
      // Initialize wallet detector
      console.log('🎯 Setting up wallet detector...');
      this.components.detector = new WalletDetector(
        this.components.wsManager,
        this.components.database,
        this.config.detection
      );
      
      // Initialize analytics dashboard
      console.log('📈 Setting up analytics dashboard...');
      this.components.analytics = new AnalyticsDashboard(
        this.components.database,
        this.config.notifications
      );
      
      // Initialize web dashboard
      if (this.config.webDashboard.enabled) {
        console.log('🌐 Setting up web dashboard...');
        this.components.webDashboard = new WebDashboard(
          this.components.database,
          this.config.webDashboard
        );
      }
      
      // Setup event handlers
      this.setupEventHandlers();
      
      console.log('✅ All components initialized successfully');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers between components
   */
  setupEventHandlers() {
    // Handle new wallet detections
    this.components.wsManager.on('newWalletDetected', async (walletData) => {
      this.stats.walletsDetected++;
      
      if (this.config.notifications.enableConsole) {
        console.log(`🎉 NEW WALLET: ${walletData.address} (${walletData.detectionMethod})`);
      }
      
      // Enhanced analysis with MCP
      try {
        const verification = await this.components.mcp.enhancedWalletVerification(
          walletData.address,
          walletData.detectionMethod
        );
        
        console.log(`🔬 Verification: ${verification.isVerified ? '✅' : '❌'} (Score: ${verification.verificationScore})`);
        
        // Update wallet with verification results
        await this.components.database.updateWallet(walletData.address, {
          metadata: {
            verification,
            intelligence: await this.components.mcp.getWalletIntelligence(walletData.address)
          }
        });
        
      } catch (error) {
        console.error(`❌ Failed to enhance wallet analysis: ${error.message}`);
        this.stats.errors++;
      }
      
      // Update analytics
      await this.components.analytics.recordWalletDetection(walletData);
      
      // Notify web dashboard
      if (this.components.webDashboard) {
        this.components.webDashboard.notifyNewWallet(walletData);
      }
      
      // Send webhook if configured
      if (this.config.notifications.enableWebhooks && this.config.notifications.webhookUrl) {
        await this.sendWebhookNotification(walletData);
      }
    });

    // Handle WebSocket events
    this.components.wsManager.on('connected', () => {
      console.log('✅ WebSocket connected - monitoring active');
    });

    this.components.wsManager.on('disconnected', () => {
      console.log('⚠️ WebSocket disconnected - monitoring paused');
    });

    this.components.wsManager.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      this.stats.errors++;
    });

    this.components.wsManager.on('notification', () => {
      this.stats.totalEvents++;
    });

    // Handle process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Start the wallet tracking system
   */
  async start() {
    try {
      console.log('🎯 Starting wallet detection...');
      
      await this.components.detector.initialize();
      await this.components.analytics.initialize();
      
      // Start web dashboard
      if (this.components.webDashboard) {
        await this.components.webDashboard.initialize();
        console.log(`🌐 Web Dashboard: http://localhost:${this.config.webDashboard.port}`);
      }
      
      this.isRunning = true;
      console.log('🚀 Freshies Wallet Tracker is now running!');
      console.log('📊 Real-time wallet tracking dashboard is live!');
      
      // Start periodic reporting
      this.startPeriodicReporting();
      
    } catch (error) {
      console.error('❌ Failed to start wallet tracker:', error);
      throw error;
    }
  }

  /**
   * Start periodic status reporting
   */
  startPeriodicReporting() {
    const reportInterval = 60000; // 1 minute
    
    setInterval(() => {
      this.printStatus();
    }, reportInterval);
  }

  /**
   * Print current system status
   */
  printStatus() {
    const uptime = Date.now() - this.stats.startTime;
    const uptimeStr = this.formatDuration(uptime);
    
    const wsStatus = this.components.wsManager.getStatus();
    const detectorStats = this.components.detector.getStats();
    const throttlingStats = this.components.detector.getThrottlingStats();
    
    console.log('\n📊 === FRESHIES STATUS REPORT ===');
    console.log(`⏱️  Uptime: ${uptimeStr}`);
    console.log(`🔌 WebSocket: ${wsStatus.connected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`📡 Active Subscriptions: ${wsStatus.activeSubscriptions}`);
    console.log(`🎯 Wallets Detected: ${this.stats.walletsDetected}`);
    console.log(`📨 Total Events: ${this.stats.totalEvents}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    
    console.log(`🔍 Detection Stats:`, {
      known: detectorStats.knownWallets,
      pending: detectorStats.pendingAnalysis,
      system: detectorStats.systemProgramEvents,
      token: detectorStats.tokenProgramEvents,
      programs: detectorStats.popularProgramEvents,
      falsePositives: detectorStats.falsePositives
    });
    
    console.log(`🚫 Filtering Stats:`, {
      tokenAccountsFiltered: detectorStats.tokenAccountsFiltered,
      pdaAccountsFiltered: detectorStats.pdaAccountsFiltered,
      programAccountsFiltered: detectorStats.programAccountsFiltered,
      insufficientBalanceFiltered: detectorStats.insufficientBalanceFiltered,
      actualWalletsFound: detectorStats.actualWalletsFound
    });
    
    console.log(`⏸️ Throttling Stats:`, {
      recentDetections: `${throttlingStats.recentDetections}/${throttlingStats.maxPerMinute} per minute`,
      queueLength: throttlingStats.queueLength,
      candidatesProcessed: throttlingStats.candidatesProcessed,
      candidatesSkipped: throttlingStats.candidatesSkipped,
      rateLimitHits: throttlingStats.rateLimitHits,
      samplingRate: `${(throttlingStats.samplingRate * 100).toFixed(1)}%`
    });
    console.log('================================\n');
  }

  /**
   * Format duration in human readable format
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(walletData) {
    try {
      const payload = {
        event: 'new_wallet_detected',
        timestamp: Date.now(),
        data: walletData
      };
      
      const response = await fetch(this.config.notifications.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error('❌ Webhook notification failed:', error);
    }
  }

  /**
   * Shutdown the system gracefully
   */
  async shutdown() {
    if (!this.isRunning) return;
    
    console.log('\n🛑 Shutting down Freshies Wallet Tracker...');
    this.isRunning = false;
    
    try {
      // Stop wallet detector
      if (this.components.detector) {
        await this.components.detector.stop();
      }
      
      // Close WebSocket connection
      if (this.components.wsManager) {
        this.components.wsManager.destroy();
      }
      
      // Close database connection
      if (this.components.database) {
        await this.components.database.close();
      }
      
      // Stop analytics dashboard
      if (this.components.analytics) {
        await this.components.analytics.stop();
      }
      
      // Stop web dashboard
      if (this.components.webDashboard) {
        await this.components.webDashboard.stop();
      }
      
      console.log('✅ Shutdown completed successfully');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      wsStatus: this.components.wsManager?.getStatus(),
      detectorStats: this.components.detector?.getStats(),
      cacheStats: this.components.mcp?.getCacheStats()
    };
  }
}

/**
 * Main application entry point
 */
async function main() {
  try {
    console.log('🌟 Welcome to Freshies - New Wallet Tracker for Solana');
    console.log('🔗 Using Helius RPC and Solana MCP for enhanced detection\n');
    
    console.log('🔧 Creating tracker instance...');
    const tracker = new FreshiesWalletTracker();
    
    console.log('⚙️ Initializing components...');
    await tracker.initialize();
    
    console.log('🚀 Starting wallet detection...');
    await tracker.start();
    
    console.log('✅ System is running! Press Ctrl+C to stop.');
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the application
main().catch(console.error);

export { FreshiesWalletTracker };