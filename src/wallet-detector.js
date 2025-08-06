import { PublicKey, Connection } from '@solana/web3.js';

/**
 * New Wallet Detection Engine
 * Uses multiple strategies to identify brand new wallets on Solana
 */
export class WalletDetector {
  constructor(wsManager, database, config = {}) {
    this.wsManager = wsManager;
    this.database = database;
    
    // Set up RPC connection for account verification
    const heliusApiKey = process.env.HELIUS_API_KEY;
    const network = process.env.SOLANA_NETWORK || 'mainnet-beta';
    const rpcUrl = heliusApiKey 
      ? `https://${network}.helius-rpc.com/?api-key=${heliusApiKey}`
      : `https://api.${network}.solana.com`;
    
    this.rpcConnection = new Connection(rpcUrl, 'confirmed');
    
    this.config = {
      trackSystemProgram: config.trackSystemProgram ?? true,
      trackTokenProgram: config.trackTokenProgram ?? true,
      trackPopularPrograms: config.trackPopularPrograms ?? true,
      popularPrograms: config.popularPrograms || [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
        '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Orca
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',    // Token Program
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',    // Jupiter
        'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',    // Phoenix
      ],
      minSolThreshold: config.minSolThreshold || 0.001, // Minimum SOL to consider "active"
      batchSize: config.batchSize || 100,
      commitmentLevel: config.commitmentLevel || 'confirmed',
      
      // Rate limiting configuration
      maxDetectionsPerMinute: config.maxDetectionsPerMinute || 10, // Limit to 10 wallets per minute
      processingDelay: config.processingDelay || 2000, // 2 second delay between detections
      samplingRate: config.samplingRate || 0.1, // Only process 10% of candidates (1 in 10)
      enableThrottling: config.enableThrottling !== false
    };
    
    this.knownWallets = new Set();
    this.pendingWallets = new Map(); // Wallets we're waiting to confirm as "new"
    this.subscriptionIds = new Set();
    
    this.stats = {
      walletsDetected: 0,
      systemProgramEvents: 0,
      tokenProgramEvents: 0,
      popularProgramEvents: 0,
      falsePositives: 0,
      candidatesSkipped: 0,
      candidatesProcessed: 0,
      rateLimitHits: 0,
      
      // Account type filtering stats
      tokenAccountsFiltered: 0,
      pdaAccountsFiltered: 0,
      programAccountsFiltered: 0,
      insufficientBalanceFiltered: 0,
      actualWalletsFound: 0
    };
    
    // Rate limiting tracking
    this.detectionTimestamps = [];
    this.processingQueue = [];
    this.isProcessing = false;
    this.lastProcessingTime = 0;
    
    // Only setup event handlers if wsManager is available
    if (this.wsManager) {
      this.setupEventHandlers();
    }
  }

  /**
   * Initialize the wallet detector and start monitoring
   */
  async initialize() {
    console.log('🎯 Initializing Wallet Detector...');
    
    // Load known wallets from database
    await this.loadKnownWallets();
    
    // Start monitoring strategies
    if (this.config.trackSystemProgram) {
      await this.startSystemProgramMonitoring();
    }
    
    if (this.config.trackTokenProgram) {
      await this.startTokenProgramMonitoring();
    }
    
    if (this.config.trackPopularPrograms) {
      await this.startPopularProgramsMonitoring();
    }
    
    console.log(`🚀 Wallet Detector initialized with ${this.knownWallets.size} known wallets`);
  }

  /**
   * Setup event handlers for WebSocket notifications
   */
  setupEventHandlers() {
    this.wsManager.on('notification', (notification) => {
      this.handleNotification(notification);
    });
    
    this.wsManager.on('connected', () => {
      console.log('🔄 WebSocket reconnected, wallet detector active');
    });
    
    this.wsManager.on('disconnected', () => {
      console.log('⚠️ WebSocket disconnected, wallet detector paused');
    });
  }

