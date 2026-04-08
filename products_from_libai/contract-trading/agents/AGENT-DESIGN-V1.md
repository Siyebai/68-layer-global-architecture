# 合约交易多智能体系统设计 V1.0
## 2026-03-29 | 无缝协作架构

---

## 一、系统全景设计

```
┌─────────────────────────────────────────────────────────────┐
│           🌟 事件驱动统一中枢（event-bus PORT 19958）        │
├─────────────────────────────────────────────────────────────┤
│  市场事件 ← → 信号事件 ← → 决策事件 ← → 执行事件 ← → 反馈事件  │
├─────────────────────────────────────────────────────────────┤
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 数据层智能体（读取市场状态）                              │
│  ├─────────────────────────────────────────────────────────┤
│  │ • MarketDataCollector    获取K线/现货/基差/OI/多空比     │
│  │ • FundingRateMonitor     费率监控+异常预警             │
│  │ • DepthAnalyzer          订单簿深度+流动性评估          │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 market:kline, market:funding, market:depth
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 信号层智能体（生成交易信号）                              │
│  ├─────────────────────────────────────────────────────────┤
│  │ • TechnicalSignalGenerator  MACD/RSI/BB/道氏/Z-score   │
│  │ • ArbitrageOpportunityScan  费率套利机会识别            │
│  │ • LiquidityHuntDetector     流动性猎杀信号             │
│  │ • DirectionalSignalEngine   方向性交易信号(A/B/C级)    │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 signal:technical, signal:arbitrage, signal:directional
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 决策层智能体（综合分析+风控决策）                          │
│  ├─────────────────────────────────────────────────────────┤
│  │ • MultiDimensionAnalyzer    五维分析(费率/OI/多空/趋势) │
│  │ • RiskController            风险检查+仓位计算           │
│  │ • PortfolioOptimizer        资金分配+凯利准则           │
│  │ • ConfirmationValidator     多信号共振验证             │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 decision:execute, decision:skip, decision:alert
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 执行层智能体（实盘交易+头寸管理）                          │
│  ├─────────────────────────────────────────────────────────┤
│  │ • OrderExecutor              市价/限价下单执行           │
│  │ • HedgingManager             自动对冲Delta中性          │
│  │ • PositionMonitor            持仓监控+止损止盈          │
│  │ • RealizedPnLRecorder        交易结果记录              │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 execution:order, execution:hedge, execution:close
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 学习层智能体（持续优化+知识积累）                          │
│  ├─────────────────────────────────────────────────────────┤
│  │ • BacktestAnalyzer          历史数据验证策略效果        │
│  │ • ParameterOptimizer        参数自适应调整(RSI/MACD)   │
│  │ • StrategyEvolver           策略组合进化优化            │
│  │ • KnowledgeAggregator       知识图谱更新              │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 learning:parameter_update, learning:strategy_improve
│
│  ┌─────────────────────────────────────────────────────────┐
│  │ 监控层智能体（系统健康+异常警告）                          │
│  ├─────────────────────────────────────────────────────────┤
│  │ • SystemHealthMonitor        进程/内存/API连接状态     │
│  │ • AnomalyDetector            市场异常+执行异常检测      │
│  │ • AlertManager               Telegram推送告警          │
│  │ • DailyReporter              日报生成+绩效统计         │
│  └─────────────────────────────────────────────────────────┘
│           ↓ 发布 monitor:alert, monitor:report
└─────────────────────────────────────────────────────────────┘
```

---

## 二、11个核心智能体详细设计

### 智能体1: MarketDataCollector (市场数据采集)
```yaml
职责:
  - 获取K线数据(1h/4h/1d)
  - 采集现货价格(用于基差计算)
  - 查询OI持仓量
  - 获取多空比数据

输入事件: [启动命令]
输出事件: 
  - market:kline → {symbol, closes, highs, lows, timestamp}
  - market:spot → {symbol, spotPrice, timestamp}
  - market:oi → {symbol, oiChange4h%, oiValue, anomaly}

依赖模块: KlineFetcher, MarketDepth
端口建议: 19961
```

