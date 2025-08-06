// Vercel serverless function for system statistics
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
            // Return sample stats for demo
            const stats = {
                totalChecked: 45,
                freshFound: 8,
                failedChecks: 37,
                whalesFound: 3,
                freshWhalesFound: 1,
                activeConnections: 1,
                lastUpdate: new Date().toISOString(),
                systemStatus: 'online'
            };

            return res.status(200).json(stats);

        } catch (error) {
            console.error('Stats API Error:', error);
            return res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}