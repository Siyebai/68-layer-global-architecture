#!/usr/bin/env node
// 技能1: 容错与重试机制
class FaultToleranceRetrySkill {
  constructor(system) {
    this.system = system;
    this.maxRetries = 3;
    this.backoffFactor = 2;
    this.initialDelay = 1000;
  }
  
  async executeWithRetry(operation, context = {}) {
    let attempt = 0;
    let lastError;
    
    while (attempt < this.maxRetries) {
      try {
        const result = await operation();
        console.log(`[容错] 操作成功 (第${attempt+1}次尝试)`);
        return result;
      } catch (error) {
        attempt++;
        lastError = error;
        console.error(`[容错] 操作失败 (第${attempt}次):`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.initialDelay * Math.pow(this.backoffFactor, attempt-1);
          console.log(`[容错] ${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`容错重试耗尽: ${lastError.message}`);
  }
  
  async withCircuitBreaker(operation, options = {}) {
    const { failureThreshold = 5, timeout = 60000 } = options;
    const state = { failures: 0, lastFailure: null, open: false };
    
    return new Promise((resolve, reject) => {
      const run = async () => {
        if (state.open && Date.now() - state.lastFailure < timeout) {
          return reject(new Error('Circuit breaker is OPEN'));
        }
        
        try {
          const result = await operation();
          state.failures = 0;
          state.open = false;
          resolve(result);
        } catch (error) {
          state.failures++;
          state.lastFailure = Date.now();
          if (state.failures >= failureThreshold) {
            state.open = true;
            console.warn('[容错] Circuit breaker OPENED');
          }
          reject(error);
        }
      };
      
      run();
    });
  }
}
module.exports = { FaultToleranceRetrySkill };
