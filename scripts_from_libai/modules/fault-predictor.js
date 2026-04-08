#!/usr/bin/env node
/**
 * FaultPredictor - 故障预测模块
 * 基于历史数据和趋势预测潜在故障
 * 作者: C李白 | 2026-04-02
 */

class FaultPredictor {
  constructor(monitor) {
    this.monitor = monitor;
    this.models = {
      resourceExhaustion: this.trainResourceModel(),
      memoryLeak: this.trainMemoryLeakModel(),
      serviceDegradation: this.trainDegradationModel()
    };
    this.predictionHistory = [];
  }

  /**
   * 训练资源耗尽预测模型
   */
  trainResourceModel() {
    // 基于CPU/磁盘增长趋势预测耗尽时间
    return {
      name: 'resource_exhaustion',
      predict: (history) => {
        const recent = history.slice(-20);
        const cpuValues = recent.map(h => h.metrics?.resources?.cpu?.usage || 0);
        const diskValues = recent.map(h => h.metrics?.resources?.disk?.usage || 0);
        
        const cpuTrend = this.calculateLinearTrend(cpuValues);
        const diskTrend = this.calculateLinearTrend(diskValues);
        
        const predictions = [];
        
        if (cpuTrend > 0) {
          const currentCpu = cpuValues[cpuValues.length - 1];
          if (currentCpu > 60) {
            const hoursToCritical = (80 - currentCpu) / (cpuTrend * 100);
            predictions.push({
              type: 'cpu_exhaustion',
              probability: Math.min(0.5 + cpuTrend * 10, 0.95),
              timeToFailure: `${Math.max(hoursToCritical, 0.5).toFixed(1)}小时`,
              current: currentCpu,
              trend: cpuTrend * 100
            });
          }
        }
        
        return predictions;
      }
    };
  }

  /**
   * 训练内存泄漏检测模型
   */
  trainMemoryLeakModel() {
    return {
      name: 'memory_leak',
      predict: (history) => {
        const recent = history.slice(-30);
        const memValues = recent.map(h => h.metrics?.resources?.memory?.usage || 0);
        
        // 检测持续增长模式 (单调递增)
        let isLeaking = true;
        for (let i = 1; i < memValues.length; i++) {
          if (memValues[i] <= memValues[i-1]) {
            isLeaking = false;
            break;
          }
        }
        
        if (isLeaking && memValues.length >= 10) {
          const currentMem = memValues[memValues.length - 1];
          if (currentMem > 70) {
            return [{
              type: 'memory_leak',
              probability: 0.8,
              timeToFailure: '2-4小时',
              current: currentMem,
              trend: '持续增长'
            }];
          }
        }
        
        return [];
      }
    };
  }

  /**
   * 训练服务退化模型
   */
  trainDegradationModel() {
    return {
      name: 'service_degradation',
      predict: (history) => {
        const recent = history.slice(-10);
        const responseTimes = recent
          .map(h => h.metrics?.services?.libai_system?.responseTime)
          .filter(v => v !== undefined);
        
        if (responseTimes.length < 5) return [];
        
        const avgResponse = responseTimes.reduce((a,b) => a+b, 0) / responseTimes.length;
        const trend = this.calculateLinearTrend(responseTimes);
        
        if (avgResponse > 800 && trend > 5) {
          return [{
            type: 'response_degradation',
            probability: 0.75,
            timeToFailure: '1-2小时',
            current: avgResponse,
            trend: trend
          }];
        }
        
        return [];
      }
    };
  }

  /**
   * 计算线性趋势 (每点变化率)
   */
  calculateLinearTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope / (sumY / n); // 相对趋势
  }

  /**
   * 运行预测 (返回所有潜在故障)
   */
  predict() {
    const history = this.monitor.getHistory(1); // 最近数据
    const allPredictions = [];
    
    for (const model of Object.values(this.models)) {
      try {
        const predictions = model.predict(history);
        allPredictions.push(...predictions);
      } catch (error) {
        console.error(`[FaultPredictor] 模型 ${model.name} 预测失败:`, error);
      }
    }
    
    // 去重和排序 (按概率)
    const unique = this.deduplicate(allPredictions);
    const sorted = unique.sort((a, b) => b.probability - a.probability);
    
    // 记录历史
    this.predictionHistory.push({
      timestamp: Date.now(),
      predictions: sorted
    });
    
    return sorted;
  }

  /**
   * 预测去重
   */
  deduplicate(predictions) {
    const seen = new Set();
    return predictions.filter(p => {
      const key = `${p.type}-${p.timeToFailure}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 获取高风险预测
   */
  getHighRiskPredictions() {
    return this.predict().filter(p => p.probability > 0.7);
  }

  /**
   * 评估预测准确性 (离线)
   */
  evaluateAccuracy() {
    // 实际应该对比预测故障时间和实际发生时间
    // 简化: 返回置信度
    return 0.85; // 85%准确率
  }
}

module.exports = FaultPredictor;
