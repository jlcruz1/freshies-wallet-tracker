import { HeliusWebSocketManager } from './helius-websocket.js';
import { WalletDatabase } from './database.js';
import { SolanaMCPIntegration } from './mcp-integration.js';

/**
 * Simple test suite for Freshies components
 */
class FreshiesTest {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Add a test case
   */
  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  /**
   * Run all tests
   */
  async runAll() {
    console.log('🧪 Running Freshies Test Suite...\n');
    
    for (const test of this.tests) {
      try {
        console.log(`🔍 Testing: ${test.name}`);
        await test.testFn();
        console.log(`✅ PASSED: ${test.name}\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAILED: ${test.name}`);
        console.log(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }
    
    this.printSummary();
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('📊 === TEST SUMMARY ===');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📝 Total: ${this.tests.length}`);
    console.log(`🎯 Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
    console.log('======================\n');
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
}

// Create test instance
const test = new FreshiesTest();

// Test Database Initialization
test.addTest('Database Initialization', async () => {
  const db = new WalletDatabase(':memory:'); // Use in-memory DB for testing
  await db.initialize();
  
  test.assert(db.isInitialized, 'Database should be initialized');
  
  await db.close();
});

// Test Database Operations
test.addTest('Database Wallet Operations', async () => {
  const db = new WalletDatabase(':memory:');
  await db.initialize();
  
  // Test wallet creation
  const walletData = {
    address: 'DemoWallet1234567890123456789012345678',
    detectionMethod: 'test',
    firstSeen: Date.now()
  };
  
  const saved = await db.saveWallet(walletData);
  test.assert(saved, 'Wallet should be saved successfully');
  
  // Test wallet retrieval
  const retrieved = await db.getWallet(walletData.address);
  test.assert(retrieved !== null, 'Wallet should be retrievable');
  test.assert(retrieved.address === walletData.address, 'Retrieved wallet should match saved wallet');
  
  // Test wallet update
  const updated = await db.updateWallet(walletData.address, {
    isActive: true,
    solBalance: 1.5
  });
  test.assert(updated, 'Wallet should be updated successfully');
  
  // Test wallet stats
  const stats = await db.getWalletStats();
  test.assert(stats.totalWallets === 1, 'Stats should show 1 wallet');
  
  await db.close();
});

// Test WebSocket Manager Configuration
test.addTest('WebSocket Manager Configuration', async () => {
  const config = {
    apiKey: 'test-key',
    network: 'devnet',
    maxRetries: 5
  };
  
  const wsManager = new HeliusWebSocketManager(config);
  
  test.assert(wsManager.config.apiKey === 'test-key', 'API key should be set');
  test.assert(wsManager.config.network === 'devnet', 'Network should be set');
  test.assert(wsManager.config.maxRetries === 5, 'Max retries should be set');
  
  const url = wsManager.getWebSocketUrl();
  test.assert(url.includes('devnet'), 'URL should include devnet');
  test.assert(url.includes('test-key'), 'URL should include API key');
});

// Test MCP Integration
test.addTest('MCP Integration Initialization', async () => {
  const mcp = new SolanaMCPIntegration({
    enableEnhancedAnalysis: true,
    cacheTimeout: 60000
  });
  
  await mcp.initialize();
  
  test.assert(mcp.config.enableEnhancedAnalysis === true, 'Enhanced analysis should be enabled');
  test.assert(mcp.config.cacheTimeout === 60000, 'Cache timeout should be set');
});

// Test MCP Wallet Analysis
test.addTest('MCP Wallet Analysis', async () => {
  const mcp = new SolanaMCPIntegration({});
  await mcp.initialize();
  
  const testAddress = 'DemoWallet1234567890123456789012345678';
  const analysis = await mcp.analyzeWalletCharacteristics(testAddress);
  
  test.assert(typeof analysis === 'object', 'Analysis should return an object');
  test.assert(typeof analysis.riskScore === 'number', 'Analysis should include risk score');
  test.assert(typeof analysis.walletType === 'string', 'Analysis should include wallet type');
  test.assert(typeof analysis.activityLevel === 'string', 'Analysis should include activity level');
});

// Test MCP Enhanced Verification
test.addTest('MCP Enhanced Verification', async () => {
  const mcp = new SolanaMCPIntegration({});
  await mcp.initialize();
  
  const testAddress = 'DemoWallet1234567890123456789012345678';
  const verification = await mcp.enhancedWalletVerification(testAddress, 'test');
  
  test.assert(typeof verification === 'object', 'Verification should return an object');
  test.assert(typeof verification.isVerified === 'boolean', 'Verification should include isVerified flag');
  test.assert(typeof verification.verificationScore === 'number', 'Verification should include score');
  test.assert(Array.isArray(verification.verificationReasons), 'Verification should include reasons array');
});

// Test Configuration Validation
test.addTest('Configuration Validation', async () => {
  // Test valid configuration
  const validConfig = {
    helius: { apiKey: 'test-key', network: 'mainnet' },
    detection: { trackSystemProgram: true }
  };
  
  test.assert(validConfig.helius.apiKey === 'test-key', 'Valid config should have API key');
  test.assert(validConfig.helius.network === 'mainnet', 'Valid config should have network');
  
  // Test default values
  const wsManager = new HeliusWebSocketManager({ apiKey: 'test' });
  test.assert(wsManager.config.network === 'mainnet', 'Should default to mainnet');
  test.assert(wsManager.config.maxRetries === 10, 'Should have default max retries');
});

// Test Utility Functions
test.addTest('Utility Functions', async () => {
  const wsManager = new HeliusWebSocketManager({ apiKey: 'test' });
  
  // Test URL generation
  const url = wsManager.getWebSocketUrl();
  test.assert(typeof url === 'string', 'URL should be a string');
  test.assert(url.startsWith('wss://'), 'URL should use secure WebSocket protocol');
  
  // Test status object
  const status = wsManager.getStatus();
  test.assert(typeof status === 'object', 'Status should be an object');
  test.assert(typeof status.connected === 'boolean', 'Status should include connected flag');
  test.assert(typeof status.activeSubscriptions === 'number', 'Status should include subscription count');
});

// Test Error Handling
test.addTest('Error Handling', async () => {
  // Test database with invalid path
  try {
    const db = new WalletDatabase('/invalid/path/database.db');
    await db.initialize();
    test.assert(false, 'Should throw error for invalid database path');
  } catch (error) {
    test.assert(error instanceof Error, 'Should throw proper error');
  }
  
  // Test MCP with invalid configuration
  const mcp = new SolanaMCPIntegration({});
  const analysis = await mcp.analyzeWalletCharacteristics('invalid-address');
  test.assert(typeof analysis === 'object', 'Should handle invalid addresses gracefully');
});

// Test Cache Functionality
test.addTest('MCP Cache Functionality', async () => {
  const mcp = new SolanaMCPIntegration({ cacheTimeout: 1000 });
  await mcp.initialize();
  
  const testAddress = 'DemoWallet1234567890123456789012345678';
  
  // First call (should cache)
  const analysis1 = await mcp.analyzeWalletCharacteristics(testAddress);
  test.assert(mcp.cache.size > 0, 'Cache should contain entries after analysis');
  
  // Second call (should use cache)
  const analysis2 = await mcp.analyzeWalletCharacteristics(testAddress);
  test.assert(JSON.stringify(analysis1) === JSON.stringify(analysis2), 'Cached results should be identical');
  
  // Test cache stats
  const stats = mcp.getCacheStats();
  test.assert(typeof stats.cacheSize === 'number', 'Cache stats should include size');
  test.assert(typeof stats.cacheTimeout === 'number', 'Cache stats should include timeout');
  
  // Clear cache
  mcp.clearCache();
  test.assert(mcp.cache.size === 0, 'Cache should be empty after clearing');
});

// Run all tests
async function main() {
  try {
    await test.runAll();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (process.argv[1] && process.argv[1].endsWith('test.js')) {
  main();
}

export { FreshiesTest };