/**
 * Wallet Filtering Demo
 * Shows how the new filtering system works
 */

console.log('🔍 === WALLET vs TOKEN ACCOUNT FILTERING ===\n');

console.log('❌ === WHAT WE NOW FILTER OUT ===');
console.log('1. 🪙 Token Accounts (SPL Token Program)');
console.log('   Example: CNcCK4ogPNqmz38rt5yqWXmJGvS7c2bDbGNRJjc8ppk');
console.log('   → BLOBO token account, NOT a user wallet');
console.log('');

console.log('2. 🔄 Associated Token Accounts (ATA)');
console.log('   Example: 4ofMhK9QLzdNAFUBXWAQ4qtNapzF7J1CRhZpzZn1qquk');  
console.log('   → Wrapped SOL token account, NOT a user wallet');
console.log('');

console.log('3. 🏗️ Program Derived Addresses (PDAs)');
console.log('   → Smart contract accounts, pool accounts, etc.');
console.log('');

console.log('4. 📊 Program Accounts');
console.log('   → Raydium pools, Jupiter accounts, Orca pools, etc.');
console.log('');

console.log('5. 💰 Insufficient Balance Accounts');
console.log('   → Accounts with less than minimum SOL threshold');
console.log('');

console.log('✅ === WHAT WE DETECT ===');
console.log('1. 👤 Actual User Wallets');
console.log('   → Owned by System Program (11111...)');
console.log('   → No program data');
console.log('   → Has SOL balance');
console.log('   → Example: 9WzDXwBnmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
console.log('');

console.log('🧠 === HOW IT WORKS ===');
console.log('1. 📥 Candidate address detected');
console.log('2. 🔍 Get account info from RPC');
console.log('3. 🏷️ Check account owner:');
console.log('   - System Program = ✅ Potential wallet');
console.log('   - Token Program = ❌ Token account');
console.log('   - Other Program = ❌ PDA/Program account');
console.log('4. 📄 Check account data:');
console.log('   - No data = ✅ Regular wallet');
console.log('   - Has data = ❌ Program/Token account');
console.log('5. 💵 Check SOL balance');
console.log('6. ✅ Confirmed as actual wallet!');
console.log('');

console.log('📊 === NEW STATISTICS ===');
console.log('You will now see filtering stats:');
console.log('🚫 Filtering Stats: {');
console.log('  tokenAccountsFiltered: 145,');
console.log('  pdaAccountsFiltered: 23,');
console.log('  programAccountsFiltered: 12,');
console.log('  insufficientBalanceFiltered: 8,');
console.log('  actualWalletsFound: 5');
console.log('}');
console.log('');

console.log('💡 This means:');
console.log('• 145 token accounts were filtered out');
console.log('• 23 PDAs were filtered out');
console.log('• 12 program accounts were filtered out');
console.log('• 8 accounts had insufficient balance');
console.log('• Only 5 ACTUAL wallets were detected');
console.log('');

console.log('🎯 === RESULT ===');
console.log('Instead of detecting hundreds of false positives,');
console.log('you now get only REAL user wallets!');
console.log('');

console.log('🚀 Ready to test the improved detection?');
console.log('Run: node src/index.js');