### 智能体2: FundingRateMonitor (费率监控)
```yaml
职责:
  - 实时费率采集
  - 费率异常检测(>2%/8h)
  - 费率反转预警(<-0.1%)
  - 极值点识别(<-0.5%)

输入事件: [schedule:4h]
输出事件:
  - market:funding → {symbol, rate, trend, anomaly, nextApply}
  - alert:funding_extreme → 触发极值套利
  - alert:funding_flip → 费率反转→减仓

依赖模块: scan-daemon API
端口建议: 19962
```

### 智能体3: DepthAnalyzer (盘口分析)
```yaml
职责:
  - 订单簿深度分析(10层)
  - 买卖压力评估
  - 滑点估算(市价单)
  - 流动性评分

输入事件: [market:kline]
输出事件:
  - market:depth → {symbol, spread, bidVolume, askVolume, liquidityScore}

端口建议: 19963
```

### 智能体4: TechnicalSignalGenerator (技术信号)
```yaml
职责:
  - 计算RSI/MACD/BB/EMA/ATR
  - 多周期共振判断
  - 信号强度评分(0-1)
  - 支撑阻力识别

输入事件: [market:kline]
输出事件:
  - signal:technical → {symbol, direction, strength, grade(A/B/C), indicators}

依赖模块: Indicators, AdvancedIndicators
端口建议: 19964 (=signal-engine)
```

### 智能体5: ArbitrageOpportunityScan (套利扫描)
```yaml
职责:
  - 费率<-0.3%品种筛选
  - 手续费覆盖度检查(RR≥2)
  - 新品种发现(多交易所对比)
  - 套利机会排名

输入事件: [market:funding, signal:technical]
输出事件:
  - signal:arbitrage → {symbol, fundingRate, riskRewardRatio, recommendedSize}

依赖模块: funding-rate-scanner
端口建议: 19965
```

### 智能体6: MultiDimensionAnalyzer (五维分析)
```yaml
职责:
  - 五维综合评分(费率/OI/多空比/趋势/Z-score)
  - 市场结构判断(盘整/上升/下降/反转)
  - 入场信心度量化(0-100%)
  - 风险预警

输入事件: 
  - market:oi
  - market:funding
  - signal:technical
  - market:depth

输出事件:
  - decision:analysis → {symbol, confidence, recommendation, riskLevel, expectedRR}

依赖模块: AdvancedIndicators.contractSignal
端口建议: 19966
```

### 智能体7: RiskController (风险管理)
```yaml
职责:
  - 单笔止损计算(凯利准则)
  - 仓位大小确定(≤总权益的6%)
  - 基差监控(>3%预警)
  - 日亏阈值检查(>5U全停)

输入事件:
  - decision:analysis
  - market:depth

输出事件:
  - decision:risk_approval → {approved, positionSize, stopLoss, takeProfit, reason}

端口建议: 19967
```

### 智能体8: OrderExecutor (订单执行)
```yaml
职责:
  - 市价单执行(合约开仓)
  - 限价单执行(对冲或加仓)
  - 订单状态追踪
  - 滑点监控

输入事件:
  - decision:risk_approval

输出事件:
  - execution:order → {symbol, side, size, orderId, filledPrice, fee}

依赖工具: gate-exchange-futures MCP
端口建议: 19968
```

### 智能体9: HedgingManager (对冲管理)
```yaml
职责:
  - Gate多腿完成后BG自动空腿对冲
  - Delta中性验证(目标=0)
  - 跨交易所原子对冲
  - 对冲失败告警

输入事件:
  - execution:order (Gate一腿成交)

输出事件:
  - execution:hedge → {symbol, hedgeExchange, orderId, hedgePrice, deltaAfter}
  - alert:delta_mismatch → 如果Delta≠0

依赖工具: CCXT unified, BG API
端口建议: 19969
```

