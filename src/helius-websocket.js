import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Helius WebSocket Connection Manager with robust reconnection logic
 * Handles multiple subscription types for new wallet detection
 */
export class HeliusWebSocketManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      apiKey: config.apiKey,
      network: config.network || 'mainnet',
      maxRetries: config.maxRetries || 10,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      pingInterval: config.pingInterval || 30000,
      ...config
    };
    
    this.ws = null;
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.isDestroyed = false;
    this.pingTimer = null;
    this.lastPong = Date.now();
    
    // Subscription ID tracking
    this.subscriptionIdCounter = 1;
    this.activeSubscriptions = new Set();
  }

  /**
   * Get WebSocket URL based on network
   */
  getWebSocketUrl() {
    const baseUrl = this.config.network === 'mainnet' 
      ? 'wss://mainnet.helius-rpc.com'
      : 'wss://devnet.helius-rpc.com';
    return `${baseUrl}/?api-key=${this.config.apiKey}`;
  }

  /**
   * Connect to Helius WebSocket
   */
  async connect() {
    if (this.isConnecting || this.isDestroyed) return;
    
    this.isConnecting = true;
    
    try {
      const url = this.getWebSocketUrl();
      console.log(`🔌 Connecting to Helius WebSocket: ${url.replace(this.config.apiKey, '***')}`);
      
      this.ws = new WebSocket(url);
      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        this.ws.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.ws.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('✅ Connected to Helius WebSocket');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      
      this.startPingMonitoring();
      this.resubscribeAll();
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error);
        this.emit('error', error);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`📞 WebSocket connection closed: ${code} - ${reason}`);
      this.cleanup();
      
      if (!this.isDestroyed) {
        this.scheduleReconnect();
      }
      
      this.emit('disconnected', { code, reason });
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('pong', () => {
      this.lastPong = Date.now();
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    // Handle subscription confirmations
    if (message.result && typeof message.result === 'number' && message.id) {
      console.log(`📧 Subscription confirmed: ID ${message.result} for request ${message.id}`);
      this.activeSubscriptions.add(message.result);
      this.emit('subscriptionConfirmed', {
        subscriptionId: message.result,
        requestId: message.id
      });
      return;
    }

    // Handle subscription notifications
    if (message.method && message.params) {
      this.emit('notification', {
        method: message.method,
        params: message.params,
        subscriptionId: message.params.subscription
      });
      return;
    }

    // Handle errors
    if (message.error) {
      console.error('❌ Subscription error:', message.error);
      this.emit('subscriptionError', message.error);
      return;
    }

    // Handle other message types
    this.emit('message', message);
  }

  /**
   * Start ping monitoring to detect stale connections
   */
  startPingMonitoring() {
    this.stopPingMonitoring();
    
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPong;
        
        if (timeSinceLastPong > this.config.pingInterval * 2) {
          console.warn('⚠️ No pong received, connection may be stale');
          this.ws.close(1006, 'Ping timeout');
          return;
        }
        
        // Send ping
        this.ws.ping();
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping monitoring
   */
  stopPingMonitoring() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.isDestroyed || this.reconnectAttempts >= this.config.maxRetries) {
      console.error(`💀 Max reconnection attempts (${this.config.maxRetries}) reached`);
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const delay = Math.min(
      this.config.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxDelay
    );
    
    const jitteredDelay = delay + (Math.random() * 1000);
    
    console.log(`🔄 Reconnecting in ${Math.round(jitteredDelay)}ms (attempt ${this.reconnectAttempts}/${this.config.maxRetries})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, jitteredDelay);
  }

  /**
   * Send subscription request
   */
  async subscribe(method, params, requestId = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = requestId || this.subscriptionIdCounter++;
    const subscription = { method, params, id };
    
    this.subscriptions.set(id, subscription);
    
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    console.log(`📤 Sending subscription: ${method}`, params);
    this.ws.send(JSON.stringify(message));
    
    return id;
  }

  /**
   * Unsubscribe from a subscription
   */
  async unsubscribe(subscriptionId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot unsubscribe');
      return;
    }

    // Determine unsubscribe method based on subscription type
    const unsubscribeMethod = this.getUnsubscribeMethod(subscriptionId);
    
    if (unsubscribeMethod) {
      const message = {
        jsonrpc: '2.0',
        id: this.subscriptionIdCounter++,
        method: unsubscribeMethod,
        params: [subscriptionId]
      };
      
      console.log(`📤 Unsubscribing: ${subscriptionId}`);
      this.ws.send(JSON.stringify(message));
    }
    
    this.activeSubscriptions.delete(subscriptionId);
  }

  /**
   * Get appropriate unsubscribe method
   */
  getUnsubscribeMethod(subscriptionId) {
    // This is a simplified approach - in practice, you'd track which subscription type each ID represents
    const methods = [
      'accountUnsubscribe',
      'logsUnsubscribe', 
      'programUnsubscribe',
      'blockUnsubscribe',
      'signatureUnsubscribe'
    ];
    
    // For now, try to match common patterns or use a mapping
    return 'accountUnsubscribe'; // Default - you'd improve this based on your tracking
  }

  /**
   * Resubscribe to all active subscriptions
   */
  async resubscribeAll() {
    console.log(`🔄 Resubscribing to ${this.subscriptions.size} subscriptions`);
    
    for (const [id, subscription] of this.subscriptions) {
      try {
        await this.subscribe(subscription.method, subscription.params, id);
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      } catch (error) {
        console.error(`❌ Failed to resubscribe ${subscription.method}:`, error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopPingMonitoring();
    this.isConnecting = false;
    
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
  }

  /**
   * Destroy the connection manager
   */
  destroy() {
    console.log('🔥 Destroying WebSocket connection manager');
    this.isDestroyed = true;
    
    this.cleanup();
    this.subscriptions.clear();
    this.activeSubscriptions.clear();
    this.removeAllListeners();
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: this.activeSubscriptions.size,
      totalSubscriptions: this.subscriptions.size
    };
  }
}