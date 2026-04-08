# 李白合约交易系统 - 高胜率版

## 🎯 系统概述

基于 V26.0 自主学习进化版架构，专为**合约交易**设计的高胜率交易系统。

**核心特性**:
- ✅ 完整合约API支持 (OKX 永续/交割)
- ✅ 11种技术指标实时计算
- ✅ 信号融合引擎 (多策略权重投票)
- ✅ 高胜率交易策略 (趋势跟踪 + 均值回归 + 突破确认)
- ✅ 专业回测引擎 + 绩效分析
- ✅ 动态仓位管理 (凯利公式)
- ✅ 自适应止损止盈 (ATR)
- ✅ 资金费率监控

---

## 📦 组件清单

### 核心交易模块

| 文件 | 功能 | 状态 |
|------|------|------|
| `products/exchange-adapters/okx-contract-client.js` | OKX合约客户端 (REST+WS) | ✅ 10,845 字节 |
| `products/contract-trading-system/strategies/technical-indicators.js` | 技术指标库 (11种) | ✅ 7,600 字节 |
| `products/contract-trading-system/strategies/signal-fusion-engine.js` | 信号融合引擎 | ✅ 5,412 字节 |
| `products/contract-trading-system/strategies/high-winrate-strategy.js` | 高胜率策略 | ✅ 10,177 字节 |
| `products/contract-trading-system/backtest/backtest-engine.js` | 回测引擎 | ✅ 9,500 字节 |
| `config/contract-trading.yaml` | 合约交易配置 | ✅ 2,268 字节 |

**总代码量**: 45,802 字节 (≈45KB)

---

## 🧠 技术指标库

### 支持的指标 (11种)

| 指标 | 用途 | 参数 |
|------|------|------|
| SMA | 简单移动平均 | period (默认20) |
| EMA | 指数移动平均 | period (默认20) |
| MACD | 指数平滑异同平均 | fast=12, slow=26, signal=9 |
| RSI | 相对强弱指数 | period=14, overbought=70, oversold=30 |
| KDJ | 随机指标 | period=14, kPeriod=3, dPeriod=3 |
| Bollinger Bands | 布林带 | period=20, stdDev=2 |
| ATR | 真实波幅均值 | period=14 |
| VWAP | 成交量加权平均价 | period=20 |
| 多周期均线 | MA5/10/20/50/100/200 | 自动计算 |
| 金叉/死叉检测 | 交叉信号识别 | 自动 |
| 超买/超卖 | 市场状态判断 | 基于RSI |

---

## 🎯 高胜率策略

### 信号源 (8种)

1. **MACD 金叉/死叉** (权重 0.6)
2. **RSI 超买/超卖** (权重 0.55)
3. **KDJ 金叉/死叉** (权重 0.5+)
4. **布林带突破** (权重 0.6)
5. **均线系统排列** (权重 0.65)
6. **资金费率异常** (权重 0.5)
7. **成交量确认** ( multiplier 1.2x 或 0.7x)
8. **ATR 动态止损** (基于波动率)

### 决策逻辑

```
综合置信度 = 加权投票 / 总权重
动作 = buy/sell/hold
最低置信度阈值 = 0.65
```

### 风控参数

- 止损: 2倍 ATR
- 止盈: 3倍 ATR
- 最大杠杆: 5x
- 最大仓位: $10,000
- 最小置信度: 0.65

---

## 🔄 信号融合引擎

### 功能

- 动态注册多个策略
- 基于表现自动调整权重
- 市场状态识别 (趋势/震荡/高波动)
- 策略表现排名 (胜率、利润因子、夏普比率)

### 使用方式

```javascript
const fusion = new SignalFusionEngine();

// 注册策略
fusion.registerStrategy('high_winrate', 1.0);
fusion.registerStrategy('arbitrage', 0.8);
fusion.registerStrategy('ml_predictor', 0.6);

// 接收各策略信号
fusion.receiveSignal('high_winrate', signal, marketContext);

// 生成最终决策
const decision = fusion.fuseSignals(marketContext);
// { action: 'buy', confidence: 0.72, votes: {buy: 1.8, sell: 0.6, hold: 0.2}, ... }
```

---

## 📊 回测引擎

### 特性

- 快速历史数据回测
- 完整交易模拟 (开仓/平仓/止损/止盈)
- 手续费 + 滑点建模
- 实时权益曲线
- 绩效指标自动计算

### 输出指标

| 指标 | 说明 |
|------|------|
| 总交易数 | 完成的交易次数 |
| 胜率 | 盈利交易占比 |
| 总盈亏 | 绝对收益金额 |
| 利润因子 | 总盈利 / 总亏损 |
| 最大回撤 | 峰值到谷值的最大跌幅 |
| 平均盈利 | 平均每笔盈利 |
| 平均亏损 | 平均每笔亏损 |
| 平均ROI | 平均投资回报率 |
| 夏普比率 | 风险调整收益 |
| 最终权益 | 回测结束时的总资产 |

### 使用方法

