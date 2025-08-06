import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Real-Time Web Dashboard for Freshies Wallet Tracker
 * Displays newly detected wallets in a beautiful web interface
 */
export class WebDashboard {
  constructor(database, config = {}) {
    this.database = database;
    this.config = {
      port: config.port || 3000,
      enableCors: config.enableCors !== false,
      updateInterval: config.updateInterval || 5000, // 5 seconds
      maxWalletsDisplay: config.maxWalletsDisplay || 100,
      ...config
    };
    
    // Get current directory for serving static files
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.publicDir = path.join(__dirname, '..', 'public');
    
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.connectedClients = new Set();
    this.stats = {
      totalWallets: 0,
      walletsToday: 0,
      activeConnections: 0,
      lastUpdate: Date.now()
    };
    
    this.recentWallets = [];
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  /**
   * Initialize the web dashboard
   */
  async initialize() {
    console.log('🌐 Initializing Web Dashboard...');
    
    try {
      await this.loadInitialData();
      await this.startServer();
      
      console.log(`✅ Web Dashboard running at http://localhost:${this.config.port}`);
      console.log('📊 Real-time wallet tracking dashboard is live!');
      
    } catch (error) {
      console.error('❌ Failed to initialize web dashboard:', error);
      throw error;
    }
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Enable CORS
    if (this.config.enableCors) {
      this.app.use(cors());
    }
    
    // Parse JSON
    this.app.use(express.json());
    
    // Serve static files
    this.app.use(express.static(this.publicDir));
    
    // API Routes
    this.app.get('/api/stats', async (req, res) => {
      try {
        const dbStats = await this.database.getWalletStats();
        const today = new Date().toISOString().split('T')[0];
        const todayWallets = await this.database.searchWallets({
          sinceDate: new Date(today).getTime()
        });
        
        res.json({
          totalWallets: dbStats.totalWallets,
          activeWallets: dbStats.activeWallets,
          walletsToday: todayWallets.length,
          detectionMethods: dbStats.detectionMethods,
          activeConnections: this.connectedClients.size,
          lastUpdate: this.stats.lastUpdate
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/wallets/recent', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const wallets = await this.database.getAllWallets(limit);
        
        res.json({
          wallets: wallets.map(wallet => ({
            address: wallet.address,
            detectionMethod: wallet.detection_method,
            firstSeen: wallet.first_seen,
            isActive: wallet.is_active,
            solBalance: wallet.sol_balance
          })),
          count: wallets.length
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/wallets/search', async (req, res) => {
      try {
        const { method, active, since } = req.query;
        const criteria = {};
        
        if (method) criteria.detectionMethod = method;
        if (active !== undefined) criteria.isActive = active === 'true';
        if (since) criteria.sinceDate = parseInt(since);
        
        const wallets = await this.database.searchWallets(criteria);
        res.json({ wallets, count: wallets.length });
        
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(this.publicDir, 'index.html'));
    });
  }

  /**
   * Setup Socket.IO handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      this.connectedClients.add(socket.id);
      
      // Send initial data
      socket.emit('stats', this.stats);
      socket.emit('recentWallets', this.recentWallets.slice(0, 20));
      
      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`📤 Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });
      
      // Handle wallet subscription
      socket.on('subscribeToWallets', () => {
        socket.join('walletUpdates');
      });
      
      // Handle stats request
      socket.on('requestStats', async () => {
        try {
          const stats = await this.getLatestStats();
          socket.emit('stats', stats);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });
    });
  }

  /**
   * Load initial data from database
   */
  async loadInitialData() {
    try {
      const stats = await this.database.getWalletStats();
      const recentWallets = await this.database.getAllWallets(50);
      
      this.stats = {
        totalWallets: stats.totalWallets,
        activeWallets: stats.activeWallets,
        walletsToday: 0, // Will be calculated
        activeConnections: 0,
        lastUpdate: Date.now()
      };
      
      this.recentWallets = recentWallets.map(wallet => ({
        address: wallet.address,
        detectionMethod: wallet.detection_method,
        firstSeen: wallet.first_seen,
        isActive: wallet.is_active,
        solBalance: wallet.sol_balance,
        displayTime: new Date(wallet.first_seen).toLocaleTimeString()
      }));
      
    } catch (error) {
      console.error('❌ Failed to load initial data:', error);
    }
  }

  /**
   * Start the web server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Notify about a new wallet detection
   */
  notifyNewWallet(walletData) {
    try {
      const walletInfo = {
        address: walletData.address,
        detectionMethod: walletData.detectionMethod,
        firstSeen: walletData.firstSeen || Date.now(),
        isActive: walletData.isActive || false,
        solBalance: walletData.solBalance || 0,
        displayTime: new Date().toLocaleTimeString(),
        isNew: true
      };
      
      // Add to recent wallets (keep only latest 100)
      this.recentWallets.unshift(walletInfo);
      if (this.recentWallets.length > this.config.maxWalletsDisplay) {
        this.recentWallets.pop();
      }
      
      // Update stats
      this.stats.totalWallets++;
      this.stats.walletsToday++;
      this.stats.lastUpdate = Date.now();
      this.stats.activeConnections = this.connectedClients.size;
      
      // Broadcast to all connected clients
      this.io.emit('newWallet', walletInfo);
      this.io.emit('stats', this.stats);
      
      console.log(`🌐 Broadcasted new wallet to ${this.connectedClients.size} connected clients`);
      
    } catch (error) {
      console.error('❌ Failed to notify new wallet:', error);
    }
  }

  /**
   * Get latest statistics
   */
  async getLatestStats() {
    try {
      const dbStats = await this.database.getWalletStats();
      const today = new Date().toISOString().split('T')[0];
      const todayWallets = await this.database.searchWallets({
        sinceDate: new Date(today).getTime()
      });
      
      return {
        totalWallets: dbStats.totalWallets,
        activeWallets: dbStats.activeWallets,
        walletsToday: todayWallets.length,
        detectionMethods: dbStats.detectionMethods,
        activeConnections: this.connectedClients.size,
        lastUpdate: Date.now()
      };
    } catch (error) {
      console.error('❌ Failed to get latest stats:', error);
      return this.stats;
    }
  }

  /**
   * Broadcast stats update to all clients
   */
  async broadcastStatsUpdate() {
    try {
      const stats = await this.getLatestStats();
      this.stats = stats;
      this.io.emit('stats', stats);
    } catch (error) {
      console.error('❌ Failed to broadcast stats update:', error);
    }
  }

  /**
   * Start periodic stats updates
   */
  startPeriodicUpdates() {
    setInterval(async () => {
      await this.broadcastStatsUpdate();
    }, this.config.updateInterval);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount() {
    return this.connectedClients.size;
  }

  /**
   * Get recent wallets
   */
  getRecentWallets() {
    return this.recentWallets;
  }

  /**
   * Stop the web dashboard
   */
  async stop() {
    console.log('🛑 Stopping Web Dashboard...');
    
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('✅ Web Dashboard stopped');
        resolve();
      });
    });
  }
}