  /**
   * Load known wallets from database to avoid false positives
   */
  async loadKnownWallets() {
    try {
      const wallets = await this.database.getAllWallets();
      this.knownWallets = new Set(wallets.map(w => w.address));
      console.log(`📚 Loaded ${this.knownWallets.size} known wallets from database`);
    } catch (error) {
      console.error('❌ Failed to load known wallets:', error);
    }
  }

  /**
   * Monitor System Program for account creation and first SOL transfers
   */
  async startSystemProgramMonitoring() {
    console.log('👀 Starting System Program monitoring...');
    
    try {
      const subscriptionId = await this.wsManager.subscribe(
        'logsSubscribe',
        [
          {
            mentions: ['11111111111111111111111111111111'] // System Program
          },
          {
            commitment: this.config.commitmentLevel
          }
        ]
      );
      
      this.subscriptionIds.add(subscriptionId);
      console.log(`✅ System Program subscription active: ${subscriptionId}`);
    } catch (error) {
      console.error('❌ Failed to subscribe to System Program:', error);
    }
  }

  /**
   * Monitor Token Program for first token interactions
   */
  async startTokenProgramMonitoring() {
    console.log('🪙 Starting Token Program monitoring...');
    
    try {
      const subscriptionId = await this.wsManager.subscribe(
        'programSubscribe',
        [
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          {
            encoding: 'jsonParsed',
            commitment: this.config.commitmentLevel,
            filters: [
              {
                dataSize: 165 // Token account size
              }
            ]
          }
        ]
      );
      
      this.subscriptionIds.add(subscriptionId);
      console.log(`✅ Token Program subscription active: ${subscriptionId}`);
    } catch (error) {
      console.error('❌ Failed to subscribe to Token Program:', error);
    }
  }

