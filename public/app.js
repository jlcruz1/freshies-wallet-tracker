// $UNREKT Web Dashboard - Vercel Compatible Version
class UnrektDashboard {
    constructor() {
        this.isPaused = false;
        this.freshWalletCount = 0;
        this.failedWalletCount = 0;
        this.whaleWalletCount = 0;
        this.showFailedWallets = true;
        this.stats = {
            totalChecked: 0,
            freshFound: 0,
            failedChecks: 0,
            whalesFound: 0,
            freshWhalesFound: 0,
            activeConnections: 1
        };
        
        // Current analytics view state
        this.currentAnalyticsView = {
            all: '5min',
            success: '5min', 
            failed: '5min'
        };

        // Polling intervals
        this.statsInterval = null;
        this.tokensInterval = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing $UNREKT Dashboard (Vercel)...');
        
        this.setupEventListeners();
        this.initializeAnalyticsTabs();
        this.initializeWhaleTabs();
        this.startPolling();
        
        console.log('✅ Dashboard initialized');
    }

    startPolling() {
        // Poll stats every 10 seconds
        this.statsInterval = setInterval(() => {
            this.fetchStats();
        }, 10000);

        // Poll token analytics every 30 seconds
        this.tokensInterval = setInterval(() => {
            this.fetchTokenAnalytics();
        }, 30000);

        // Poll whale analytics every 30 seconds
        this.whalesInterval = setInterval(() => {
            this.fetchWhaleAnalytics();
        }, 30000);

        // Initial fetch
        this.fetchStats();
        this.fetchTokenAnalytics();
        this.fetchWhaleAnalytics();
    }

    async fetchStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            this.updateStats(stats);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    async fetchTokenAnalytics() {
        try {
            // Fetch all three categories
            const [allResponse, successResponse, failedResponse] = await Promise.all([
                fetch('/api/tokens?category=all&minutes=5'),
                fetch('/api/tokens?category=success&minutes=5'),
                fetch('/api/tokens?category=failed&minutes=5')
            ]);

            const allData = await allResponse.json();
            const successData = await successResponse.json();
            const failedData = await failedResponse.json();

            this.updateTokenAnalytics({
                all: allData.tokens,
                success: successData.tokens,
                failed: failedData.tokens
            });
        } catch (error) {
            console.error('Error fetching token analytics:', error);
        }
    }

    async fetchWhaleAnalytics() {
        try {
            const response = await fetch('/api/whales');
            const whaleData = await response.json();
            this.updateWhaleAnalytics(whaleData);
        } catch (error) {
            console.error('Error fetching whale analytics:', error);
        }
    }

