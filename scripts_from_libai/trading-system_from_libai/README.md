# 交易系统 — Binance AI 整合版

基于 `libai-workspace` 仓库知识库，融合接入币安 API。

## 系统架构

```
trading-system/
├── signals/         # 信号引擎 (多周期共振 A/B/C/D分级)
├── risk/            # 风控模块 (ATR止损 + Kelly仓位 + 日亏上限)
├── arbitrage/       # 套利扫描 (资金费率 + 反转预警)
├── agents/          # 自主优化 (遗传算法 + 在线自适应)
├── backtest/        # 回测框架 (手续费/滑点/详细统计)
└── data/            # 数据层 (历史K线缓存)
```

## 知识来源 (对标仓库模块)

| 本系统模块 | 对标仓库文件 |
|-----------|-------------|
| signal_engine.py | contract-trading/signals/signal-engine.js |
| risk_controller.py | contract-trading/risk/contract-risk.js + lib/risk-manager.js |
| arbitrage_scanner.py | contract-trading/agents/arbitrage-scanner.js + funding-rate-monitor.js |
| autonomous_optimizer.py | lib/autonomous-learning/genetic-optimizer.js + multi-agent-deep-v4.md |
| backtest.py | contract-trading/backtest/backtest.js |

## 当前回测结果

| 品种 | 周期 | 胜率 | 盈亏比 | 最大回撤 |
|------|------|------|--------|---------|
| BTC | 4h | 50.0% | 1.17 | 1.33% |
| ETH | 4h | 42.9% | 1.14 | 2.40% |
| SOL | 1h | 36.4% | 0.87 | 0.84% |

> 参数待遗传算法优化后重新回测

## 运行

```bash
# 信号扫描
python3 signals/signal_engine.py

# 套利扫描
python3 arbitrage/arbitrage_scanner.py

# 参数优化
python3 agents/autonomous_optimizer.py

# 回测
python3 backtest/backtest.py
```

## 下一步

1. 遗传算法优化参数后接入回测适应度函数
2. 资金费率套利 dryRun 模拟 50 笔
3. 多智能体协调层接入 (event-bus)
4. 实盘前完成 50 笔 dryRun 验证
