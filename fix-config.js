/**
 * Properly fix the configuration
 */
import fs from 'fs';

console.log('🔧 Properly fixing configuration...');

try {
  let envContent = fs.readFileSync('.env', 'utf8');
  
  // Fix the mixed-up lines
  envContent = envContent.replace(
    /TRACK_POPULAR_PROGRAMS=CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C/,
    'TRACK_POPULAR_PROGRAMS=true\n\n# Popular programs to monitor (comma-separated) - ONLY Raydium CPMM\nPOPULAR_PROGRAMS=CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
  );
  
  fs.writeFileSync('.env', envContent);
  console.log('✅ Configuration fixed properly!');
  
  // Verify
  const lines = envContent.split('\n');
  console.log('\n🎯 FINAL CONFIG:');
  lines.forEach(line => {
    if (line.startsWith('TRACK_') || line.startsWith('POPULAR_PROGRAMS=')) {
      console.log(`   ${line}`);
    }
  });
  
} catch (error) {
  console.error('❌ Error:', error.message);
}