  /**
   * Monitor popular programs for first-time interactions
   */
  async startPopularProgramsMonitoring() {
    console.log('🔥 Starting popular programs monitoring...');
    
    for (const programId of this.config.popularPrograms) {
      try {
        const subscriptionId = await this.wsManager.subscribe(
          'programSubscribe',
          [
            programId,
            {
              encoding: 'base64',
              commitment: this.config.commitmentLevel
            }
          ]
        );
        
        this.subscriptionIds.add(subscriptionId);
        console.log(`✅ Program subscription active: ${programId}`);
        
        // Rate limiting between subscriptions
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ Failed to subscribe to program ${programId}:`, error);
      }
    }
  }

  /**
   * Handle incoming WebSocket notifications
   */
  async handleNotification(notification) {
    try {
      switch (notification.method) {
        case 'logsNotification':
          await this.handleLogsNotification(notification.params);
          break;
        case 'programNotification':
          await this.handleProgramNotification(notification.params);
          break;
        case 'accountNotification':
          await this.handleAccountNotification(notification.params);
          break;
        default:
          // Handle other notification types
          break;
      }
    } catch (error) {
      console.error('❌ Error handling notification:', error);
    }
  }

  /**
   * Handle log notifications (primarily for System Program events)
   */
  async handleLogsNotification(params) {
    this.stats.systemProgramEvents++;
    
    const { result } = params;
    const signature = result.value.signature;
    const logs = result.value.logs;
    
    // Look for account creation patterns in logs
    const isAccountCreation = logs.some(log => 
      log.includes('Program 11111111111111111111111111111111 invoke') &&
      (log.includes('CreateAccount') || log.includes('Allocate'))
    );
    
    if (isAccountCreation) {
      // Get transaction details to extract new account addresses
      await this.processTransactionForNewWallets(signature);
    }
  }

  /**
   * Handle program notifications
   */
  async handleProgramNotification(params) {
    const { result } = params;
    const accountPubkey = result.value.pubkey;
    
    // Check if this is a new wallet we haven't seen before
    if (!this.knownWallets.has(accountPubkey)) {
      await this.analyzeNewWalletCandidate(accountPubkey, 'program_interaction');
    }
    
    this.stats.popularProgramEvents++;
  }

  /**
   * Handle account notifications
   */
  async handleAccountNotification(params) {
    const { result } = params;
    const { value } = result;
    
    if (value && value.lamports > 0) {
      // Account has SOL balance - might be a new wallet
      const accountPubkey = result.value.pubkey;
      
      if (!this.knownWallets.has(accountPubkey)) {
        await this.analyzeNewWalletCandidate(accountPubkey, 'balance_change');
      }
    }
  }

  /**
   * Process a transaction to find new wallet addresses
   */
  async processTransactionForNewWallets(signature) {
    try {
      // Note: In a full implementation, you'd use getTransaction RPC call
      // For now, we'll use a placeholder approach
      console.log(`🔍 Processing transaction ${signature} for new wallets`);
      
      // This would involve:
      // 1. Getting transaction details
      // 2. Extracting all account addresses
      // 3. Checking preBalances vs postBalances
      // 4. Identifying newly funded accounts
      
    } catch (error) {
      console.error(`❌ Failed to process transaction ${signature}:`, error);
    }
  }

  /**
   * Analyze a potential new wallet candidate (with throttling)
   */
  async analyzeNewWalletCandidate(address, detectionMethod) {
    try {
      // Validate address format
      if (!this.isValidSolanaAddress(address)) {
        return false;
      }
      
      // Skip if we already know this wallet
      if (this.knownWallets.has(address)) {
        this.stats.falsePositives++;
        return false;
      }
      
      // Skip if already being processed
      if (this.pendingWallets.has(address)) {
        return false;
      }
      
      // Apply throttling if enabled
      if (this.config.enableThrottling) {
        // Sampling: Skip random wallets based on sampling rate
        if (Math.random() > this.config.samplingRate) {
          this.stats.candidatesSkipped++;
          return false;
        }
        
        // Rate limiting: Check if we've exceeded max detections per minute
        if (!this.checkRateLimit()) {
          this.stats.rateLimitHits++;
          console.log(`⏸️ Rate limit reached, queuing wallet for later processing...`);
          this.queueForLaterProcessing(address, detectionMethod);
          return false;
        }
        
        // Processing delay: Wait if we processed something recently
        const timeSinceLastProcessing = Date.now() - this.lastProcessingTime;
        if (timeSinceLastProcessing < this.config.processingDelay) {
          const waitTime = this.config.processingDelay - timeSinceLastProcessing;
          console.log(`⏳ Waiting ${waitTime}ms before processing next wallet...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      this.stats.candidatesProcessed++;
      this.lastProcessingTime = Date.now();
      
      console.log(`🕵️ Analyzing potential new wallet: ${address} (via ${detectionMethod})`);
      
      // Add to pending analysis
      this.pendingWallets.set(address, {
        detectionMethod,
        firstSeen: Date.now(),
        confirmedNew: false
      });
      
      // Perform additional verification
      const isConfirmedNew = await this.verifyNewWallet(address);
      
      if (isConfirmedNew) {
        await this.registerNewWallet(address, detectionMethod);
        this.trackDetection();
      } else {
        this.pendingWallets.delete(address);
        this.stats.falsePositives++;
      }
      
    } catch (error) {
      console.error(`❌ Error analyzing wallet candidate ${address}:`, error);
      this.pendingWallets.delete(address);
    }
  }

  /**
   * Verify if a wallet is truly new (and actually a wallet, not a token account)
   */
  async verifyNewWallet(address) {
    try {
      // Check database first (if still initialized)
      if (!this.database || !this.database.db) {
        console.log(`⚠️ Database not available for verification: ${address}`);
        return false;
      }
      
      const existingWallet = await this.database.getWallet(address);
      if (existingWallet) {
        this.knownWallets.add(address);
        return false;
      }
      
      // Get account info to verify it's actually a wallet
      const accountInfo = await this.rpcConnection.getAccountInfo(new PublicKey(address));
      
      if (!accountInfo) {
        console.log(`⚠️ Account ${address} does not exist on-chain`);
        return false;
      }
      
      // Filter out token accounts and PDAs
      if (!this.isActualWallet(accountInfo, address)) {
        console.log(`⚠️ Account ${address} is not a user wallet (token account/PDA)`);
        this.stats.falsePositives++;
        return false;
      }
      
      // Check if account has any SOL balance (actual wallets usually have some SOL)
      const minSolLamports = this.config.minSolThreshold * 1000000000;
      if (accountInfo.lamports < minSolLamports) {
        console.log(`⚠️ Account ${address} has insufficient SOL balance (${accountInfo.lamports / 1000000000} SOL)`);
        this.stats.insufficientBalanceFiltered++;
        return false;
      }
      
      console.log(`✅ Verified as actual wallet: ${address} (${accountInfo.lamports / 1000000000} SOL)`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error verifying wallet ${address}:`, error);
      return false;
    }
  }

  /**
   * Check if an account is actually a user wallet (not a token account or PDA)
   */
  isActualWallet(accountInfo, address) {
    try {
      // System Program accounts (regular wallets) have no data and are owned by System Program
      const SYSTEM_PROGRAM = '11111111111111111111111111111111';
      const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const SPL_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
      const SPL_ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
      
      const owner = accountInfo.owner.toString();
      
      // 1. System Program accounts (regular wallets) - GOOD
      if (owner === SYSTEM_PROGRAM) {
        // Should have no data (empty account)
        if (!accountInfo.data || accountInfo.data.length === 0) {
          console.log(`✅ System account (wallet): ${address}`);
          return true;
        }
      }
      
      // 2. Token accounts - BAD (these are what we want to filter out)
      if (owner === SPL_TOKEN_PROGRAM || owner === SPL_TOKEN_2022_PROGRAM) {
        console.log(`❌ Token account detected: ${address} (owner: ${owner})`);
        this.stats.tokenAccountsFiltered++;
        return false;
      }
      
      // 3. Associated Token Account Program - BAD
      if (owner === SPL_ATA_PROGRAM) {
        console.log(`❌ ATA program account detected: ${address}`);
        this.stats.tokenAccountsFiltered++;
        return false;
      }
      
      // 4. Program Derived Addresses (PDAs) typically have program owners - BAD
      if (accountInfo.data && accountInfo.data.length > 0) {
        // Check if it's a known program account
        const knownProgramOwners = [
          'SysvarRent111111111111111111111111111111111',
          'SysvarC1ock11111111111111111111111111111111',
          'Vote111111111111111111111111111111111111111',
          'Stake11111111111111111111111111111111111111',
          '9WzDXwBnmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Raydium
          'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',    // Jupiter
          'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',    // Phoenix
          'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',    // Whirlpool
        ];
        
        if (knownProgramOwners.includes(owner)) {
          console.log(`❌ Known program account detected: ${address} (owner: ${owner})`);
          this.stats.programAccountsFiltered++;
          return false;
        }
        
        // If it has data and an unknown program owner, it's likely a PDA
        console.log(`❌ Likely PDA detected: ${address} (owner: ${owner}, data length: ${accountInfo.data.length})`);
        this.stats.pdaAccountsFiltered++;
        return false;
      }
      
      // 5. Account with SOL but owned by System Program and has data - suspicious
      if (owner === SYSTEM_PROGRAM && accountInfo.data && accountInfo.data.length > 0) {
        console.log(`⚠️ System account with data: ${address} (might be initialized account)`);
        this.stats.pdaAccountsFiltered++;
        return false;
      }
      
      // 6. If we get here, it's likely a regular wallet
      console.log(`✅ Likely user wallet: ${address} (owner: ${owner})`);
      this.stats.actualWalletsFound++;
      return true;
      
    } catch (error) {
      console.error(`❌ Error checking account type for ${address}:`, error);
      return false;
    }
  }

  /**
   * Register a confirmed new wallet
   */
  async registerNewWallet(address, detectionMethod) {
    try {
      console.log(`🎉 NEW WALLET DETECTED: ${address} (via ${detectionMethod})`);
      
      const walletData = {
        address,
        detectionMethod,
        firstSeen: Date.now(),
        isActive: false,
        solBalance: 0,
        tokenAccounts: 0,
        transactionCount: 0
      };
      
      // Save to database (if still available)
      if (this.database && this.database.db) {
        await this.database.saveWallet(walletData);
      } else {
        console.log(`⚠️ Database not available, wallet not saved: ${address}`);
      }
      
      // Add to known wallets set
      this.knownWallets.add(address);
      
      // Remove from pending
      this.pendingWallets.delete(address);
      
      // Update stats
      this.stats.walletsDetected++;
      
      // Emit event for external handlers
      this.wsManager.emit('newWalletDetected', walletData);
      
      console.log(`💾 Wallet ${address} saved to database`);
      
    } catch (error) {
      console.error(`❌ Failed to register new wallet ${address}:`, error);
    }
  }

  /**
   * Validate Solana address format
   */
  isValidSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current detection statistics
   */
  getStats() {
    return {
      ...this.stats,
      knownWallets: this.knownWallets.size,
      pendingAnalysis: this.pendingWallets.size,
      activeSubscriptions: this.subscriptionIds.size
    };
  }

  /**
   * Stop all monitoring
   */
  async stop() {
    console.log('🛑 Stopping wallet detector...');
    
    for (const subscriptionId of this.subscriptionIds) {
      try {
        await this.wsManager.unsubscribe(subscriptionId);
      } catch (error) {
        console.error(`❌ Failed to unsubscribe ${subscriptionId}:`, error);
      }
    }
    
    this.subscriptionIds.clear();
    this.pendingWallets.clear();
    
    console.log('✅ Wallet detector stopped');
  }

  /**
   * Check if we're within the rate limit
   */
  checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old timestamps
    this.detectionTimestamps = this.detectionTimestamps.filter(time => time > oneMinuteAgo);
    
    // Check if we're under the limit
    return this.detectionTimestamps.length < this.config.maxDetectionsPerMinute;
  }
  
  /**
   * Track a detection for rate limiting
   */
  trackDetection() {
    this.detectionTimestamps.push(Date.now());
  }
  
  /**
   * Queue wallet for later processing when rate limited
   */
  queueForLaterProcessing(address, detectionMethod) {
    this.processingQueue.push({ address, detectionMethod, queuedAt: Date.now() });
    
    // Start processing queue if not already running
    if (!this.isProcessing) {
      this.startQueueProcessor();
    }
  }
  
  /**
   * Start processing the queued wallets
   */
  startQueueProcessor() {
    this.isProcessing = true;
    
    const processNext = async () => {
      if (this.processingQueue.length === 0) {
        this.isProcessing = false;
        return;
      }
      
      // Check if we can process now
      if (this.checkRateLimit()) {
        const { address, detectionMethod } = this.processingQueue.shift();
        console.log(`🔄 Processing queued wallet: ${address}`);
        await this.analyzeNewWalletCandidate(address, detectionMethod);
      }
      
      // Schedule next check
      setTimeout(processNext, 5000); // Check every 5 seconds
    };
    
    // Start processing in 5 seconds
    setTimeout(processNext, 5000);
  }
  
  /**
   * Get throttling statistics
   */
  getThrottlingStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentDetections = this.detectionTimestamps.filter(time => time > oneMinuteAgo).length;
    
    return {
      recentDetections,
      maxPerMinute: this.config.maxDetectionsPerMinute,
      queueLength: this.processingQueue.length,
      candidatesSkipped: this.stats.candidatesSkipped,
      candidatesProcessed: this.stats.candidatesProcessed,
      rateLimitHits: this.stats.rateLimitHits,
      samplingRate: this.config.samplingRate,
      processingDelay: this.config.processingDelay
    };
  }

  /**
   * Get pending wallets for debugging
   */
  getPendingWallets() {
    return Array.from(this.pendingWallets.entries()).map(([address, data]) => ({
      address,
      ...data
    }));
  }
}