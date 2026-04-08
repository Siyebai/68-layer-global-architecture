#!/usr/bin/env node
// 二进制序列化优化器
// 目标: 将JSON状态序列化时间从12ms降至4ms (节省8ms)

const { performance } = require('perf_hooks');

class BinarySerializer {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.compressionEnabled = true;
    this.cache = new Map(); // 缓存常用状态
    this.cacheMaxSize = 1000;
  }

  // 序列化状态对象为二进制Buffer
  serialize(state) {
    const start = performance.now();

    // 1. 检查缓存
    const cacheKey = this._generateCacheKey(state);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 2. JSON序列化 (最快方式)
    const json = JSON.stringify(state);

    // 3. 转换为二进制
    let buffer = this.encoder.encode(json);

    // 4. 可选压缩 (如果数据量大)
    if (this.compressionEnabled && buffer.length > 1024) {
      buffer = this._compress(buffer);
    }

    // 5. 缓存结果
    if (this.cache.size < this.cacheMaxSize) {
      this.cache.set(cacheKey, buffer);
    }

    const duration = performance.now() - start;
    if (duration > 5) {
      console.warn(`[BinarySerializer] 序列化耗时过长: ${duration.toFixed(2)}ms`);
    }

    return buffer;
  }

  // 反序列化二进制Buffer为状态对象
  deserialize(buffer) {
    const start = performance.now();

    // 1. 解压缩 (如果压缩过)
    let data = buffer;
    if (this._isCompressed(buffer)) {
      data = this._decompress(buffer);
    }

    // 2. 二进制转字符串
    const json = this.decoder.decode(data);

    // 3. JSON解析
    const state = JSON.parse(json);

    const duration = performance.now() - start;
    if (duration > 5) {
      console.warn(`[BinarySerializer] 反序列化耗时过长: ${duration.toFixed(2)}ms`);
    }

    return state;
  }

  // 生成缓存键 (基于状态内容的哈希)
  _generateCacheKey(state) {
    // 简化版: 使用关键字段组合
    const keyParts = [
      state.moduleName || 'unknown',
      state.timestamp || 0,
      state.status || 'empty',
      Object.keys(state).sort().join(',')
    ];
    return keyParts.join('|');
  }

  // 检查是否压缩
  _isCompressed(buffer) {
    // 假设使用0x1F 0x8B (gzip魔数) 或自定义魔数
    return buffer[0] === 0x1F && buffer[1] === 0x8B;
  }

  // 压缩 (简单实现,生产环境可用zlib)
  _compress(buffer) {
    // 这里简化: 实际可用zlib.gzip
    // 返回原buffer表示未压缩
    return buffer;
  }

  // 解压缩
  _decompress(buffer) {
    // 对应压缩逻辑
    return buffer;
  }

  // 清空缓存
  clearCache() {
    this.cache.clear();
    console.log('[BinarySerializer] 缓存已清空');
  }

  // 获取缓存统计
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hitCount: 0, // 可添加命中统计
      missCount: 0
    };
  }
}

// 使用示例
if (require.main === module) {
  const serializer = new BinarySerializer();

  // 测试状态对象
  const testState = {
    moduleName: 'autonomous-five-layer',
    timestamp: Date.now(),
    status: 'running',
    autonomy: 105,
    metrics: {
      accuracy: 86.9,
      efficiency: 90.34
    }
  };

  console.log('=== 二进制序列化器测试 ===');
  console.log('原始状态:', JSON.stringify(testState, null, 2));

  const start = performance.now();
  const buffer = serializer.serialize(testState);
  const serializedTime = performance.now() - start;

  console.log(`\n序列化后: Buffer[${buffer.length} bytes]`);
  console.log(`序列化耗时: ${serializedTime.toFixed(3)}ms`);

  const deserialized = serializer.deserialize(buffer);
  console.log('\n反序列化结果:', JSON.stringify(deserialized, null, 2));

  console.log('\n缓存统计:', serializer.getStats());
  console.log('\n✅ 测试完成');
}

module.exports = BinarySerializer;