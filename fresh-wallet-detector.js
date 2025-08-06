import { Connection, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Fresh Wallet Detection System for Solana
 * Focuses on detecting fresh user wallets through Raydium swap monitoring
 */
class FreshWalletDetector {
  constructor() {
    // Core configuration
    this.heliusApiKey = process.env.HELIUS_API_KEY;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    
    // Rate limiting and throttling (optimized for speed while avoiding 429 errors)
    this.processingDelay = parseInt(process.env.PROCESSING_DELAY) || 4000; // Reduced to 4 seconds
    this.maxChecksPerMinute = parseInt(process.env.MAX_CHECKS_PER_MINUTE) || 12; // Increased to 12 per minute
    this.samplingRate = parseFloat(process.env.SAMPLING_RATE) || 0.08; // Increased to 8%
    
    // Tracking variables
    this.processedWallets = new Set();
    this.checkCount = 0;
    this.lastResetTime = Date.now();
    this.sessionStartTime = Date.now(); // Track session start for fresh data
    
    // Statistics
    this.stats = {
      totalWalletsDetected: 0,
      freshWalletsFound: 0,
      whalesFound: 0,
      freshWhalesFound: 0,
      duplicatesSkipped: 0,
      nonUserAccountsSkipped: 0,
      rpcErrors: 0,
      lastDetectionTime: null,
      uptime: Date.now()
    };
    
    // Initialize token tracking for analytics
    this.tokenTracker = {
      all: [], // All trades (success + failed)
      success: [], // Only successful fresh wallets
      failed: [] // Only failed checks
    };
    
    // Initialize whale tracking (100+ SOL balance)
    this.whaleTracker = {
      all: [], // All whale wallets detected
      fresh: [], // Fresh whale wallets
      whaleThreshold: 100 // Minimum SOL balance to be considered a whale
    };
    
    // Connection objects
    this.rpcConnection = null;
    this.ws = null;
    this.database = null;
    this.app = null;
    this.server = null;
    this.io = null;
    
    // Raydium program IDs for monitoring
    this.RAYDIUM_PROGRAMS = [
      'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // Raydium AMM
      '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h'   // Raydium Serum
    ];
  }

  /**
   * Initialize all components
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Fresh Wallet Detection System...');
      
      // Initialize database
      await this.initializeDatabase();
      
      // Initialize RPC connection
      this.rpcConnection = new Connection(this.rpcUrl, 'confirmed');
      console.log('✅ RPC Connection initialized');
      
      // Setup web dashboard
      await this.setupWebDashboard();
      
      console.log('✅ Fresh Wallet Detection System initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize:', error.message);
      return false;
    }
  }

  /**
   * Initialize SQLite database
   */
  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.database = new sqlite3.Database('fresh_wallets.db', (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log('✅ Database connected');
        
        // Create wallets table
        this.database.run(`
          CREATE TABLE IF NOT EXISTS fresh_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT UNIQUE NOT NULL,
            detection_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            age_hours REAL,
            transaction_count INTEGER,
            sol_balance REAL,
            is_fresh BOOLEAN,
            token_trade TEXT,
            swap_signature TEXT
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('✅ Database table ready');
            resolve();
          }
        });
      });
    });
  }

  /**
   * Setup Express server and Socket.IO for web dashboard
   */
  async setupWebDashboard() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Enable CORS and serve static files
    this.app.use(cors());
    this.app.use(express.static(path.join(__dirname, 'public')));

    // API Routes for Railway compatibility
    this.app.get('/api/stats', (req, res) => {
      res.json({
        success: true,
        stats: this.stats
      });
    });

    this.app.get('/api/tokens', (req, res) => {
      const category = req.query.category || 'all';
      const minutes = parseInt(req.query.minutes) || 5;
      
      let tokens = [];
      if (this.tokenTracker) {
        const analytics = this.getMostTradedTokens();
        if (analytics[category] && analytics[category][`${minutes}min`]) {
          tokens = analytics[category][`${minutes}min`];
        }
      }
      
      res.json({
        success: true,
        tokens: tokens
      });
    });

    this.app.get('/api/whales', (req, res) => {
      let whaleData = {
        totalWhales: 0,
        totalFreshWhales: 0,
        allWhales: [],
        freshWhales: []
      };
      
      if (this.whaleTracker) {
        whaleData = {
          totalWhales: this.whaleTracker.all.length,
          totalFreshWhales: this.whaleTracker.fresh.length,
          allWhales: this.whaleTracker.all,
          freshWhales: this.whaleTracker.fresh
        };
      }
      
      res.json({
        success: true,
        whaleData: whaleData
      });
    });

    this.app.get('/api/wallet-data', (req, res) => {
      const address = req.query.address;
      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address is required'
        });
      }
      
      // This is a simplified response for manual checks
      res.json({
        success: true,
        result: {
          address: address,
          success: false,
          reason: 'Manual check - use the real-time system for accurate results',
          ageHours: 'N/A',
          transactionCount: 'N/A',
          solBalance: 'N/A'
        }
      });
    });

    // Socket.IO connection handling
    this.io.on('connection', (socket) => {
      console.log('🌐 Client connected to web dashboard');
      
      // Send current stats when client connects
      socket.emit('stats', this.stats);
      
      // Send current analytics if available
      if (this.tokenTracker && this.tokenTracker.all.length > 0) {
        this.emitTokenAnalytics();
      }
      
      // Send current whale analytics if available
      if (this.whaleTracker && this.whaleTracker.all.length > 0) {
        this.emitWhaleAnalytics();
      }
      
      socket.on('disconnect', () => {
        console.log('🌐 Client disconnected from web dashboard');
      });
    });

    // Start server
    const PORT = process.env.PORT || 3001;
    this.server.listen(PORT, () => {
      console.log(`🌐 Web dashboard running on http://localhost:${PORT}`);
    });
  }

  /**
   * Start the detection system
   */
  async start() {
    console.log('🔄 Starting Fresh Wallet Detection...');
    
    try {
      // Initialize WebSocket connection
      await this.connectToHelius();
      
      // Subscribe to Raydium programs
      await this.subscribeToRaydiumSwaps();
      
      console.log('✅ Fresh Wallet Detection started successfully');
      console.log(`📊 Rate limit: ${this.maxChecksPerMinute} wallets/minute`);
      console.log(`⏱️ Processing delay: ${this.processingDelay}ms`);
      console.log(`🎯 Sampling rate: ${(this.samplingRate * 100).toFixed(1)}%`);
      
      // Start analytics emission intervals
      this.startAnalyticsIntervals();
      
    } catch (error) {
      console.error('❌ Failed to start detection:', error.message);
      setTimeout(() => this.start(), 5000); // Retry after 5 seconds
    }
  }

  /**
   * Connect to Helius WebSocket
   */
  async connectToHelius() {
    return new Promise((resolve, reject) => {
      console.log('🔗 Connecting to Helius WebSocket...');
      const ws = new WebSocket(this.wsUrl);
      
      ws.on('open', () => {
        console.log('✅ Connected to Helius WebSocket');
        this.ws = ws;
        resolve();
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        this.ws = null;
        reject(error);
      });
      
      ws.on('close', () => {
        console.log('🔄 WebSocket connection closed, reconnecting...');
        this.ws = null;
        setTimeout(() => this.connectToHelius(), 5000);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error.message);
        }
      });
    });
  }

  /**
   * Subscribe to Raydium program logs
   */
  async subscribeToRaydiumSwaps() {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('WebSocket not connected');
    }

    for (const programId of this.RAYDIUM_PROGRAMS) {
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: `raydium-${programId}`,
        method: 'logsSubscribe',
        params: [
          {
            mentions: [programId]
          },
          {
            commitment: 'confirmed'
          }
        ]
      };
      
      try {
        this.ws.send(JSON.stringify(subscribeMessage));
        console.log(`📡 Subscribed to Raydium program: ${programId}`);
      } catch (error) {
        console.error(`❌ Failed to subscribe to ${programId}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(message) {
    try {
      if (message.method === 'logsNotification' && message.params) {
        const logData = message.params.result || message.params.value || message.params;
        
        // Apply sampling rate
        if (Math.random() > this.samplingRate) {
          return;
        }
        
        // Check rate limits
        if (!this.canProcessMore()) {
          return;
        }
        
        await this.processSwapTransaction(logData);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error.message);
    }
  }

  /**
   * Check if we can process more wallets (rate limiting)
   */
  canProcessMore() {
    const now = Date.now();
    const timeElapsed = now - this.lastResetTime;
    
    // Reset counter every minute
    if (timeElapsed >= 60000) {
      this.checkCount = 0;
      this.lastResetTime = now;
    }
    
    return this.checkCount < this.maxChecksPerMinute;
  }

  /**
   * Process swap transaction to extract signer wallet
   */
  async processSwapTransaction(logData) {
    try {
      // Handle different message structures from Helius
      const signature = logData?.signature || logData?.value?.signature;
      if (!signature) {
        console.log('⚠️ No signature found in log data:', JSON.stringify(logData).substring(0, 200));
        return;
      }
      
      // Get transaction details
      const transaction = await this.rpcConnection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!transaction || !transaction.transaction) {
        return;
      }
      
      // Extract signer (fee payer) from transaction
      const signerWallet = this.extractSignerFromTransaction(transaction);
      if (!signerWallet) {
        return;
      }
      
      // Extract token information
      const tokenInfo = await this.extractTokenInfo(transaction);
      console.log(`💎 Token info for ${signerWallet.substring(0, 8)}:`, tokenInfo);
      
      // Process the wallet with delay
      await this.processWalletWithDelay(signerWallet, null, signature, tokenInfo);
      
    } catch (error) {
      console.error('Error processing swap transaction:', error.message);
      this.stats.rpcErrors++;
    }
  }

  /**
   * Extract signer wallet from transaction
   */
  extractSignerFromTransaction(transaction) {
    try {
      // The first account in accountKeys is usually the fee payer (signer)
      const accountKeys = transaction.transaction.message.accountKeys;
      if (accountKeys && accountKeys.length > 0) {
        return accountKeys[0].toBase58();
      }
      return null;
    } catch (error) {
      console.error('Error extracting signer:', error.message);
      return null;
    }
  }

  /**
   * Extract basic token information from swap transaction
   */
  async extractTokenInfo(transaction) {
    try {
      if (!transaction || !transaction.meta) {
        return {
          trade: 'No Transaction Data',
          inputToken: { symbol: 'Unknown', mint: 'Unknown' },
          outputToken: { symbol: 'Unknown', mint: 'Unknown' },
          amounts: 'No transaction data'
        };
      }
      
      // Method 1: Try to extract from instruction logs (most accurate for swaps)
      const logResult = this.extractFromInstructionLogs(transaction);
      if (logResult) {
        return logResult;
      }
      
      // Method 2: Try balance analysis across ALL accounts (not just matching indices)
      const balanceResult = this.extractFromAllBalanceChanges(transaction);
      if (balanceResult) {
        return balanceResult;
      }
      
      // Method 3: Fallback - look at unique mints present
      const mintResult = this.extractFromUniqueTokens(transaction);
      if (mintResult) {
        return mintResult;
      }
      
      console.log('⚠️ Could not extract token info');
      return {
        trade: 'Raydium Swap',
        inputToken: { symbol: 'Unknown', mint: 'Unknown' },
        outputToken: { symbol: 'Unknown', mint: 'Unknown' },
        amounts: 'Swap detected'
      };
      
    } catch (error) {
      console.error('❌ Error extracting token info:', error.message);
      return {
        trade: 'Extraction Error',
        inputToken: { symbol: 'Unknown', mint: 'Unknown' },
        outputToken: { symbol: 'Unknown', mint: 'Unknown' },
        amounts: 'Extraction error'
      };
    }
  }

  extractFromInstructionLogs(transaction) {
    try {
      if (!transaction.meta.logMessages) return null;
      
      // Look for Raydium swap logs
      const logs = transaction.meta.logMessages;
      for (const log of logs) {
        // Look for swap patterns in logs
        if (log.includes('swap') || log.includes('Swap')) {
          // Try to extract token information from log message
          // This is program-specific and might need adjustment
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  extractFromAllBalanceChanges(transaction) {
    try {
      if (!transaction.meta.preTokenBalances || !transaction.meta.postTokenBalances) {
        return null;
      }
      
      const preBalances = transaction.meta.preTokenBalances;
      const postBalances = transaction.meta.postTokenBalances;
      
      // Collect ALL balance changes across all accounts
      const changes = [];
      
      for (const preBal of preBalances) {
        const postBal = postBalances.find(p => 
          p.accountIndex === preBal.accountIndex && p.mint === preBal.mint
        );
        
        if (postBal && preBal.mint) {
          const preAmount = parseFloat(preBal.uiTokenAmount?.uiAmountString || '0');
          const postAmount = parseFloat(postBal.uiTokenAmount?.uiAmountString || '0');
          const change = postAmount - preAmount;
          
          if (Math.abs(change) > 0.000001) { // Ignore tiny dust changes
            changes.push({
              mint: preBal.mint,
              change: change,
              symbol: this.getTokenSymbol(preBal.mint)
            });
          }
        }
      }
      
      // Find the largest positive and negative changes
      const sortedChanges = changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      const negativeChange = sortedChanges.find(c => c.change < 0);
      const positiveChange = sortedChanges.find(c => c.change > 0);
      
      if (negativeChange && positiveChange) {
        return {
          trade: `${negativeChange.symbol} → ${positiveChange.symbol}`,
          inputToken: {
            mint: negativeChange.mint,
            symbol: negativeChange.symbol,
            amount: Math.abs(negativeChange.change)
          },
          outputToken: {
            mint: positiveChange.mint,
            symbol: positiveChange.symbol,
            amount: positiveChange.change
          },
          amounts: `${Math.abs(negativeChange.change).toFixed(3)} ${negativeChange.symbol} → ${positiveChange.change.toFixed(3)} ${positiveChange.symbol}`
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  extractFromUniqueTokens(transaction) {
    try {
      if (!transaction.meta.preTokenBalances || !transaction.meta.postTokenBalances) {
        return null;
      }
      
      // Get unique token mints from the transaction
      const mints = new Set();
      [...transaction.meta.preTokenBalances, ...transaction.meta.postTokenBalances].forEach(balance => {
        if (balance.mint) mints.add(balance.mint);
      });
      
      const uniqueMints = Array.from(mints);
      if (uniqueMints.length >= 2) {
        // Take first two unique tokens as a guess
        const token1 = uniqueMints[0];
        const token2 = uniqueMints[1];
        
        return {
          trade: `${this.getTokenSymbol(token1)} ↔ ${this.getTokenSymbol(token2)}`,
          inputToken: {
            mint: token1,
            symbol: this.getTokenSymbol(token1),
            amount: 0
          },
          outputToken: {
            mint: token2,
            symbol: this.getTokenSymbol(token2),
            amount: 0
          },
          amounts: 'Token swap detected'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token symbol from mint address
   */
  getTokenSymbol(mint) {
    const knownTokens = {
      // Major tokens
      'So11111111111111111111111111111111111111112': 'WSOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      
      // Liquid staking
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'bSOL',
      'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL',
      
      // Popular memecoins
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
      'CKaKtYvz6dKPyMvYq9Rh3UBrnNqYqABSdhKdErjd1VrQ': 'dogwifhat',
      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5': 'MEW',
      
      // DeFi tokens
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
      'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': 'PYTH',
      'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': 'RENDER',
      
      // AI/Tech tokens  
      'SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y': 'SHDW',
      'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux': 'HNT',
      
      // Other popular
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': 'STEP',
      'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6': 'KIN'
    };
    
    const symbol = knownTokens[mint];
    if (symbol) {
      return symbol;
    }
    
    // Return the actual mint address for unknown tokens instead of 'SPL'
    return mint;
  }

  /**
   * Process wallet with rate limiting delay
   */
  async processWalletWithDelay(signerWallet, accountInfo = null, swapSignature = null, tokenInfo = null) {
    try {
      // Skip if already processed
      if (this.processedWallets.has(signerWallet)) {
        this.stats.duplicatesSkipped++;
        return;
      }
      
      this.processedWallets.add(signerWallet);
      this.checkCount++;
      
      console.log(`🔍 Analyzing wallet: ${signerWallet.substring(0, 8)}...`);
      
      // Check if this is a fresh wallet
      const result = await this.checkIfFreshWallet(signerWallet);
      
      // Check SOL balance for whale detection
      const solBalance = await this.getSOLBalance(signerWallet);
      const isWhale = solBalance >= this.whaleTracker.whaleThreshold;
      
      // Track whale if balance is 100+ SOL
      if (isWhale) {
        this.trackWhale(signerWallet, solBalance, tokenInfo, result.success);
        this.stats.whalesFound++;
        if (result.success) {
          this.stats.freshWhalesFound++;
        }
        console.log(`🐋 WHALE DETECTED: ${signerWallet.substring(0, 8)}... - ${solBalance.toFixed(2)} SOL ${result.success ? '(FRESH)' : ''}`);
      }
      
      // Track tokens for analytics - accept any token info including mint addresses
      const hasValidTokenInfo = tokenInfo && 
        tokenInfo.inputToken && 
        tokenInfo.outputToken && 
        tokenInfo.inputToken.symbol && 
        tokenInfo.outputToken.symbol &&
        tokenInfo.inputToken.symbol !== 'Unknown' && 
        tokenInfo.outputToken.symbol !== 'Unknown' &&
        tokenInfo.inputToken.symbol.length > 0 &&
        tokenInfo.outputToken.symbol.length > 0;
      
      if (!hasValidTokenInfo && tokenInfo) {
        console.log(`🚫 Token rejected for ${signerWallet.substring(0, 8)}:`, {
          hasInputToken: !!tokenInfo.inputToken,
          hasOutputToken: !!tokenInfo.outputToken,
          inputSymbol: tokenInfo.inputToken?.symbol,
          outputSymbol: tokenInfo.outputToken?.symbol,
          inputSymbolValid: tokenInfo.inputToken?.symbol !== 'Unknown',
          outputSymbolValid: tokenInfo.outputToken?.symbol !== 'Unknown'
        });
      }
      
      if (hasValidTokenInfo) {
        this.trackTokens(tokenInfo, result.success);
        console.log(`✅ Token tracked for ${signerWallet.substring(0, 8)}: ${tokenInfo.inputToken.symbol} → ${tokenInfo.outputToken.symbol}`);
      } else if (result.success) {
        // For fresh wallets without valid token info, create a default entry
        const defaultTokenInfo = {
          trade: 'Fresh Wallet Activity',
          inputToken: { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
          outputToken: { symbol: 'SPL', mint: 'SPL-Token' },
          amounts: 'Fresh wallet detected'
        };
        this.trackTokens(defaultTokenInfo, true);
      } else if (tokenInfo) {
        // Track failed wallets even with unknown tokens
        this.trackTokens(tokenInfo, false);
      }
      
      // Update statistics
      this.stats.totalWalletsDetected++;
      if (result.success) {
        this.stats.freshWalletsFound++;
        this.stats.lastDetectionTime = new Date().toISOString();
        console.log(`✅ FRESH WALLET FOUND: ${signerWallet.substring(0, 8)}... - ${result.reason}`);
      }
      
      // Save to database
      await this.saveWalletToDatabase(signerWallet, result, tokenInfo, swapSignature);
      
      // Emit to web dashboard
      this.emitToWebDashboard(result, tokenInfo);
      
      // Apply processing delay
      await this.sleep(this.processingDelay);
      
    } catch (error) {
      console.error(`Error processing wallet ${signerWallet}:`, error.message);
      this.stats.rpcErrors++;
    }
  }

  /**
   * Check if wallet is fresh (new user wallet)
   */
  async checkIfFreshWallet(walletAddress) {
    try {
      // Get account info
      const accountInfo = await this.rpcConnection.getAccountInfo(new PublicKey(walletAddress));
      
      if (!accountInfo) {
              return {
        success: false,
        reason: 'Account not found',
        address: walletAddress,
        timestamp: new Date().toISOString()
      };
      }
      
      // Check if it's an actual user wallet (not a program/token account)
      if (!this.isActualWallet(accountInfo, walletAddress)) {
        this.stats.nonUserAccountsSkipped++;
        return {
          success: false,
          reason: 'Not a user wallet',
          address: walletAddress,
          timestamp: new Date().toISOString()
        };
      }
      
      // Get wallet age and transaction count
      const ageCheck = await this.checkWalletAge(walletAddress);
      const txCount = await this.getTransactionCount(walletAddress);
      
      // Fresh wallet criteria: 0-24 hours old, ≤50 transactions
      const isFresh = ageCheck.hours <= 24 && txCount <= 50;
      
      return {
        success: isFresh,
        reason: isFresh ? 'Fresh wallet detected!' : 'Not fresh (too old or too many transactions)',
        address: walletAddress,  // Frontend expects 'address', not 'walletAddress'
        ageHours: ageCheck.hours,
        transactionCount: txCount,
        solBalance: accountInfo.lamports / 1e9,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`Error checking wallet freshness:`, error.message);
      return {
        success: false,
        reason: `Error: ${error.message}`,
        address: walletAddress,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check if account is an actual user wallet
   */
  isActualWallet(accountInfo, walletAddress) {
    try {
      // Check if it's owned by System Program (user wallets)
      const SYSTEM_PROGRAM = '11111111111111111111111111111111';
      if (accountInfo.owner.toBase58() !== SYSTEM_PROGRAM) {
        return false;
      }
      
      // Check if it has meaningful SOL balance (at least 0.001 SOL)
      const solBalance = accountInfo.lamports / 1e9;
      if (solBalance < 0.001) {
        return false;
      }
      
      // Check if data is empty (user wallets typically have no data)
      if (accountInfo.data && accountInfo.data.length > 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking if actual wallet:', error.message);
      return false;
    }
  }

  /**
   * Check wallet age by finding first transaction
   */
  async checkWalletAge(walletAddress) {
    try {
      const signatures = await this.rpcConnection.getSignaturesForAddress(
        new PublicKey(walletAddress),
        { limit: 1000 }
      );
      
      if (signatures.length === 0) {
        return { hours: 0 };
      }
      
      // Get the oldest transaction (last in the array)
      const oldestSignature = signatures[signatures.length - 1];
      const oldestTx = await this.rpcConnection.getTransaction(oldestSignature.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (oldestTx && oldestTx.blockTime) {
        const ageMs = Date.now() - (oldestTx.blockTime * 1000);
        const ageHours = ageMs / (1000 * 60 * 60);
        return { hours: ageHours };
      }
      
      return { hours: 0 };
    } catch (error) {
      console.error('Error checking wallet age:', error.message);
      return { hours: 999 }; // Assume old if we can't determine
    }
  }

  /**
   * Get transaction count for wallet
   */
  async getTransactionCount(walletAddress) {
    try {
      const signatures = await this.rpcConnection.getSignaturesForAddress(
        new PublicKey(walletAddress),
        { limit: 1000 }
      );
      
      return signatures.length;
    } catch (error) {
      console.error('Error getting transaction count:', error.message);
      return 999; // Assume high count if we can't determine
    }
  }

  /**
   * Check SOL balance of wallet
   */
  async getSOLBalance(walletAddress) {
    try {
      const balance = await this.rpcConnection.getBalance(new PublicKey(walletAddress));
      const solBalance = balance / 1e9; // Convert lamports to SOL
      return solBalance;
    } catch (error) {
      console.error('Error getting SOL balance:', error.message);
      return 0;
    }
  }

  /**
   * Track whale wallets
   */
  trackWhale(walletAddress, solBalance, tokenInfo, isFresh) {
    const timestamp = Date.now();
    const whaleEntry = {
      timestamp,
      address: walletAddress,
      solBalance: solBalance.toFixed(2),
      tokenInfo: tokenInfo || null,
      isFresh
    };
    
    // Add to all whales
    this.whaleTracker.all.push(whaleEntry);
    
    // Add to fresh whales if applicable
    if (isFresh) {
      this.whaleTracker.fresh.push(whaleEntry);
    }
    
    // Clean up old entries (keep only last 24 hours)
    const cutoff = timestamp - (24 * 60 * 60 * 1000);
    this.whaleTracker.all = this.whaleTracker.all.filter(entry => entry.timestamp > cutoff);
    this.whaleTracker.fresh = this.whaleTracker.fresh.filter(entry => entry.timestamp > cutoff);
    
    // Emit whale analytics
    this.emitWhaleAnalytics();
  }

  /**
   * Emit whale analytics to dashboard
   */
  emitWhaleAnalytics() {
    if (!this.io) return;
    
    const whaleAnalytics = {
      allWhales: this.whaleTracker.all.slice(-20), // Last 20 whales
      freshWhales: this.whaleTracker.fresh.slice(-20), // Last 20 fresh whales
      totalWhales: this.whaleTracker.all.length,
      totalFreshWhales: this.whaleTracker.fresh.length
    };
    
    console.log('📊 Emitting whale analytics:', {
      totalWhales: whaleAnalytics.totalWhales,
      totalFreshWhales: whaleAnalytics.totalFreshWhales,
      allWhalesCount: whaleAnalytics.allWhales.length,
      freshWhalesCount: whaleAnalytics.freshWhales.length
    });
    
    this.io.emit('whaleAnalytics', whaleAnalytics);
  }

  /**
   * Track tokens for analytics
   */
  trackTokens(tokenInfo, isSuccess) {
    if (!tokenInfo || !tokenInfo.inputToken || !tokenInfo.outputToken) {
      return;
    }
    
    const timestamp = Date.now();
    const tokenEntry = {
      timestamp,
      inputToken: {
        symbol: tokenInfo.inputToken.symbol,
        mint: tokenInfo.inputToken.mint
      },
      outputToken: {
        symbol: tokenInfo.outputToken.symbol,
        mint: tokenInfo.outputToken.mint
      }
    };
    
    // Add to all trades
    this.tokenTracker.all.push(tokenEntry);
    
    // Add to success or failed category
    if (isSuccess) {
      this.tokenTracker.success.push(tokenEntry);
    } else {
      this.tokenTracker.failed.push(tokenEntry);
    }
    
    // Clean up old entries (keep only last 24 hours)
    const cutoff = timestamp - (24 * 60 * 60 * 1000);
    this.tokenTracker.all = this.tokenTracker.all.filter(entry => entry.timestamp > cutoff);
    this.tokenTracker.success = this.tokenTracker.success.filter(entry => entry.timestamp > cutoff);
    this.tokenTracker.failed = this.tokenTracker.failed.filter(entry => entry.timestamp > cutoff);
    
    // Emit updated analytics
    this.emitTokenAnalytics();
  }

  /**
   * Get most traded tokens for a time window
   */
  getMostTradedTokens(category, minutes) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const trades = this.tokenTracker[category].filter(entry => entry.timestamp > cutoff);
    
    const tokenCounts = {};
    
    trades.forEach(entry => {
      // Count input tokens
      const inputKey = entry.inputToken.mint;
      if (!tokenCounts[inputKey]) {
        tokenCounts[inputKey] = {
          count: 0,
          symbol: entry.inputToken.symbol,
          mint: entry.inputToken.mint
        };
      }
      tokenCounts[inputKey].count += 1;
      
      // Count output tokens
      const outputKey = entry.outputToken.mint;
      if (!tokenCounts[outputKey]) {
        tokenCounts[outputKey] = {
          count: 0,
          symbol: entry.outputToken.symbol,
          mint: entry.outputToken.mint
        };
      }
      tokenCounts[outputKey].count += 1;
    });
    
    // Sort by count and return top 5
    return Object.values(tokenCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(token => ({
        inputToken: { 
          symbol: token.symbol,
          mint: token.mint
        },
        outputToken: { 
          symbol: token.symbol, 
          mint: token.mint
        },
        count: token.count,
        trade: `${token.symbol} Trading`
      }));
  }

  /**
   * Emit token analytics to dashboard
   */
  emitTokenAnalytics() {
    if (!this.io) return;
    
    const analytics = {
      all: {
        '5min': this.getMostTradedTokens('all', 5),
        '10min': this.getMostTradedTokens('all', 10),
        '20min': this.getMostTradedTokens('all', 20)
      },
      success: {
        '5min': this.getMostTradedTokens('success', 5),
        '10min': this.getMostTradedTokens('success', 10),
        '20min': this.getMostTradedTokens('success', 20)
      },
      failed: {
        '5min': this.getMostTradedTokens('failed', 5),
        '10min': this.getMostTradedTokens('failed', 10),
        '20min': this.getMostTradedTokens('failed', 20)
      }
    };
    
    console.log('📊 Emitting token analytics:', {
      all_5min: analytics.all['5min'].length,
      success_5min: analytics.success['5min'].length,
      failed_5min: analytics.failed['5min'].length,
      totalTokenEntries: this.tokenTracker.all.length + this.tokenTracker.success.length + this.tokenTracker.failed.length
    });
    
    this.io.emit('tokenAnalytics', analytics);
  }

  /**
   * Clear all cached data for fresh session start
   */
  clearAllCachedData() {
    console.log('🧹 Clearing all cached data for fresh start...');
    
    // Clear in-memory tracking data
    this.processedWallets.clear();
    this.tokenTracker = {
      all: [],
      success: [],
      failed: []
    };
    this.whaleTracker = {
      all: [],
      fresh: [],
      whaleThreshold: 100
    };
    
    // Reset statistics to zero
    this.stats = {
      totalWalletsDetected: 0,
      freshWalletsFound: 0,
      whalesFound: 0,
      freshWhalesFound: 0,
      duplicatesSkipped: 0,
      nonUserAccountsSkipped: 0,
      rpcErrors: 0,
      lastDetectionTime: null,
      uptime: this.sessionStartTime
    };
    
    this.checkCount = 0;
    this.lastResetTime = Date.now();
    
    console.log('✅ All cached data cleared - starting fresh session');
  }

  /**
   * Start analytics emission intervals
   */
  startAnalyticsIntervals() {
    // Clear all cached data first for fresh start
    this.clearAllCachedData();
    
    // Emit token analytics every 30 seconds
    setInterval(() => {
      this.emitTokenAnalytics();
    }, 30000);

    // Emit whale analytics every 30 seconds  
    setInterval(() => {
      this.emitWhaleAnalytics();
    }, 30000);

    // Emit initial analytics after 5 seconds (should be empty/zero)
    setTimeout(() => {
      this.emitTokenAnalytics();
      this.emitWhaleAnalytics();
    }, 5000);

    console.log('📊 Analytics intervals started - emitting every 30 seconds');
  }

  /**
   * Save wallet to database
   */
  async saveWalletToDatabase(walletAddress, result, tokenInfo, swapSignature) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO fresh_wallets 
        (wallet_address, age_hours, transaction_count, sol_balance, is_fresh, token_trade, swap_signature)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        walletAddress,
        result.ageHours || null,
        result.transactionCount || null,
        result.solBalance || null,
        result.success ? 1 : 0,
        tokenInfo ? tokenInfo.trade : null,
        swapSignature
      ];
      
      this.database.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Emit detection result to web dashboard
   */
  emitToWebDashboard(result, tokenInfo) {
    if (this.io) {
      // Emit separate events for fresh vs failed wallets
      const eventName = result.success ? 'freshWallet' : 'failedWallet';
      
      this.io.emit(eventName, {
        ...result,
        tokenInfo: tokenInfo || null
      });
      
      // Update stats
      this.io.emit('stats', this.stats);
    }
  }

  /**
   * Sleep utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const detector = new FreshWalletDetector();
  
  if (await detector.initialize()) {
    await detector.start();
  } else {
    console.error('Failed to initialize the detection system');
    process.exit(1);
  }
}

// Keep the process running
process.stdin.resume();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

main().catch(console.error);