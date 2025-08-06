// Vercel serverless function for whale analytics
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        try {
            // Return sample whale data
            const sampleWhales = [
                {
                    address: '6q5WAanAnVfpepRy6hHokkZy3aAUvyh2VLVG4c1dKEuM',
                    solBalance: '271.14',
                    timestamp: Date.now() - 300000, // 5 minutes ago
                    tokenInfo: {
                        inputToken: { 
                            symbol: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq',
                            mint: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq'
                        },
                        outputToken: { 
                            symbol: 'WSOL', 
                            mint: 'So11111111111111111111111111111111111111112'
                        }
                    },
                    isFresh: false
                },
                {
                    address: 'CreQJ2t9K6xMGcCGLBY8qvgUHKYDvYGqRMktNL9FXJcH',
                    solBalance: '1423.31',
                    timestamp: Date.now() - 600000, // 10 minutes ago
                    tokenInfo: {
                        inputToken: { 
                            symbol: 'WSOL',
                            mint: 'So11111111111111111111111111111111111111112'
                        },
                        outputToken: { 
                            symbol: 'GdZEGK9Dv61EbpJ8fYnJZcnJvmhwF6uS6mVVkSfSbonk', 
                            mint: 'GdZEGK9Dv61EbpJ8fYnJZcnJvmhwF6uS6mVVkSfSbonk'
                        }
                    },
                    isFresh: false
                }
            ];

            const whaleAnalytics = {
                totalWhales: sampleWhales.length,
                totalFreshWhales: sampleWhales.filter(w => w.isFresh).length,
                allWhales: sampleWhales,
                freshWhales: sampleWhales.filter(w => w.isFresh),
                timestamp: new Date().toISOString()
            };

            return res.status(200).json(whaleAnalytics);

        } catch (error) {
            console.error('Whales API Error:', error);
            return res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}