    async checkWallet(walletAddress) {
        try {
            const response = await fetch('/api/wallet-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ walletAddress })
            });

            const result = await response.json();
            
            if (result.success) {
                this.addFreshWalletCard({
                    address: result.address,
                    timestamp: result.timestamp,
                    solBalance: result.solBalance,
                    transactionCount: result.transactionCount,
                    ageHours: result.ageHours,
                    reason: result.reason,
                    tokenInfo: {
                        inputToken: { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
                        outputToken: { symbol: 'Token', mint: 'Unknown' }
                    }
                });

                if (result.isWhale) {
                    this.addWhaleCard({
                        address: result.address,
                        timestamp: result.timestamp,
                        solBalance: result.solBalance,
                        isFresh: true,
                        tokenInfo: {
                            inputToken: { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
                            outputToken: { symbol: 'Token', mint: 'Unknown' }
                        }
                    }, document.getElementById('allWhalesList'));
                }
            } else {
                this.addFailedWalletCard({
                    address: result.address || walletAddress,
                    timestamp: result.timestamp,
                    solBalance: result.solBalance || 0,
                    transactionCount: result.transactionCount || 0,
                    ageHours: result.ageHours,
                    reason: result.reason,
                    tokenInfo: {
                        inputToken: { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
                        outputToken: { symbol: 'Token', mint: 'Unknown' }
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('Error checking wallet:', error);
            return { success: false, error: error.message };
        }
    }

    setupEventListeners() {
        // Manual wallet check
        const checkButton = document.getElementById('manualCheck');
        const walletInput = document.getElementById('walletAddress');
        
        if (checkButton && walletInput) {
            checkButton.addEventListener('click', async () => {
                const address = walletInput.value.trim();
                if (address) {
                    console.log('Checking wallet:', address);
                    checkButton.textContent = 'Checking...';
                    checkButton.disabled = true;
                    
                    try {
                        const result = await this.checkWallet(address);
                        console.log('Wallet check result:', result);
                    } catch (error) {
                        console.error('Wallet check failed:', error);
                    }
                    
                    checkButton.textContent = 'Check Wallet';
                    checkButton.disabled = false;
                    walletInput.value = '';
                }
            });

            walletInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    checkButton.click();
                }
            });
        }

        // Copy wallet addresses
        document.addEventListener('click', (e) => {
            if (e.target.matches('.wallet-action.copy') || e.target.closest('.wallet-action.copy')) {
                const button = e.target.matches('.wallet-action.copy') ? e.target : e.target.closest('.wallet-action.copy');
                const address = button.dataset.address;
                if (address) {
                    this.copyToClipboard(address);
                }
            }
        });
    }

    initializeAnalyticsTabs() {
        document.querySelectorAll('.time-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.closest('.analytics-card').dataset.category;
                const time = btn.dataset.time;
                
                // Update active state
                btn.closest('.time-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Store current view
                this.currentAnalyticsView[category] = time;
                
                // Fetch new data (in real app, this would filter by time)
                this.fetchTokenAnalytics();
            });
        });
    }

    initializeWhaleTabs() {
        document.querySelectorAll('[data-whale-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.whaleTab;
                
                // Update active state
                document.querySelectorAll('[data-whale-tab]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show/hide whale lists
                document.getElementById('allWhalesList').style.display = tab === 'all' ? 'block' : 'none';
                document.getElementById('freshWhalesList').style.display = tab === 'fresh' ? 'block' : 'none';
            });
        });
    }

    updateStats(stats) {
        this.stats = stats;
        
        // Update stat displays
        const elements = {
            'totalWallets': stats.totalChecked,
            'freshWallets': stats.freshFound,
            'failedWallets': stats.failedChecks,
            'whaleWallets': stats.whalesFound
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value || 0;
            }
        });

        // Update whale count
        const whaleCountElement = document.getElementById('whaleWalletCount');
        if (whaleCountElement) {
            whaleCountElement.textContent = stats.whalesFound || 0;
        }
    }

    updateTokenAnalytics(analyticsData) {
        ['all', 'success', 'failed'].forEach(category => {
            const tokens = analyticsData[category] || [];
            this.renderTokenList(category, tokens);
        });
    }

    renderTokenList(category, tokens) {
        const containerId = `tokens-${category}`;
        const container = document.getElementById(containerId);
        
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        if (!tokens || tokens.length === 0) {
            container.innerHTML = '<div class="empty-state">No token data available</div>';
            return;
        }

        // Render top 5 tokens
        const topTokens = tokens.slice(0, 5);
        topTokens.forEach((token, index) => {
            const tokenElement = document.createElement('div');
            tokenElement.className = 'token-item';
            
            const inputToken = token.inputToken?.mint || token.inputToken?.symbol || 'Unknown';
            const outputToken = token.outputToken?.mint || token.outputToken?.symbol || 'Unknown';
            
            // Use the primary token (prefer non-SOL token if available)
            let primaryToken = inputToken;
            if (inputToken === 'So11111111111111111111111111111111111111112' || inputToken === 'WSOL') {
                primaryToken = outputToken;
            } else if (outputToken !== 'So11111111111111111111111111111111111111112' && outputToken !== 'WSOL' && outputToken !== inputToken) {
                // If they're different and output isn't SOL, prefer the longer one (likely the actual token)
                primaryToken = outputToken.length > inputToken.length ? outputToken : inputToken;
            }
            
            tokenElement.innerHTML = `
                <div class="token-rank">#${index + 1}</div>
                <div class="token-info">
                    <div class="token-address" title="Click to copy ${primaryToken}">
                        <span class="token-mint">${this.formatTokenDisplay(primaryToken)}</span>
                    </div>
                    <div class="token-count">${token.count || 0} trades</div>
                </div>
                <div class="token-actions">
                    <button onclick="copyToClipboard('${primaryToken}')" class="copy-btn" title="Copy token address">📋</button>
                </div>
            `;
            
            container.appendChild(tokenElement);
        });
    }

    formatTokenDisplay(token) {
        if (!token || token === 'Unknown') return 'Unknown';
        
        // Always show the full token address/symbol
        return token;
    }

    updateWhaleAnalytics(whaleData) {
        console.log('🐋 Updating whale analytics:', whaleData);
        
        // Update whale counts in the header
        const whaleCountElement = document.getElementById('whaleWalletCount');
        if (whaleCountElement) {
            whaleCountElement.textContent = whaleData.totalWhales || 0;
        }
        
        // Render whale lists
        this.renderWhaleList('all', whaleData.allWhales || []);
        this.renderWhaleList('fresh', whaleData.freshWhales || []);
    }

    renderWhaleList(type, whales) {
        const containerId = type === 'all' ? 'allWhalesList' : 'freshWhalesList';
        const container = document.getElementById(containerId);
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!whales || whales.length === 0) {
            container.innerHTML = '<div class="empty-state">No whales detected yet...</div>';
            return;
        }
        
        whales.forEach(whale => {
            this.addWhaleCard(whale, type);
        });
    }

    addWhaleCard(whale, listType = 'all') {
        const containerId = listType === 'fresh' ? 'freshWhalesList' : 'allWhalesList';
        const container = document.getElementById(containerId);
        
        if (!container) return;
        
        const whaleCard = document.createElement('div');
        whaleCard.className = 'whale-item';
        
        const tokenInfo = whale.tokenInfo ?
            `${whale.tokenInfo.inputToken?.mint || whale.tokenInfo.inputToken?.symbol || 'Unknown'} → ${whale.tokenInfo.outputToken?.mint || whale.tokenInfo.outputToken?.symbol || 'Unknown'}` :
            'No token data';
            
        const timeStr = whale.timestamp ? new Date(whale.timestamp).toLocaleTimeString() : 'Unknown time';
        
        whaleCard.innerHTML = `
            <div class="whale-header">
                <span class="whale-address" onclick="openSolscan('${whale.address}')" title="Click to view on Solscan">
                    ${whale.address.substring(0, 8)}...${whale.address.substring(whale.address.length - 4)}
                </span>
                <span class="whale-balance">${whale.solBalance} SOL</span>
            </div>
            <div class="whale-token-info">
                🎯 <strong>Tokens:</strong> ${tokenInfo}
            </div>
            <div class="whale-timestamp">
                🐋 Whale wallet • ${timeStr}
                <button onclick="copyToClipboard('${whale.address}'); event.stopPropagation();" class="copy-btn" title="Copy address">📋</button>
            </div>
        `;
        
        container.appendChild(whaleCard);
    }

    addFreshWalletCard(wallet) {
        const container = document.getElementById('freshWalletsList');
        if (!container) return;

        // Hide empty state
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        this.freshWalletCount++;
        
        // Create wallet card
        const card = document.createElement('div');
        card.className = 'whale-item fresh new';
        
        const timeStr = new Date(wallet.timestamp).toLocaleTimeString();
        const balanceStr = wallet.solBalance ? `${wallet.solBalance.toFixed(4)} SOL` : '';
        
        const tokenDisplay = wallet.tokenInfo ? 
            `${wallet.tokenInfo.inputToken?.mint || wallet.tokenInfo.inputToken?.symbol || 'Unknown'} → ${wallet.tokenInfo.outputToken?.mint || wallet.tokenInfo.outputToken?.symbol || 'Unknown'}` : 
            'No token data';

        card.innerHTML = `
            <div class="whale-header">
                <span class="whale-address" onclick="openSolscan('${wallet.address}')" title="Click to view on Solscan">
                    ${wallet.address.substring(0, 8)}...${wallet.address.substring(-4)}
                </span>
                <span class="fresh-balance">${balanceStr || '0 SOL'}</span>
            </div>
            <div class="whale-token-info">
                🎯 <strong>Tokens:</strong> ${tokenDisplay}
            </div>
            <div class="whale-timestamp">
                🌱 Fresh wallet • ${timeStr}
                <button onclick="copyToClipboard('${wallet.address}'); event.stopPropagation();" class="copy-btn" title="Copy address">📋</button>
            </div>
        `;
        
        // Insert at the top
        container.insertBefore(card, container.firstChild);
        
        // Remove old cards if too many (keep last 50 for fresh)
        const cards = container.querySelectorAll('.whale-item');
        if (cards.length > 50) {
            for (let i = 50; i < cards.length; i++) {
                cards[i].remove();
            }
        }
        
        // Remove new class after animation
        setTimeout(() => {
            card.classList.remove('new');
        }, 2000);
    }

    addFailedWalletCard(wallet) {
        const container = document.getElementById('failedWalletsList');
        if (!container) return;

        // Hide empty state
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        this.failedWalletCount++;
        
        // Create wallet card
        const card = document.createElement('div');
        card.className = 'whale-item failed new';
        
        const timeStr = new Date(wallet.timestamp).toLocaleTimeString();
        const balanceStr = wallet.solBalance ? `${wallet.solBalance.toFixed(4)} SOL` : '';
        
        const tokenDisplay = wallet.tokenInfo ? 
            `${wallet.tokenInfo.inputToken?.mint || wallet.tokenInfo.inputToken?.symbol || 'Unknown'} → ${wallet.tokenInfo.outputToken?.mint || wallet.tokenInfo.outputToken?.symbol || 'Unknown'}` : 
            'No token data';

        card.innerHTML = `
            <div class="whale-header">
                <span class="whale-address" onclick="openSolscan('${wallet.address}')" title="Click to view on Solscan">
                    ${wallet.address.substring(0, 8)}...${wallet.address.substring(-4)}
                </span>
                <span class="failed-balance">${balanceStr || '0 SOL'}</span>
            </div>
            <div class="whale-token-info">
                🎯 <strong>Tokens:</strong> ${tokenDisplay}
            </div>
            <div class="whale-timestamp">
                ❌ ${wallet.reason || 'Failed check'} • ${timeStr}
                <button onclick="copyToClipboard('${wallet.address}'); event.stopPropagation();" class="copy-btn" title="Copy address">📋</button>
            </div>
        `;
        
        // Insert at the top
        container.insertBefore(card, container.firstChild);
        
        // Remove old cards if too many (keep last 30 for failed)
        const cards = container.querySelectorAll('.whale-item');
        if (cards.length > 30) {
            for (let i = 30; i < cards.length; i++) {
                cards[i].remove();
            }
        }
        
        // Remove new class after animation
        setTimeout(() => {
            card.classList.remove('new');
        }, 2000);
    }



    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showCopyFeedback();
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    showCopyFeedback() {
        // Create temporary feedback element
        const feedback = document.createElement('div');
        feedback.textContent = 'Copied!';
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            z-index: 1000;
            animation: fadeInOut 2s ease-in-out;
        `;
        
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            document.body.removeChild(feedback);
        }, 2000);
    }

    destroy() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
        if (this.tokensInterval) {
            clearInterval(this.tokensInterval);
        }
        if (this.whalesInterval) {
            clearInterval(this.whalesInterval);
        }
    }
}

// Global function to open wallet on Solscan
function openSolscan(address) {
    const solscanUrl = `https://solscan.io/account/${address}`;
    window.open(solscanUrl, '_blank');
}

// Global function for copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Create temporary feedback element
        const feedback = document.createElement('div');
        feedback.textContent = 'Copied!';
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #16a34a;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            z-index: 1000;
            animation: fadeInOut 2s ease-in-out;
        `;
        
        document.body.appendChild(feedback);
        
        setTimeout(() => {
            document.body.removeChild(feedback);
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Add CSS animation for copy feedback
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(-10px); }
        20% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new UnrektDashboard();
});