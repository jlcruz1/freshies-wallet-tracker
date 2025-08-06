// Vercel serverless function for token analytics
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
            const { category = 'all', minutes = 5 } = req.query;

            // Return sample token analytics with correct structure
            const sampleTokens = [
                {
                    inputToken: { 
                        symbol: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq',
                        mint: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq'
                    },
                    outputToken: { 
                        symbol: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq', 
                        mint: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq'
                    },
                    count: 15,
                    trade: 'FkwmJJh9LeyVA5USwnr4uN9kf3WPwc2Gv2gYJn7drkkq Trading'
                },
                {
                    inputToken: { 
                        symbol: 'WSOL',
                        mint: 'So11111111111111111111111111111111111111112'
                    },
                    outputToken: { 
                        symbol: 'GdZEGK9Dv61EbpJ8fYnJZcnJvmhwF6uS6mVVkSfSbonk', 
                        mint: 'GdZEGK9Dv61EbpJ8fYnJZcnJvmhwF6uS6mVVkSfSbonk'
                    },
                    count: 8,
                    trade: 'WSOL → GdZEGK9Dv61EbpJ8fYnJZcnJvmhwF6uS6mVVkSfSbonk Trading'
                }
            ];

            const analytics = {
                all: sampleTokens,
                success: sampleTokens.slice(0, 1),
                failed: sampleTokens.slice(1, 2)
            };

            return res.status(200).json({
                category,
                minutes: parseInt(minutes),
                tokens: analytics[category] || analytics.all,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Tokens API Error:', error);
            return res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}