```javascript
const BacktestEngine = require('./backtest/backtest-engine');
const HighWinrateStrategy = require('./strategies/high-winrate-strategy');

const client = new OKXContractClient({ /* 配置 */ });
const strategy = new HighWinrateStrategy(client);
const backtest = new BacktestEngine(client, strategy, {
  initialCapital: 10000,
  leverage: 5,
  symbol: 'BTC-USDT-SWAP',
});

// 运行回测 (candles为K线数据数组)
const report = await backtest.run(candles);
backtest.printSummary();

// 导出详细报告
await backtest.exportReport('./reports');
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /root/.openclaw/workspace/libai-workspace
npm ci --only=production
```

### 2. 配置环境变量

编辑 `.env` 文件，确保包含:

```env
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_okx_secret
OKX_PASSPHRASE=your_okx_passphrase
```

### 3. 配置合约交易

编辑 `config/contract-trading.yaml`:

```yaml
okx_contract:
  enabled: true
  trading:
    symbols:
      - "BTC-USDT-SWAP"
      - "ETH-USDT-SWAP"
```

### 4. 启动系统

```bash
./scripts/start.sh
```

### 5. 验证运行

```bash
# 健康检查
curl http://localhost:3000/health

# 查看状态 (应显示 288 Agent)
curl http://localhost:3000/status | jq '.agents.total'
```

---

## 📈 监控接口

V26.0 新增接口:

| 端点 | 说明 |
|------|------|
| `GET /health` | 系统健康检查 |
| `GET /status` | 完整系统状态 (Agent数、指标) |
| `GET /learning-status` | 自主学习引擎状态 |
| `GET /evolution-status` | 自主进化引擎状态 |
| `GET /contract-status` | 合约交易状态 (新增) |
| `GET /performance` | 策略绩效报告 (新增) |

---

## 🔧 自定义策略

### 创建新策略

```javascript
class MyCustomStrategy {
  constructor(client, config) {
    this.client = client;
    this.config = config;
  }

  async generateSignal(symbol) {
    // 1. 获取数据
    const candles = await this.client.getCandles(symbol, '15m', 100);

    // 2. 分析
    // ... 你的逻辑 ...

    // 3. 返回信号
    return {
      action: 'buy',        // buy / sell / hold
      confidence: 0.75,      // 0-1
      reason: 'my_custom_reason',
      stopLoss: price * 0.98,
      takeProfit: price * 1.05,
      positionSize: 100,
      leverage: 3,
    };
  }

  getPerformance() {
    return { name: 'MyStrategy', type: 'custom' };
  }
}
```

### 注册到融合引擎

```javascript
const fusion = new SignalFusionEngine();
const myStrategy = new MyCustomStrategy(client);

fusion.registerStrategy('my_custom', 1.0);

// 在主循环中
setInterval(async () => {
  const signal = await myStrategy.generateSignal('BTC-USDT-SWAP');
  fusion.receiveSignal('my_custom', signal, marketContext);
}, 60000); // 每分钟
```

---

## 📊 绩效跟踪

### 自动记录

- 每笔交易自动记录到数据库 `trades` 表
- 每日/周绩效报告 (通过 Telegram Bot 推送)
- 实时收益曲线 (Prometheus metrics)

### 手动查询

```sql
-- 总盈亏
SELECT SUM(profit) FROM trades WHERE user_id = 'your_user_id';

-- 胜率
SELECT COUNT(*) FILTER (WHERE profit > 0) * 100.0 / COUNT(*) as win_rate
FROM trades WHERE user_id = 'your_user_id';

-- 最大回撤 (简化)
SELECT MAX(drawdown) FROM (
  SELECT (MAX(equity) - equity) / MAX(equity) * 100 as drawdown
  FROM equity_curve
  WHERE user_id = 'your_user_id'
) sub;
```

---

## ⚠️ 风险提示

1. **合约交易风险极高**，可能导致本金全部亏损
2. 务必先在**测试网** (OKX Demo) 验证策略
3. 从小仓位开始，不超过总资产的 1-5%
4. 系统提供自适应止损，但极端行情仍可能滑点
5. 定期检查绩效，低于预期时暂停交易

---

## 📞 文档与支持

- 快速启动: `QUICKSTART.md`
- 部署报告: `DEPLOYMENT-REPORT.md`
- V26升级: `V26-UPGRADE-REPORT.md`
- API文档: `docs/v24-api-documentation.md`
- 故障排除: `docs/troubleshooting.md`
- 知识库: `knowledge/` (14个文档)

---

## ✅ 功能完成度

| 功能模块 | 完成度 | 说明 |
|----------|--------|------|
| OKX 合约客户端 | 100% | REST + WS，完整订单/持仓/杠杆管理 |
| 技术指标库 | 100% | 11种指标，实时计算 |
| 高胜率策略 | 100% | 8重信号融合，动态风控 |
| 信号融合引擎 | 100% | 多策略权重投票，自动调权 |
| 回测系统 | 100% | 快速回测 + 绩效分析 |
| 配置管理 | 100% | 独立的 contract-trading.yaml |
| 文档 | 100% | 完整的使用指南和API说明 |

---

**状态**: ✅ 合约交易系统已就绪，可立即部署使用

**下一步**: 配置真实API密钥 → 测试网验证 → 小资金实盘测试 → 监控优化

---

**C李白**  
2026-03-30 20:35