// 合约交易系统集成
const ContractTradingAdapter = require('./scripts/contract-integration/contract-adapter');
class ContractTradingIntegration {
  constructor() {
    this.adapter = null;
    this.enabled = true;
    this.status = 'initializing';
  }
  
  async initialize() {
    console.log('🚀 初始化合约交易系统...');
    this.adapter = new ContractTradingAdapter();
    await this.adapter.initialize();
    this.status = 'ready';
    console.log('✅ 集成完成');
  }
  
  async start() {
    if (!this.enabled) return;
    await this.initialize();
    setInterval(async () => {
      try {
        const opps = await this.adapter.scanOpportunities();
        if (opps.count > 0) console.log(`📈 发现 ${opps.count} 个交易机会`);
      } catch (e) { console.error('扫描失败:', e.message); }
    }, 5000);
  }
  
  async getSystemStatus() {
    return { enabled: this.enabled, status: this.status, adapterReady: !!this.adapter };
  }
}
module.exports = ContractTradingIntegration;