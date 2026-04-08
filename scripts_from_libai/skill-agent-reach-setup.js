#!/usr/bin/env node
// 技能4: Agent Reach 互联网访问工具配置指南
class AgentReachSetupSkill {
  constructor(system) {
    this.system = system;
    this.config = {
      proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null,
      timeout: 30000,
      retries: 3,
      userAgent: 'Libai-Agent/1.0 (OpenClaw)',
      maxConnections: 100,
      keepAlive: true
    };
    this.allowedDomains = [
      'github.com',
      'api.github.com',
      'raw.githubusercontent.com',
      'clawhub.com',
      'openclaw.ai',
      'docs.openclaw.ai',
      'api.openclaw.ai'
    ];
    this.blockedDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '192.168.',
      '10.',
      '172.16.',
      '169.254'
    ];
    this.connectionPool = new Map();
  }
  
  setupInternetAccess() {
    console.log('[AgentReach] 配置互联网访问...');
    
    // 检查代理
    if (this.config.proxy) {
      console.log(`[AgentReach] 使用代理: ${this.config.proxy}`);
    } else {
      console.log('[AgentReach] 未配置代理，尝试直连...');
    }
    
    // 验证DNS解析
    this.validateDNS();
    
    // 测试连接
    this.testConnectivity();
    
    console.log('[AgentReach] 互联网访问配置完成');
  }
  
  validateDNS() {
    const dns = require('dns');
    // 使用公共DNS
    dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']);
    console.log('[AgentReach] DNS已配置 (Google/Cloudflare/Quad9)');
    
    // 测试DNS解析
    dns.lookup('clawhub.com', (err, address) => {
      if (err) console.warn('[AgentReach] DNS解析失败:', err.message);
      else console.log(`[AgentReach] DNS解析成功: clawhub.com → ${address}`);
    });
  }
  
  async testConnectivity() {
    const testURLs = [
      'https://clawhub.com',
      'https://openclaw.ai',
      'https://api.github.com'
    ];
    
    for (const url of testURLs) {
      try {
        const result = await this.fetchWithRetry(url, { timeout: 10000 });
        console.log(`[AgentReach] 连接测试成功: ${url} (${result.statusCode})`);
      } catch (error) {
        console.warn(`[AgentReach] 连接测试失败: ${url} - ${error.message}`);
      }
    }
  }
  
  isAllowed(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // 检查黑名单 (内网IP)
      const blocked = this.blockedDomains.some(domain => 
        hostname.startsWith(domain) || hostname.includes(domain)
      );
      if (blocked) {
        console.warn(`[AgentReach] 域名在黑名单: ${hostname}`);
        return false;
      }
      
      // 检查白名单
      const allowed = this.allowedDomains.some(domain => hostname.includes(domain));
      if (!allowed) {
        console.warn(`[AgentReach] 域名不在白名单: ${hostname} - 需要添加到白名单`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[AgentReach] URL解析失败:', error.message);
      return false;
    }
  }
  
  async fetchWithRetry(url, options = {}) {
    if (!this.isAllowed(url)) {
      throw new Error(`URL not allowed: ${url}`);
    }
    
    const https = require('https');
    const http = require('http');
    const Lib = url.startsWith('https') ? https : http;
    const agent = this.config.keepAlive ? new Lib.Agent({ keepAlive: true, maxSockets: this.config.maxConnections }) : undefined;
    
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.config.retries;
      
      const tryFetch = () => {
        const req = Lib.get(url, {
          ...options,
          timeout: options.timeout || this.config.timeout,
          agent,
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'application/json, text/plain, */*',
            ...options.headers
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({ 
              statusCode: res.statusCode, 
              headers: res.headers, 
              body: data,
              url: res.responseUrl || url
            });
          });
        });
        
        req.on('error', (error) => {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`[AgentReach] 重试 ${attempts}/${maxAttempts}: ${url} - ${error.message}`);
            setTimeout(tryFetch, 1000 * attempts);
          } else {
            reject(error);
          }
        });
        
        req.on('timeout', () => {
          req.destroy();
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`[AgentReach] 超时重试 ${attempts}/${maxAttempts}: ${url}`);
            setTimeout(tryFetch, 1000 * attempts);
          } else {
            reject(new Error(`Request timeout after ${this.config.timeout}ms`));
          }
        });
      };
      
      tryFetch();
    });
  }
  
  async postWithRetry(url, body, options = {}) {
    if (!this.isAllowed(url)) {
      throw new Error(`URL not allowed: ${url}`);
    }
    
    const https = require('https');
    const http = require('http');
    const Lib = url.startsWith('https') ? https : http;
    
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.config.retries;
      
      const tryPost = () => {
        const data = typeof body === 'string' ? body : JSON.stringify(body);
        const postData = Buffer.from(data);
        
        const req = Lib.request(url, {
          method: 'POST',
          ...options,
          timeout: options.timeout || this.config.timeout,
          headers: {
            'User-Agent': this.config.userAgent,
            'Content-Type': 'application/json',
            'Content-Length': postData.length,
            ...options.headers
          }
        }, (res) => {
          let responseData = '';
          res.on('data', chunk => responseData += chunk);
          res.on('end', () => {
            resolve({ 
              statusCode: res.statusCode, 
              headers: res.headers, 
              body: responseData 
            });
          });
        });
        
        req.on('error', (error) => {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`[AgentReach] POST重试 ${attempts}/${maxAttempts}: ${url}`);
            setTimeout(tryPost, 1000 * attempts);
          } else {
            reject(error);
          }
        });
        
        req.on('timeout', () => {
          req.destroy();
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`[AgentReach] POST超时重试 ${attempts}/${maxAttempts}: ${url}`);
            setTimeout(tryPost, 1000 * attempts);
          } else {
            reject(new Error('POST request timeout'));
          }
        });
        
        req.write(postData);
        req.end();
      };
      
      tryPost();
    });
  }
  
  addAllowedDomain(domain) {
    this.allowedDomains.push(domain);
    console.log(`[AgentReach] 添加白名单: ${domain}`);
  }
  
  getConfiguration() {
    return {
      proxy: this.config.proxy,
      timeout: this.config.timeout,
      retries: this.config.retries,
      userAgent: this.config.userAgent,
      maxConnections: this.config.maxConnections,
      keepAlive: this.config.keepAlive,
      allowedDomains: this.allowedDomains,
      blockedDomains: this.blockedDomains
    };
  }
  
  async testAllConnections() {
    console.log('[AgentReach] 测试所有允许的域名连接...');
    const results = [];
    
    for (const domain of this.allowedDomains) {
      try {
        const url = `https://${domain}`;
        const start = Date.now();
        const res = await this.fetchWithRetry(url, { timeout: 10000 });
        const duration = Date.now() - start;
        results.push({ domain, status: 'success', statusCode: res.statusCode, duration });
        console.log(`[AgentReach] ✅ ${domain} (${res.statusCode}, ${duration}ms)`);
      } catch (error) {
        results.push({ domain, status: 'failed', error: error.message });
        console.warn(`[AgentReach] ❌ ${domain} - ${error.message}`);
      }
    }
    
    return results;
  }
}
module.exports = { AgentReachSetupSkill };
