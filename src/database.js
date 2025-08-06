import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

/**
 * SQLite Database for storing discovered wallets and analytics
 */
export class WalletDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      console.log(`📁 Initializing database: ${this.dbPath}`);
      
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Create database connection
      this.db = new sqlite3.Database(this.dbPath);
      
      // Promisify database methods
      const originalRun = this.db.run.bind(this.db);
      this.db.run = (sql, params) => {
        return new Promise((resolve, reject) => {
          originalRun(sql, params, function(error) {
            if (error) {
              reject(error);
            } else {
              resolve({ changes: this.changes, lastID: this.lastID });
            }
          });
        });
      };
      
      this.db.get = promisify(this.db.get.bind(this.db));
      this.db.all = promisify(this.db.all.bind(this.db));
      
      // Create tables
      await this.createTables();
      
      this.isInitialized = true;
      console.log('✅ Database initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const createWalletsTable = `
      CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT UNIQUE NOT NULL,
        detection_method TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 0,
        sol_balance REAL DEFAULT 0,
        token_accounts INTEGER DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        tags TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}'
      )
    `;

    const createTransactionsTable = `
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        signature TEXT UNIQUE NOT NULL,
        slot INTEGER,
        block_time INTEGER,
        transaction_type TEXT,
        sol_amount REAL DEFAULT 0,
        fee REAL DEFAULT 0,
        success BOOLEAN DEFAULT 1,
        programs TEXT DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (wallet_address) REFERENCES wallets(address)
      )
    `;

    const createAnalyticsTable = `
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        wallets_detected INTEGER DEFAULT 0,
        total_wallets INTEGER DEFAULT 0,
        active_wallets INTEGER DEFAULT 0,
        total_transactions INTEGER DEFAULT 0,
        total_volume REAL DEFAULT 0,
        detection_methods TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(date)
      )
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
      CREATE INDEX IF NOT EXISTS idx_wallets_detection_method ON wallets(detection_method);
      CREATE INDEX IF NOT EXISTS idx_wallets_first_seen ON wallets(first_seen);
      CREATE INDEX IF NOT EXISTS idx_wallets_is_active ON wallets(is_active);
      CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(signature);
      CREATE INDEX IF NOT EXISTS idx_transactions_block_time ON transactions(block_time);
      CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date);
    `;

    try {
      await this.db.run(createWalletsTable);
      await this.db.run(createTransactionsTable);
      await this.db.run(createAnalyticsTable);
      await this.db.run(createIndexes);
      console.log('✅ Database tables created successfully');
    } catch (error) {
      console.error('❌ Failed to create database tables:', error);
      throw error;
    }
  }

  /**
   * Save a new wallet to the database
   */
  async saveWallet(walletData) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const {
      address,
      detectionMethod,
      firstSeen = Date.now(),
      isActive = false,
      solBalance = 0,
      tokenAccounts = 0,
      transactionCount = 0,
      tags = '',
      metadata = {}
    } = walletData;

    try {
      const query = `
        INSERT OR REPLACE INTO wallets 
        (address, detection_method, first_seen, last_updated, is_active, 
         sol_balance, token_accounts, transaction_count, tags, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        address,
        detectionMethod,
        firstSeen,
        Date.now(),
        isActive ? 1 : 0,
        solBalance,
        tokenAccounts,
        transactionCount,
        tags,
        JSON.stringify(metadata)
      ]);

      console.log(`💾 Wallet ${address} saved to database`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to save wallet ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific wallet by address
   */
  async getWallet(address) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      const query = 'SELECT * FROM wallets WHERE address = ?';
      const row = await this.db.get(query, [address]);
      
      if (row) {
        return {
          ...row,
          is_active: Boolean(row.is_active),
          metadata: JSON.parse(row.metadata || '{}')
        };
      }
      
      return null;

    } catch (error) {
      console.error(`❌ Failed to get wallet ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get all wallets
   */
  async getAllWallets(limit = null, offset = 0) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      let query = 'SELECT * FROM wallets ORDER BY first_seen DESC';
      const params = [];
      
      if (limit) {
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      const rows = await this.db.all(query, params);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        metadata: JSON.parse(row.metadata || '{}')
      }));

    } catch (error) {
      console.error('❌ Failed to get all wallets:', error);
      throw error;
    }
  }

  /**
   * Update wallet information
   */
  async updateWallet(address, updates) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      const setClause = [];
      const params = [];

      // Build dynamic update query
      for (const [key, value] of Object.entries(updates)) {
        switch (key) {
          case 'isActive':
            setClause.push('is_active = ?');
            params.push(value ? 1 : 0);
            break;
          case 'solBalance':
            setClause.push('sol_balance = ?');
            params.push(value);
            break;
          case 'tokenAccounts':
            setClause.push('token_accounts = ?');
            params.push(value);
            break;
          case 'transactionCount':
            setClause.push('transaction_count = ?');
            params.push(value);
            break;
          case 'tags':
            setClause.push('tags = ?');
            params.push(value);
            break;
          case 'metadata':
            setClause.push('metadata = ?');
            params.push(JSON.stringify(value));
            break;
        }
      }

      if (setClause.length === 0) {
        return false;
      }

      setClause.push('last_updated = ?');
      params.push(Date.now());
      params.push(address);

      const query = `UPDATE wallets SET ${setClause.join(', ')} WHERE address = ?`;
      const result = await this.db.run(query, params);

      return result.changes > 0;

    } catch (error) {
      console.error(`❌ Failed to update wallet ${address}:`, error);
      throw error;
    }
  }

  /**
   * Save transaction data
   */
  async saveTransaction(transactionData) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const {
      walletAddress,
      signature,
      slot,
      blockTime,
      transactionType,
      solAmount = 0,
      fee = 0,
      success = true,
      programs = []
    } = transactionData;

    try {
      const query = `
        INSERT OR REPLACE INTO transactions 
        (wallet_address, signature, slot, block_time, transaction_type, 
         sol_amount, fee, success, programs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        walletAddress,
        signature,
        slot,
        blockTime,
        transactionType,
        solAmount,
        fee,
        success ? 1 : 0,
        JSON.stringify(programs)
      ]);

      return true;

    } catch (error) {
      console.error(`❌ Failed to save transaction ${signature}:`, error);
      throw error;
    }
  }

  /**
   * Get wallet statistics
   */
  async getWalletStats() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      const totalQuery = 'SELECT COUNT(*) as total FROM wallets';
      const activeQuery = 'SELECT COUNT(*) as active FROM wallets WHERE is_active = 1';
      const recentQuery = `
        SELECT COUNT(*) as recent 
        FROM wallets 
        WHERE first_seen > ?
      `;
      const methodsQuery = `
        SELECT detection_method, COUNT(*) as count 
        FROM wallets 
        GROUP BY detection_method
      `;

      const [total, active, recent, methods] = await Promise.all([
        this.db.get(totalQuery),
        this.db.get(activeQuery),
        this.db.get(recentQuery, [Date.now() - 24 * 60 * 60 * 1000]), // Last 24h
        this.db.all(methodsQuery)
      ]);

      return {
        totalWallets: total.total,
        activeWallets: active.active,
        recentWallets: recent.recent,
        detectionMethods: methods.reduce((acc, row) => {
          acc[row.detection_method] = row.count;
          return acc;
        }, {})
      };

    } catch (error) {
      console.error('❌ Failed to get wallet stats:', error);
      throw error;
    }
  }

  /**
   * Save daily analytics
   */
  async saveDailyAnalytics(date, analyticsData) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      const query = `
        INSERT OR REPLACE INTO analytics 
        (date, wallets_detected, total_wallets, active_wallets, 
         total_transactions, total_volume, detection_methods)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        date,
        analyticsData.walletsDetected || 0,
        analyticsData.totalWallets || 0,
        analyticsData.activeWallets || 0,
        analyticsData.totalTransactions || 0,
        analyticsData.totalVolume || 0,
        JSON.stringify(analyticsData.detectionMethods || {})
      ]);

      return true;

    } catch (error) {
      console.error(`❌ Failed to save analytics for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get analytics for a date range
   */
  async getAnalytics(startDate, endDate = null) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      let query = 'SELECT * FROM analytics WHERE date >= ?';
      const params = [startDate];

      if (endDate) {
        query += ' AND date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY date DESC';

      const rows = await this.db.all(query, params);
      
      return rows.map(row => ({
        ...row,
        detection_methods: JSON.parse(row.detection_methods || '{}')
      }));

    } catch (error) {
      console.error('❌ Failed to get analytics:', error);
      throw error;
    }
  }

  /**
   * Search wallets by criteria
   */
  async searchWallets(criteria = {}) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    try {
      let query = 'SELECT * FROM wallets WHERE 1=1';
      const params = [];

      if (criteria.detectionMethod) {
        query += ' AND detection_method = ?';
        params.push(criteria.detectionMethod);
      }

      if (criteria.isActive !== undefined) {
        query += ' AND is_active = ?';
        params.push(criteria.isActive ? 1 : 0);
      }

      if (criteria.minBalance) {
        query += ' AND sol_balance >= ?';
        params.push(criteria.minBalance);
      }

      if (criteria.sinceDate) {
        query += ' AND first_seen >= ?';
        params.push(criteria.sinceDate);
      }

      query += ' ORDER BY first_seen DESC';

      if (criteria.limit) {
        query += ' LIMIT ?';
        params.push(criteria.limit);
      }

      const rows = await this.db.all(query, params);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        metadata: JSON.parse(row.metadata || '{}')
      }));

    } catch (error) {
      console.error('❌ Failed to search wallets:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((error) => {
          if (error) {
            console.error('❌ Failed to close database:', error);
            reject(error);
          } else {
            console.log('✅ Database connection closed');
            this.isInitialized = false;
            resolve();
          }
        });
      });
    }
  }
}