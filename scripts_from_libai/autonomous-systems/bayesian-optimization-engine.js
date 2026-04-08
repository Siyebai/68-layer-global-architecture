#!/usr/bin/env node
// Bayesian Optimization Engine - V7.3
// 贝叶斯优化: 基于高斯过程的超参数优化

class BayesianOptimizationEngine {
  constructor() {
    this.name = 'bayesian-optimization';
    this.enabled = true;
    this.observations = []; // (x, y) 观测点
    this.gp = null;         // 高斯过程模型
    this.acquisitionFunction = 'ei'; // expected improvement
    this.bounds = {};       // 参数边界
    this.bestX = null;
    this.bestY = -Infinity;
    this.iterations = 0;
    this.maxIterations = 50;
    this.explorationWeight = 2.0; // UCB参数
  }

  // 设置搜索空间
  setBounds(paramBounds) {
    this.bounds = paramBounds;
    const dim = Object.keys(paramBounds).length;
    this.gp = new GaussianProcess(dim);
    console.log(`[BayesianOpt] Set ${dim} dimensional search space`);
  }

  // 添加观测点
  addObservation(x, y) {
    this.observations.push({ x, y });
    
    if (y > this.bestY) {
      this.bestY = y;
      this.bestX = x;
    }
    
    // 更新高斯过程
    this.gp.fit(this.observations.map(o => o.x), this.observations.map(o => o.y));
  }

  // 建议下一个评估点
  suggestNext() {
    if (this.observations.length === 0) {
      // 首次评估: 随机采样
      return this.randomSample();
    }

    // 使用采集函数优化
    const result = this.optimizeAcquisition();
    return result.x;
  }

  // 优化采集函数
  optimizeAcquisition() {
    let bestX = null;
    let bestAcq = -Infinity;
    
    // 多起点优化 (简化: 随机采样+局部搜索)
    const restarts = 10;
    
    for (let i = 0; i < restarts; i++) {
      const x0 = this.randomSample();
      const result = this.localOptimizeAcquisition(x0);
      
      if (result.acq > bestAcq) {
        bestAcq = result.acq;
        bestX = result.x;
      }
    }
    
    return { x: bestX, acquisition: bestAcq };
  }

  // 局部优化采集函数
  localOptimizeAcquisition(x0, maxIter = 20) {
    let x = x0;
    const lr = 0.1;
    
    for (let iter = 0; iter < maxIter; iter++) {
      const { grad, acq } = this.acquisitionGradient(x);
      
      if (grad.length === 0) break;
      
      // 梯度上升
      for (let i = 0; i < grad.length; i++) {
        const key = Object.keys(this.bounds)[i];
        const [min, max] = this.bounds[key];
        x[key] = Math.max(min, Math.min(max, x[key] + lr * grad[i]));
      }
      
      if (Math.abs(acq - this.acquisition(x)) < 1e-6) break;
    }
    
    return { x, acq: this.acquisition(x) };
  }

  // 计算采集函数值
  acquisition(x) {
    const { mean, std } = this.gp.predict(x);
    
    switch (this.acquisitionFunction) {
      case 'ei': // Expected Improvement
        return this.expectedImprovement(mean, std);
      case 'ucb': // Upper Confidence Bound
        return mean + this.explorationWeight * std;
      case 'poi': // Probability of Improvement
        return this.probabilityOfImprovement(mean, std);
      default:
        return this.expectedImprovement(mean, std);
    }
  }

  // 采集函数梯度
  acquisitionGradient(x) {
    const { mean: m, std: s, dmean, dstd } = this.gp.predictWithGradient(x);
    
    if (s === 0) return { grad: [], acq: m };
    
    const z = (this.bestY - m) / s;
    const pdf = this.normalPDF(z);
    const cdf = this.normalCDF(z);
    
    let acq, grad = [];
    
    switch (this.acquisitionFunction) {
      case 'ei':
        acq = s * (pdf + z * cdf);
        const eiGrad = -pdf * (dmean.map((dm, i) => dm * s + (m - this.bestY) * dstd[i])) / (s * s);
        grad = eiGrad;
        break;
      case 'ucb':
        acq = m + this.explorationWeight * s;
        grad = dmean.map((dm, i) => dm + this.explorationWeight * dstd[i]);
        break;
      default:
        acq = m + this.explorationWeight * s;
        grad = dmean.map((dm, i) => dm + this.explorationWeight * dstd[i]);
    }
    
    return { acq, grad };
  }

  // 期望改进
  expectedImprovement(mean, std) {
    if (std === 0) return 0;
    const z = (this.bestY - mean) / std;
    return std * (this.normalPDF(z) + z * this.normalCDF(z));
  }

  // 改进概率
  probabilityOfImprovement(mean, std) {
    if (std === 0) return 0;
    const z = (this.bestY - mean) / std;
    return this.normalCDF(z);
  }

  normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  normalCDF(x) {
    // 近似误差函数
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  // 随机采样
  randomSample() {
    const sample = {};
    for (const [key, [min, max]] of Object.entries(this.bounds)) {
      sample[key] = min + Math.random() * (max - min);
    }
    return sample;
  }

  // 运行优化
  async optimize(objectiveFn, initialObservations = []) {
    console.log('[BayesianOpt] Starting Bayesian optimization...');
    
    // 添加初始观测
    for (const obs of initialObservations) {
      const y = await objectiveFn(obs.x);
      this.addObservation(obs.x, y);
    }
    
    while (this.iterations < this.maxIterations) {
      // 建议下一个点
      const nextX = this.suggestNext();
      const nextY = await objectiveFn(nextX);
      
      this.addObservation(nextX, nextY);
      this.iterations++;
      
      if (this.iterations % 5 === 0) {
        console.log(`[BayesianOpt] Iter ${this.iterations}: best=${this.bestY.toFixed(4)}`);
      }
      
      // 收敛检查
      if (this.iterations >= 5) {
        const recent = this.observations.slice(-5);
        const improvement = Math.abs(recent[4].y - recent[0].y);
        if (improvement < 1e-4) {
          console.log('[BayesianOpt] Converged');
          break;
        }
      }
    }
    
    return {
      bestX: this.bestX,
      bestY: this.bestY,
      iterations: this.iterations,
      observations: this.observations.length,
      history: this.rewardHistory
    };
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      iterations: this.iterations,
      bestValue: this.bestY,
      observationsCount: this.observations.length,
      acquisitionFunction: this.acquisitionFunction,
      explorationWeight: this.explorationWeight,
      status: 'active'
    };
  }
}

// 简化的高斯过程 (使用RBF核)
class GaussianProcess {
  constructor(dim) {
    this.dim = dim;
    this.X = [];
    this.y = [];
    this.K = null;
    this.Kinv = null;
    this.lengthScale = 1.0;
    this.signalVariance = 1.0;
    this.noiseVariance = 1e-6;
  }

  fit(X, y) {
    this.X = X;
    this.y = y;
    this.K = this.computeKernelMatrix(X);
    
    // 添加噪声
    for (let i = 0; i < this.K.length; i++) {
      this.K[i][i] += this.noiseVariance;
    }
    
    this.Kinv = this.inverse(this.K);
  }

  computeKernelMatrix(X) {
    const n = X.length;
    const K = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const k = this.rbfKernel(X[i], X[j]);
        K[i][j] = k;
        K[j][i] = k;
      }
    }
    
    return K;
  }

  rbfKernel(x1, x2) {
    let sum = 0;
    for (let i = 0; i < this.dim; i++) {
      sum += Math.pow(x1[i] - x2[i], 2);
    }
    return this.signalVariance * Math.exp(-sum / (2 * this.lengthScale * this.lengthScale));
  }

  inverse(A) {
    const n = A.length;
    // 使用高斯消元法求逆 (简化, 仅用于小矩阵)
    const I = Array(n).fill(null).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
    
    // 合并矩阵 [A|I]
    for (let i = 0; i < n; i++) {
      A[i] = A[i].concat(I[i]);
    }
    
    // 高斯-若尔当消元
    for (let i = 0; i < n; i++) {
      // 找主元
      let maxRow = i;
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) {
          maxRow = j;
        }
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      
      // 归一化
      const pivot = A[i][i];
      for (let j = i; j < 2 * n; j++) {
        A[i][j] /= pivot;
      }
      
      // 消元
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = i; j < 2 * n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }
    }
    
    // 提取逆矩阵
    const inv = A.map(row => row.slice(n));
    return inv;
  }

  predict(x) {
    if (this.X.length === 0) return { mean: 0, std: 1 };
    
    const k = this.X.map(xi => this.rbfKernel(xi, x));
    const kstar = this.rbfKernel(x, x) + this.noiseVariance;
    
    // 计算均值和方差
    const KinvK = this.matrixVectorMultiply(this.Kinv, k);
    const mean = this.dotProduct(KinvK, this.y);
    const variance = kstar - this.dotProduct(k, KinvK);
    const std = Math.sqrt(Math.max(variance, 1e-10));
    
    return { mean, std };
  }

  predictWithGradient(x) {
    // 简化: 数值梯度
    const eps = 1e-5;
    const { mean, std } = this.predict(x);
    
    const dmean = [];
    const dstd = [];
    
    for (let i = 0; i < this.dim; i++) {
      const xPlus = { ...x };
      xPlus[i] += eps;
      const { mean: mPlus, std: sPlus } = this.predict(xPlus);
      
      dmean.push((mPlus - mean) / eps);
      dstd.push((sPlus - std) / eps);
    }
    
    return { mean, std, dmean, dstd };
  }

  dotProduct(a, b) {
    return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  }

  matrixVectorMultiply(A, v) {
    return A.map(row => this.dotProduct(row, v));
  }
}

module.exports = { BayesianOptimizationEngine };
