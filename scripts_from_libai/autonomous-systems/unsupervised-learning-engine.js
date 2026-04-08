#!/usr/bin/env node
// Unsupervised Learning Engine - V7.3
// 无监督学习：自动发现数据中的模式和结构

class UnsupervisedLearningEngine {
  constructor() {
    this.name = 'unsupervised-learning';
    this.enabled = true;
    this.clusters = new Map(); // 聚类结果
    this.anomalies = [];       // 异常检测结果
    this.dimReduction = null;  // 降维模型
    this.patterns = new Map(); // 发现的模式
    this.minClusterSize = 5;
    this.anomalyThreshold = 0.95; // 异常得分阈值
  }

  // K-means聚类 (简化版)
  kmeans(data, k = 3, maxIterations = 100) {
    if (data.length < k) {
      throw new Error(`Data size (${data.length}) < k (${k})`);
    }

    // 1. 初始化质心 (随机选择k个点)
    const centroids = [];
    for (let i = 0; i < k; i++) {
      centroids.push({ ...data[Math.floor(Math.random() * data.length)] });
    }

    const clusters = new Array(k).fill(null).map(() => []);

    // 2. 迭代优化
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // 清空聚类
      for (let i = 0; i < k; i++) clusters[i] = [];

      // 分配点到最近质心
      for (const point of data) {
        let minDist = Infinity;
        let clusterIdx = 0;

        for (let i = 0; i < k; i++) {
          const dist = this.euclideanDistance(point, centroids[i]);
          if (dist < minDist) {
            minDist = dist;
            clusterIdx = i;
          }
        }

        clusters[clusterIdx].push(point);
      }

      // 更新质心
      let changed = false;
      for (let i = 0; i < k; i++) {
        if (clusters[i].length === 0) continue;

        const newCentroid = this.calculateCentroid(clusters[i]);
        if (this.euclideanDistance(newCentroid, centroids[i]) > 0.001) {
          changed = true;
          centroids[i] = newCentroid;
        }
      }

      if (!changed) break;
    }

    // 过滤小聚类
    const validClusters = clusters.filter(c => c.length >= this.minClusterSize);

