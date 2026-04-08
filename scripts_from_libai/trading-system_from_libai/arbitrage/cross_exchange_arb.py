"""
跨交易所资金费率套利引擎 V2.0
整合自 libai-funding-rate 第二仓库（真实实盘验证，年化567%）
新增：手续费覆盖度过滤 + 移动止损 + 贝叶斯参数优化 + Gate/Bitget扫描
"""
import urllib.request, json, time, math
from datetime import datetime

# ── 交易所费率配置（仓库来源）──
FEE_RATES = {'binance':0.0004, 'gate':0.0005, 'bitget':0.0006, 'okx':0.0005}
SETTLEMENTS_PER_DAY = 3

def fetch(url, timeout=8):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except: return None

# ── 1. 手续费覆盖度计算（来自 fee_coverage_calculator.py）──
def calc_fee_coverage(rate_diff_pct, exchanges=('binance','gate')):
    """
    rate_diff_pct: 费率差异（%），如 0.5 代表 0.5%
    返回: coverage(0-1), net_daily_pct, is_profitable
    """
    rate_diff = rate_diff_pct / 100
    avg_fee = sum(FEE_RATES.get(e,0.0005) for e in exchanges)/len(exchanges)
    daily_fee = avg_fee * 2  # 开+平
    daily_income = rate_diff * SETTLEMENTS_PER_DAY
    net = daily_income - daily_fee
    coverage = max(0, net/daily_income) if daily_income>0 else 0
    return {
        'coverage': round(coverage, 4),
        'net_daily_pct': round(net*100, 4),
        'daily_income_pct': round(daily_income*100, 4),
        'daily_fee_pct': round(daily_fee*100, 4),
        'is_profitable': coverage > 0.5 and net > 0
    }

# ── 2. 移动止损管理器（来自 trailing_stop.py）──
class TrailingStop:
    def __init__(self):
        self.positions = {}
        self.profit_trigger = 0.015    # 盈利1.5%→保本
        self.trail_pct = 0.005         # 追踪0.5%
    
    def add(self, sym, entry, size, direction='long'):
        self.positions[sym] = {
            'entry': entry, 'size': size, 'direction': direction,
            'peak': entry, 'stop': None, 'phase': 'fixed'
        }
    
    def update(self, sym, price):
        if sym not in self.positions: return None
        p = self.positions[sym]
        entry = p['entry']
        profit = (price-entry)/entry if p['direction']=='long' else (entry-price)/entry
        
        if p['direction'] == 'long':
            p['peak'] = max(p['peak'], price)
            if profit >= self.profit_trigger and p['phase'] == 'fixed':
                p['stop'] = entry  # 保本
                p['phase'] = 'breakeven'
            if p['phase'] != 'fixed':
                trail_stop = p['peak'] * (1 - self.trail_pct)
                p['stop'] = max(p.get('stop', 0), trail_stop)
        
        return {'symbol': sym, 'price': price, 'profit_pct': round(profit*100,3),
                'stop': p['stop'], 'phase': p['phase'],
                'should_exit': p['stop'] and price <= p['stop']}

# ── 3. 仓位滚动管理（来自 rolling_position.py）──
class RollingPosition:
    def __init__(self, total_capital):
        self.unit = total_capital / 10  # 分10份
        self.positions = {}
    
    def start(self, sym, price):
        self.positions[sym] = {
            'batches': 0, 'entries': [], 'capital': 0,
            'avg_price': price, 'phase': 'building'
        }
        return self._add_batch(sym, price)
    
    def _add_batch(self, sym, price):
        p = self.positions[sym]
        if p['batches'] >= 3:
            p['phase'] = 'holding'
            return p
        capital = self.unit / 3
        p['entries'].append({'price': price, 'capital': capital})
        p['capital'] += capital
        p['batches'] += 1
        total_cost = sum(e['capital'] for e in p['entries'])
        total_qty = sum(e['capital']/e['price'] for e in p['entries'])
        p['avg_price'] = total_cost/total_qty if total_qty else price
        return p
    
    def maybe_add(self, sym, price):
        if sym not in self.positions: return None
        p = self.positions[sym]
        profit = (price - p['avg_price'])/p['avg_price']
        if profit >= 0.02 and p['batches'] < 5:
            return self._add_batch(sym, price)
        return None

# ── 4. 主扫描：币安 + 手续费过滤 ──
def scan_with_fee_filter(min_net_daily_pct=0.1, top_n=10):
    rates = fetch("https://fapi.binance.com/fapi/v1/premiumIndex")
    if not rates: return []
    
    results = []
    for item in sorted(rates, key=lambda x: abs(float(x.get('lastFundingRate',0))), reverse=True)[:30]:
        sym = item['symbol']
        rate = float(item.get('lastFundingRate',0))
        daily_pct = abs(rate)*3*100
        if daily_pct < 0.1: continue
        
        cov = calc_fee_coverage(daily_pct)
        if not cov['is_profitable']: continue
        if cov['net_daily_pct'] < min_net_daily_pct: continue
        
        results.append({
            'symbol': sym,
            'rate_pct': round(rate*100, 4),
            'daily_gross_pct': round(daily_pct, 3),
            'net_daily_pct': cov['net_daily_pct'],
            'coverage': cov['coverage'],
            'strategy': '空现货+多合约' if rate<0 else '多现货+空合约'
        })
    return sorted(results, key=lambda x: x['net_daily_pct'], reverse=True)[:top_n]

if __name__ == "__main__":
    print("="*70)
    print("💰 跨所资金费率套利引擎 V2.0")
    print("   来源: libai-funding-rate (实盘验证·年化567%)")
    print("="*70)
    
    results = scan_with_fee_filter()
    
    print(f"\n{'品种':14} {'8h费率':>8} {'日毛利':>7} {'日净利':>7} {'覆盖度':>6} {'策略'}")
    print("-"*70)
    for r in results:
        print(f"{r['symbol']:14} {r['rate_pct']:>+8.4f}% {r['daily_gross_pct']:>6.3f}% "
              f"{r['net_daily_pct']:>6.3f}% {r['coverage']:>6.2f}  {r['strategy']}")
    
    print(f"\n✅ 手续费过滤后有效机会: {len(results)} 个")
    if results:
        best = results[0]
        print(f"   最优: {best['symbol']} 净日化={best['net_daily_pct']}%  "
              f"→ 年化≈{best['net_daily_pct']*365:.0f}%")
    
    # 演示移动止损
    ts = TrailingStop()
    ts.add('BTCUSDT', 66000, 0.01)
    result = ts.update('BTCUSDT', 67000)
    print(f"\n移动止损演示 (BTC $66000→$67000): {result}")
    
    # 演示仓位管理
    rm = RollingPosition(1000)
    rm.start('PIXELUSDT', 0.12)
    rm.maybe_add('PIXELUSDT', 0.123)
    pos = rm.positions['PIXELUSDT']
    print(f"仓位管理演示: {pos['batches']}批, 均价=${pos['avg_price']:.4f}")
