# 🌱 Freshies - Solana Fresh Wallet Tracker (Vercel Deployment)

A real-time Solana wallet detection system that identifies fresh wallets, whale wallets, and tracks token trading patterns. This version is optimized for **Vercel serverless deployment**.

## 🚀 Quick Deploy to Vercel

### 1. **Deploy with One Click**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/freshies-wallet-tracker)

### 2. **Manual Deployment**

#### Prerequisites:
- Vercel account
- Helius API key(s)

#### Steps:

1. **Clone and prepare:**
   ```bash
   git clone <your-repo>
   cd freshies-wallet-tracker
   npm install
   ```

2. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

3. **Login to Vercel:**
   ```bash
   vercel login
   ```

4. **Deploy:**
   ```bash
   vercel --prod
   ```

5. **Set Environment Variables in Vercel Dashboard:**
   - `HELIUS_API_KEY` - Your primary Helius RPC API key
   - `HELIUS_WS_URL` - Your Helius WebSocket URL (optional for this version)

## 🌐 **Live Demo**
Your app will be available at: `https://your-project-name.vercel.app`

## 🛠️ **Features (Vercel Version)**

### ✅ **Serverless API Endpoints**
- `/api/wallet-data` - Check if wallet is fresh/whale
- `/api/stats` - Get system statistics  
- `/api/tokens` - Get token analytics

### ✅ **Manual Wallet Checking**
- Enter any Solana wallet address
- Instant fresh wallet detection
- Whale detection (100+ SOL)
- Token info extraction

### ✅ **Real-time Dashboard**
- Fresh wallet detection results
- Whale wallet tracking
- Failed check logging
- Token trading patterns

### ✅ **Vercel Optimizations**
- Serverless functions
- Static file serving
- Fast global CDN
- Automatic scaling

## 📋 **API Documentation**

### **POST /api/wallet-data**
Check if a wallet is fresh or a whale.

```json
{
  "walletAddress": "So11111111111111111111111111111111111111112"
}
```

**Response:**
```json
{
  "success": true,
  "address": "So11111111111111111111111111111111111111112",
  "solBalance": 123.45,
  "isWhale": true,
  "transactionCount": 15,
  "ageHours": 2.5,
  "reason": "Fresh wallet detected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### **GET /api/stats**
Get system statistics.

**Response:**
```json
{
  "totalChecked": 5000,
  "freshFound": 150,
  "failedChecks": 300,
  "whalesFound": 25,
  "freshWhalesFound": 10,
  "activeConnections": 1,
  "systemStatus": "online"
}
```

### **GET /api/tokens**
Get token analytics.

**Query Parameters:**
- `category` - "all", "success", or "failed"
- `minutes` - 5, 10, or 20

**Response:**
```json
{
  "category": "all",
  "minutes": 5,
  "tokens": [
    {
      "inputToken": {
        "symbol": "SOL",
        "mint": "So11111111111111111111111111111111111111112"
      },
      "outputToken": {
        "symbol": "USDC", 
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      },
      "count": 45
    }
  ]
}
```

## 🔧 **Environment Variables**

Required for Vercel deployment:

```bash
HELIUS_API_KEY=your_helius_api_key_here
```

Optional:
```bash
HELIUS_API_KEY_2=backup_api_key
WHALE_THRESHOLD=100
```

## 🏗️ **Architecture**

### **Frontend (Static)**
- `public/index-vercel.html` - Main dashboard
- `public/app-vercel.js` - Frontend logic with API polling
- `public/styles.css` - Styling

### **Backend (Serverless Functions)**
- `api/wallet-data.js` - Wallet analysis
- `api/stats.js` - Statistics
- `api/tokens.js` - Token analytics

### **Configuration**
- `vercel.json` - Vercel deployment config
- `package.json` - Dependencies and scripts

## 💡 **Key Differences from Local Version**

| Feature | Local Version | Vercel Version |
|---------|---------------|----------------|
| **Real-time Updates** | WebSocket + Live monitoring | Manual refresh + API polling |
| **Data Persistence** | SQLite database | Stateless (no persistence) |
| **Whale Detection** | Automatic from live feeds | Manual wallet checking |
| **Token Analytics** | Real transaction parsing | Mock data for demo |
| **Scalability** | Single server | Auto-scaling serverless |

## 🎯 **Usage**

1. **Visit your deployed URL**
2. **Enter wallet addresses** in the manual check section
3. **View results** in real-time dashboard
4. **Click wallet addresses** to view on Solscan
5. **Copy addresses** with one-click buttons

## 🔮 **Future Enhancements**

- Database integration (Planetscale, Supabase)
- Real-time WebSocket alternative (Pusher, Ably)
- Webhook notifications
- Historical data storage
- Multi-RPC load balancing

## 🐛 **Troubleshooting**

### **API Not Working**
- Check environment variables in Vercel dashboard
- Verify Helius API key is valid
- Check function logs in Vercel dashboard

### **Slow Performance** 
- Helius RPC rate limits may apply
- Consider upgrading Helius plan
- Add caching layer

### **Build Errors**
- Ensure all dependencies are in `package.json`
- Check Node.js version compatibility
- Review Vercel build logs

## 📞 **Support**

- [Vercel Documentation](https://vercel.com/docs)
- [Helius Documentation](https://docs.helius.xyz/)
- [Solana Web3.js Guide](https://solana-labs.github.io/solana-web3.js/)

---

**Ready to deploy?** Click the Vercel button above or follow the manual steps! 🚀