    return {
      centroids,
      clusters: validClusters,
      inertia: this.calculateInertia(data, centroids),
      iterations: iteration + 1
    };
  }

  // 欧几里得距离
  euclideanDistance(a, b) {
    let sum = 0;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    for (const key of keysA) {
      if (keysB.includes(key)) {
        sum += Math.pow(a[key] - b[key], 2);
      }
    }
    return Math.sqrt(sum);
  }

  // 计算质心
  calculateCentroid(points) {
    if (points.length === 0) return null;

    const centroid = {};
    const keys = Object.keys(points[0]);

    for (const key of keys) {
      let sum = 0;
      for (const point of points) {
        sum += point[key];
      }
      centroid[key] = sum / points.length;
    }

    return centroid;
  }

  // 计算聚类内误差平方和
  calculateInertia(data, centroids) {
    let inertia = 0;
    for (const point of data) {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = this.euclideanDistance(point, centroid);
        if (dist < minDist) minDist = dist;
      }
      inertia += Math.pow(minDist, 2);
    }
    return inertia;
  }

  // 异常检测 (基于聚类)
  detectAnomalies(data, clusteringResult) {
    const { centroids } = clusteringResult;
    const anomalies = [];

    for (const point of data) {
      // 找到最近质心的距离
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = this.euclideanDistance(point, centroid);
        if (dist < minDist) minDist = dist;
      }

      // 如果距离大于阈值，视为异常
      const threshold = this.calculateAnomalyThreshold(clusteringResult);
      if (minDist > threshold) {
        anomalies.push({
          point,
          distance: minDist,
          threshold,
          isAnomaly: true
        });
      }
    }

    this.anomalies = anomalies;
    return anomalies;
  }

  calculateAnomalyThreshold(clusteringResult) {
    // 使用聚类距离的95%分位数作为阈值
    const distances = [];
    for (const cluster of clusteringResult.clusters) {
      const centroid = clusteringResult.centroids[
        clusteringResult.clusters.indexOf(cluster)
      ];
      for (const point of cluster) {
        distances.push(this.euclideanDistance(point, centroid));
      }
    }

    if (distances.length === 0) return 0;

    distances.sort((a, b) => a - b);
    const idx = Math.floor(distances.length * this.anomalyThreshold);
    return distances[idx] || distances[distances.length - 1];
  }

  // 降维: PCA (简化版)
  principalComponentAnalysis(data, nComponents = 2) {
    if (data.length === 0) return null;

    // 1. 标准化数据
    const normalized = this.standardizeData(data);

    // 2. 计算协方差矩阵
    const covariance = this.calculateCovariance(normalized);

    // 3. 计算特征值和特征向量
    const eigen = this.powerIteration(covariance, nComponents);

    // 4. 投影数据
    const projected = normalized.map(point => {
      const newPoint = {};
      for (let i = 0; i < nComponents; i++) {
        let value = 0;
        for (const key of Object.keys(point)) {
          const idx = Object.keys(normalized[0]).indexOf(key);
          if (idx !== -1) {
            value += point[key] * eigen.vectors[i][idx];
          }
        }
        newPoint[`pc${i + 1}`] = value;
      }
      return newPoint;
    });

    this.dimReduction = {
      method: 'pca',
      nComponents,
      eigenvalues: eigen.values,
      explainedVariance: eigen.values.map(v => v / eigen.values.reduce((a, b) => a + b, 0))
    };

    return projected;
  }

  standardizeData(data) {
    const keys = Object.keys(data[0]);
    const stats = {};

    // 计算均值和标准差
    for (const key of keys) {
      const values = data.map(d => d[key]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      stats[key] = { mean, std: Math.sqrt(variance) };
    }

    // 标准化
    return data.map(point => {
      const normalized = {};
      for (const key of keys) {
        const { mean, std } = stats[key];
        normalized[key] = std === 0 ? 0 : (point[key] - mean) / std;
      }
      return normalized;
    });
  }

  calculateCovariance(data) {
    const n = data.length;
    const keys = Object.keys(data[0]);
    const covariance = {};

    for (const key1 of keys) {
      covariance[key1] = {};
      for (const key2 of keys) {
        let sum = 0;
        for (const point of data) {
          sum += point[key1] * point[key2];
        }
        covariance[key1][key2] = sum / (n - 1);
      }
    }

    return covariance;
  }

  // 幂迭代法求特征值和特征向量 (简化)
  powerIteration(matrix, k) {
    const keys = Object.keys(matrix);
    const values = [];
    const vectors = [];

    for (let i = 0; i < k; i++) {
      // 随机初始化向量
      let v = keys.map(() => Math.random());
      v = this.normalize(v);

      // 迭代
      for (let iter = 0; iter < 100; iter++) {
        const Av = keys.map(key => {
          let sum = 0;
          for (const key2 of keys) {
            sum += matrix[key][key2] * v[keys.indexOf(key2)];
          }
          return sum;
        });
        v = this.normalize(Av);
      }

      // 计算特征值
      const Av = keys.map(key => {
        let sum = 0;
        for (const key2 of keys) {
          sum += matrix[key][key2] * v[keys.indexOf(key2)];
        }
        return sum;
      });
      const eigenvalue = v.reduce((sum, vi, i) => sum + vi * Av[i], 0);

      values.push(eigenvalue);
      vectors.push(v);

      // 投影移除 (简化,实际应使用Gram-Schmidt正交化)
    }

    return { values, vectors };
  }

  normalize(vector) {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vector.map(v => v / norm) : vector;
  }

  // 发现频繁模式 (简化版 FP-Growth 概念)
  discoverFrequentPatterns(data, minSupport = 0.1) {
    // 将数据转换为事务集合
    const transactions = data.map(d => {
      const items = [];
      for (const [key, value] of Object.entries(d)) {
        if (value > 0.5) { // 二值化阈值
          items.push(key);
        }
      }
      return items;
    });

    // 计算项集频率
    const itemCounts = new Map();
    for (const transaction of transactions) {
      for (const item of transaction) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    // 过滤频繁项
    const frequentItems = new Map();
    for (const [item, count] of itemCounts) {
      const support = count / transactions.length;
      if (support >= minSupport) {
        frequentItems.set(item, { count, support });
      }
    }

    // 生成简单模式 (简化: 仅1-项集)
    this.patterns = new Map();
    for (const [item, info] of frequentItems) {
      this.patterns.set(item, {
        items: [item],
        support: info.support,
        count: info.count
      });
    }

    return [...this.patterns.values()];
  }

  // 自动学习: 对输入数据进行聚类并发现模式
  async autoLearn(data, options = {}) {
    const startTime = Date.now();

    try {
      // 1. 聚类
      const k = options.k || Math.max(3, Math.floor(Math.sqrt(data.length / 2)));
      const clustering = this.kmeans(data, k);

      // 2. 异常检测
      const anomalies = this.detectAnomalies(data, clustering);

      // 3. 降维 (如果数据维度>2)
      let projected = null;
      if (Object.keys(data[0]).length > 2 && options.dimReduction !== false) {
        projected = this.principalComponentAnalysis(data, 2);
      }

      // 4. 发现模式
      const patterns = this.discoverFrequentPatterns(data);

      const duration = Date.now() - startTime;

      return {
        success: true,
        clustering,
        anomalies: {
          count: anomalies.length,
          items: anomalies.slice(0, 10) // 仅返回前10个
        },
        dimensionalityReduction: this.dimReduction,
        patterns: {
          count: patterns.length,
          items: patterns.slice(0, 20)
        },
        projected: projected ? projected.slice(0, 5) : null,
        duration,
        dataSize: data.length
      };
    } catch (error) {
      console.error('[UnsupervisedLearning] Error:', error.message);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      clustersCount: this.clusters.size,
      anomaliesCount: this.anomalies.length,
      patternsCount: this.patterns.size,
      dimReductionApplied: this.dimReduction !== null,
      replayBufferSize: this.replayBuffer.length,
      status: 'active'
    };
  }
}

module.exports = { UnsupervisedLearningEngine };
