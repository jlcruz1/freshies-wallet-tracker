// Vercel serverless function for wallet data
import { Connection, PublicKey } from '@solana/web3.js';

let rpcConnection;

// Initialize connection
function getRPCConnection() {
    if (!rpcConnection) {
        const heliusApiKey = process.env.HELIUS_API_KEY;
        if (!heliusApiKey) {
            throw new Error('HELIUS_API_KEY not found');
        }
        rpcConnection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`);
    }
    return rpcConnection;
}

// Check if wallet is fresh (simplified for serverless)
async function checkWalletAge(walletAddress) {
    try {
        const connection = getRPCConnection();
        const publicKey = new PublicKey(walletAddress);
        
        // Get recent transactions
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 50 });
        
        if (signatures.length === 0) {
            return { 
                success: false, 
                reason: 'No transactions found',
                transactionCount: 0,
                ageHours: null
            };
        }

        // Check age of oldest transaction
        const oldestSignature = signatures[signatures.length - 1];
        const oldestTx = await connection.getTransaction(oldestSignature.signature, {
            maxSupportedTransactionVersion: 0
        });

        if (!oldestTx) {
            return { 
                success: false, 
                reason: 'Could not fetch transaction details',
                transactionCount: signatures.length,
                ageHours: null
            };
        }

        const ageHours = (Date.now() - (oldestTx.blockTime * 1000)) / (1000 * 60 * 60);
        const transactionCount = signatures.length;

        // Fresh criteria: less than 24 hours old and less than 50 transactions
        const isFresh = ageHours <= 24 && transactionCount <= 50;

        return {
            success: isFresh,
            reason: isFresh ? 'Fresh wallet detected' : `Too old (${ageHours.toFixed(1)}h) or too many txs (${transactionCount})`,
            transactionCount,
            ageHours,
            address: walletAddress
        };

    } catch (error) {
        return { 
            success: false, 
            reason: `Error: ${error.message}`,
            transactionCount: 0,
            ageHours: null
        };
    }
}

// Get SOL balance
async function getSOLBalance(walletAddress) {
    try {
        const connection = getRPCConnection();
        const publicKey = new PublicKey(walletAddress);
        const balance = await connection.getBalance(publicKey);
        return balance / 1000000000; // Convert lamports to SOL
    } catch (error) {
        console.error('Error getting SOL balance:', error);
        return 0;
    }
}

async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'Fresh Wallet API is running',
            timestamp: new Date().toISOString(),
            endpoints: {
                'POST /api/wallet-data': 'Check if wallet is fresh',
                'GET /api/stats': 'Get system statistics'
            }
        });
    }

    if (req.method === 'POST') {
        try {
            const { walletAddress } = req.body;

            if (!walletAddress) {
                return res.status(400).json({ error: 'walletAddress is required' });
            }

            // Check if wallet is fresh
            const walletResult = await checkWalletAge(walletAddress);
            
            // Get SOL balance
            const solBalance = await getSOLBalance(walletAddress);
            
            // Check if whale (100+ SOL)
            const isWhale = solBalance >= 100;

            const response = {
                ...walletResult,
                solBalance,
                isWhale,
                timestamp: new Date().toISOString()
            };

            return res.status(200).json(response);

        } catch (error) {
            console.error('API Error:', error);
            return res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

export default handler;