### 智能体10: PositionMonitor (持仓监控)
```yaml
职责:
  - 实时持仓查询(所有平台)
  - 浮盈/浮亏计算
  - 止损触发检查
  - 止盈触发执行(PnL≥0.5U)

输入事件: [schedule:1m]
输出事件:
  - execution:close → 自动止盈平仓
  - alert:stop_loss → 止损触发
  - monitor:position_update → 持仓变化

端口建议: 19960 (=monitor-loop)
```

### 智能体11: SystemHealthMonitor (系统监控)
```yaml
职责:
  - 18/20进程存活检测
  - 内存/CPU监控
  - API连接状态
  - 异常恢复触发

输入事件: [schedule:5m]
输出事件:
  - monitor:alert → 进程Down/内存超限/API异常
  - monitor:recovery → 自动重启需要的进程

端口建议: 19953 (=monitoring-alert)
```

---

## 三、事件驱动通信标准

### 事件类型定义
```javascript
// 市场数据事件
market:kline        → {symbol, timeframe, closes, highs, lows, ts}
market:funding      → {symbol, rate, trend, anomaly}
market:oi           → {symbol, oiChange, oiValue}
market:depth        → {symbol, bidVolume, askVolume, spread}

// 信号事件
signal:technical    → {symbol, direction, strength, grade, indicators}
signal:arbitrage    → {symbol, fundingRate, rr, size}
signal:liquidation  → {symbol, type(long/short), confidence}

// 决策事件
decision:analysis   → {symbol, confidence, riskLevel, rec}
decision:skip       → {reason, symbol}
decision:alert      → {level, message}

// 执行事件
execution:order     → {symbol, side, size, orderId, price}
execution:hedge     → {symbol, hedgeEx, hedgeId}
execution:close     → {symbol, closedPrice, realizedPnL}

// 监控事件
monitor:alert       → {severity, type, message}
monitor:report      → {daily_summary, metrics}
```

---

## 四、智能体协调规则

### 规则1: 市场数据→信号→决策→执行 线性流

```javascript
// 自动触发链:
market:kline 
  ↓
signal:technical (TechnicalSignalGenerator)
  ↓ (如果是套利品种)
signal:arbitrage (ArbitrageOpportunityScan)
  ↓ (如果所有验证通过)
decision:analysis (MultiDimensionAnalyzer)
  ↓
decision:risk_approval (RiskController)
  ↓ (如果通过)
execution:order (OrderExecutor)
  ↓
execution:hedge (HedgingManager)
```

### 规则2: 并行监控不中断主流程

```javascript
// 独立线程并行:
schedule:1m → PositionMonitor → 检查止盈/止损 (可中断主流程)
schedule:5m → SystemHealthMonitor → 进程健康检查
schedule:4h → FundingRateMonitor → 费率异常预警
```

### 规则3: 异常事件立即广播

```javascript
// 优先级最高:
alert:* 事件 → 所有智能体立即订阅 → Telegram推送 + 日志
  如: alert:funding_flip → 减仓50%
  如: alert:delta_mismatch → 修复Delta
  如: alert:system_down → 启动恢复
```

### 规则4: 决策冲突由风控仲裁

```javascript
// 如果多个信号源冲突:
signal:technical = LONG (强度0.8)
signal:arbitrage = SKIP (费率不够)
  → 由RiskController仲裁
  → decision = 不执行 (费率优先于方向性)
```

---

## 五、部署计划

### Phase 1 (本周): 核心7个智能体
- MarketDataCollector (19961)
- FundingRateMonitor (19962) 
- TechnicalSignalGenerator (19964)
- ArbitrageOpportunityScan (19965)
- MultiDimensionAnalyzer (19966)
- RiskController (19967)
- OrderExecutor (19968)

### Phase 2 (下周): 完整11个
+ HedgingManager (19969)
+ PositionMonitor (19960)
+ SystemHealthMonitor (19953)

### 集成点 (立即):
- event-bus (PORT 19958) ← 所有智能体都发布/订阅
- A2A协议 ← 智能体间直接通信
- second-brain-v5 ← 决策推理支撑

