class ResilienceSkill {
  constructor(system) { this.system = system; this.retryConfig = { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, backoffFactor: 2, jitter: 0.1 }; }
  async executeWithRetry(fn, context = {}) { const { maxRetries, baseDelay, maxDelay, backoffFactor, jitter } = { ...this.retryConfig, ...context.retryConfig }; let lastError; for (let attempt = 0; attempt <= maxRetries; attempt++) { try { if (attempt > 0) { const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay); const jitterAmount = delay * jitter * (Math.random() * 2 - 1); await new Promise(r => setTimeout(r, delay + jitterAmount)); } return await fn(attempt); } catch (error) { lastError = error; if (attempt === maxRetries) break; } } throw lastError; }
  getStatus() { return { name: 'python-resilience', running: true, version: '1.0.0' }; }
}
module.exports = ResilienceSkill;
