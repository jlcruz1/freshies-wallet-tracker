/**
 * Throttling Configuration Demo
 * Shows different throttling presets you can use
 */

console.log('🎛️ === FRESHIES THROTTLING PRESETS ===\n');

const presets = {
  'conservative': {
    name: '🐌 Conservative (Very Slow)',
    description: 'Perfect for testing and demos',
    settings: {
      MAX_DETECTIONS_PER_MINUTE: 5,
      PROCESSING_DELAY: 5000,
      SAMPLING_RATE: 0.05 // 5% of candidates
    }
  },
  
  'moderate': {
    name: '⚡ Moderate (Current)',
    description: 'Good balance for production use',
    settings: {
      MAX_DETECTIONS_PER_MINUTE: 10,
      PROCESSING_DELAY: 2000,
      SAMPLING_RATE: 0.1 // 10% of candidates
    }
  },
  
  'active': {
    name: '🔥 Active',
    description: 'More discoveries, still manageable',
    settings: {
      MAX_DETECTIONS_PER_MINUTE: 20,
      PROCESSING_DELAY: 1000,
      SAMPLING_RATE: 0.2 // 20% of candidates
    }
  },
  
  'aggressive': {
    name: '🚀 Aggressive',
    description: 'High throughput (may cause lag)',
    settings: {
      MAX_DETECTIONS_PER_MINUTE: 50,
      PROCESSING_DELAY: 500,
      SAMPLING_RATE: 0.5 // 50% of candidates
    }
  },
  
  'unlimited': {
    name: '💥 Unlimited (Original)',
    description: 'No throttling - catch everything',
    settings: {
      ENABLE_THROTTLING: false,
      MAX_DETECTIONS_PER_MINUTE: 1000,
      PROCESSING_DELAY: 0,
      SAMPLING_RATE: 1.0 // 100% of candidates
    }
  }
};

Object.entries(presets).forEach(([key, preset]) => {
  console.log(`${preset.name}`);
  console.log(`Description: ${preset.description}`);
  console.log('Settings:');
  Object.entries(preset.settings).forEach(([setting, value]) => {
    console.log(`  ${setting}=${value}`);
  });
  console.log('');
});

console.log('📝 === HOW TO APPLY ===');
console.log('1. Edit your .env file');
console.log('2. Copy the settings you want');
console.log('3. Restart Freshies');
console.log('');

console.log('💡 === WHAT EACH SETTING DOES ===');
console.log('MAX_DETECTIONS_PER_MINUTE: Maximum wallets to process per minute');
console.log('PROCESSING_DELAY: Milliseconds to wait between each wallet');
console.log('SAMPLING_RATE: Fraction of candidates to analyze (0.1 = 10%)');
console.log('ENABLE_THROTTLING: Turn throttling on/off');
console.log('');

console.log('🎯 === CURRENT SETTINGS ===');
import dotenv from 'dotenv';
dotenv.config();

console.log(`ENABLE_THROTTLING=${process.env.ENABLE_THROTTLING || 'true'}`);
console.log(`MAX_DETECTIONS_PER_MINUTE=${process.env.MAX_DETECTIONS_PER_MINUTE || '10'}`);
console.log(`PROCESSING_DELAY=${process.env.PROCESSING_DELAY || '2000'}`);
console.log(`SAMPLING_RATE=${process.env.SAMPLING_RATE || '0.1'}`);
console.log('');

console.log('🔄 To change settings, edit .env file and restart the system!');