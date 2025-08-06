import { WalletDatabase } from './database.js';

/**
 * Quick script to query and display all detected wallets
 */
async function showAllResults() {
  console.log('📊 Querying all detected wallets...\n');
  
  const db = new WalletDatabase('./data/wallets.db');
  await db.initialize();
  
  try {
    // Get statistics
    const stats = await db.getWalletStats();
    console.log('📈 === WALLET STATISTICS ===');
    console.log(`Total Wallets: ${stats.totalWallets.toLocaleString()}`);
    console.log(`Active Wallets: ${stats.activeWallets.toLocaleString()}`);
    console.log('\nDetection Methods:');
    for (const [method, count] of Object.entries(stats.detectionMethods)) {
      console.log(`  ${method}: ${count.toLocaleString()}`);
    }
    
    // Get recent wallets
    console.log('\n🎯 === RECENT WALLETS (Last 20) ===');
    const recentWallets = await db.getAllWallets(20);
    
    recentWallets.forEach((wallet, index) => {
      const time = new Date(wallet.first_seen).toLocaleString();
      console.log(`${index + 1}. ${wallet.address}`);
      console.log(`   Method: ${wallet.detection_method}`);
      console.log(`   First Seen: ${time}`);
      console.log(`   Active: ${wallet.is_active ? '✅' : '❌'}`);
      console.log('');
    });
    
    // Get today's wallets
    const today = new Date().toISOString().split('T')[0];
    const todayWallets = await db.searchWallets({
      sinceDate: new Date(today).getTime()
    });
    
    console.log(`📅 === TODAY'S DISCOVERIES ===`);
    console.log(`Total discovered today: ${todayWallets.length.toLocaleString()}`);
    
    if (todayWallets.length > 0) {
      console.log('\nFirst 10 from today:');
      todayWallets.slice(0, 10).forEach((wallet, index) => {
        const time = new Date(wallet.first_seen).toLocaleTimeString();
        console.log(`${index + 1}. ${wallet.address} (${time})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error querying database:', error);
  } finally {
    await db.close();
  }
}

// Run the query
showAllResults().catch(console.error);