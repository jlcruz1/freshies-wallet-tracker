// $UNREKT Web Dashboard - Local Socket.IO Version
class UnrektDashboard {
    constructor() {
        this.isPaused = false;
        this.freshWalletCount = 0;
        this.failedWalletCount = 0;
        this.whaleWalletCount = 0;
        this.showFailedWallets = true;
        this.socket = null;
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
        console.log('🚀 Initializing $UNREKT Dashboard (Local)...');
        
        // Clear any browser cache or localStorage
        this.clearBrowserCache();
        
        this.setupEventListeners();
        this.initializeAnalyticsTabs();
        this.initializeWhaleTabs();
        this.setupSocketConnection();
        
        console.log('✅ Dashboard initialized');
    }

    clearBrowserCache() {
        console.log('🧹 Clearing browser cache for fresh session...');
        
        // Clear localStorage
        if (typeof(Storage) !== "undefined") {
            localStorage.clear();
            sessionStorage.clear();
        }
        
        // Clear any persistent data variables
        this.lastStats = null;
        this.lastTokenAnalytics = null;
        this.lastWhaleAnalytics = null;
        
        console.log('✅ Browser cache cleared');
    }

    setupSocketConnection() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.updateConnectionStatus('Connected', true);
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus('Disconnected', false);
        });

        this.socket.on('freshWallet', (data) => {
            if (!this.isPaused) {
                this.addFreshWalletCard(data);
                this.freshWalletCount++;
                this.updateStats({
                    ...this.stats,
                    freshFound: this.freshWalletCount
                });
            }
        });

        this.socket.on('failedWallet', (data) => {
            if (!this.isPaused && this.showFailedWallets) {
                this.addFailedWalletCard(data);
                this.failedWalletCount++;
                this.updateStats({
                    ...this.stats,
                    failedChecks: this.failedWalletCount
                });
            }
        });

        this.socket.on('tokenAnalytics', (data) => {
            this.updateTokenAnalytics(data);
        });

        this.socket.on('whaleAnalytics', (data) => {
            this.updateWhaleAnalytics(data);
        });

        this.socket.on('stats', (data) => {
            this.updateStats(data);
        });
    }

    startPolling() {
        // Socket.IO version doesn't need polling - all data comes via Socket.IO events
        console.log('Socket.IO version - no polling needed');
    }

    // Socket.IO version doesn't need fetchTokenAnalytics - data comes via events



    setupEventListeners() {
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
        console.log('📊 Updating token analytics:', analyticsData);
        ['all', 'success', 'failed'].forEach(category => {
            // Get 5-minute data as default
            const categoryData = analyticsData[category] || {};
            const tokens = categoryData['5min'] || [];
            console.log(`📊 ${category} tokens:`, tokens);
            if (tokens.length > 0) {
                console.log(`📊 First ${category} token structure:`, tokens[0]);
            }
            this.renderTokenList(category, tokens);
        });
    }

    updateWhaleAnalytics(whaleData) {
        console.log('🐋 Updating whale analytics:', whaleData);
        console.log('🐋 All whales array:', whaleData.allWhales);
        console.log('🐋 Fresh whales array:', whaleData.freshWhales);
        console.log('🐋 AllWhales length:', whaleData.allWhales?.length);
        console.log('🐋 FreshWhales length:', whaleData.freshWhales?.length);
        
        // Update whale counts in the header
        const whaleCountElement = document.getElementById('whaleWalletCount');
        if (whaleCountElement) {
            whaleCountElement.textContent = whaleData.totalWhales || 0;
            console.log('🐋 Updated whale count to:', whaleData.totalWhales);
        }
        
        // Render whale lists
        console.log('🐋 About to render whale lists...');
        this.renderWhaleList('all', whaleData.allWhales || []);
        this.renderWhaleList('fresh', whaleData.freshWhales || []);
        console.log('🐋 Finished rendering whale lists');
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
        
        whales.forEach((whale, index) => {
            console.log(`🐋 Adding whale card ${index + 1}:`, whale);
            try {
                this.addWhaleCard(whale, type);
            } catch (error) {
                console.error('Error adding whale card:', error);
            }
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

    updateConnectionStatus(status, isConnected) {
        // Update connection status in the UI if elements exist
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const icon = statusElement.querySelector('.status-icon');
            const text = statusElement.querySelector('.status-text');
            
            if (icon && text) {
                if (isConnected) {
                    icon.textContent = '🟢';
                    text.textContent = status;
                    statusElement.className = 'status connected';
                } else {
                    icon.textContent = '🔴';
                    text.textContent = status;
                    statusElement.className = 'status disconnected';
                }
            }
        }
        
        console.log(`Connection status: ${status} (${isConnected ? 'Connected' : 'Disconnected'})`);
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
            console.log(`🔍 Rendering ${category} token #${index + 1}:`, token);
            
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
            
            console.log(`🔍 Primary token selected: "${primaryToken}" from input: "${inputToken}", output: "${outputToken}"`);
            
            // Optional market badge if backend enriched it (future use)
            const logoHtml = token.meta?.logoURI ? `<img class=\\"token-logo\\" src=\\"${token.meta.logoURI}\\" alt=\\"logo\\" onerror=\\"this.style.display='none'\\"/>` : '';
            const resolvedSymbol = token.meta?.symbol || token.displaySymbol;
            const symbolHtml = resolvedSymbol ? `<span class=\\"token-symbol-tag\\">${resolvedSymbol}</span>` : '';
            const mcapValue = token.market?.marketCap ?? token.market?.fdv;
            const marketBadge = mcapValue ? `<span class=\"market-cap\">$${Number(mcapValue).toLocaleString()} MC</span>` : '';

            tokenElement.innerHTML = `
                <div class="token-rank">#${index + 1}</div>
                <div class="token-info">
                    <div class="token-address" title="Click to copy ${primaryToken}">
                        ${logoHtml}${symbolHtml}
                        <span class=\\"token-mint\\">${this.formatTokenDisplay(primaryToken)}</span>
                        ${marketBadge}
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