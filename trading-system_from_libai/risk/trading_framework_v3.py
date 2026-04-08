"""
交易框架 V3.0 — 整合自 trading-framework-v3.md（Q李白体系规范）
完整入场标准 + 风控规则 + 多策略并行
这是仓库中最权威的实战规则文档
"""
import urllib.request, json, math
from datetime import datetime

BASE  = "https://api.binance.com"
FBASE = "https://fapi.binance.com"

def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return json.loads(r.read())
    except: return None

# ── 入场标准（来自 trading-framework-v3.md）──
ENTRY_RULES = {
    'min_daily_net_pct':  0.3,   # 净日化 > 0.3%
    'good_daily_net_pct': 0.5,   # 优选 > 0.5%
    'min_coverage':       0.5,   # 手续费覆盖度 > 0.5
    'good_coverage':      0.7,   # 优选 > 0.7
    'min_oi_usdt':        500,   # OI深度 > 500U
}

# ── 止损风控规则（来自 trading-framework-v3.md）──
EXIT_RULES = {
    'rate_reversal_threshold': -0.001,  # 费率反转 > -0.1%/8h
    'single_loss_pct':          0.03,   # 单品种浮亏 > 3%
    'basis_max_pct':            0.03,   # 基差 > 3%
    'daily_net_loss_usdt':      2.0,    # 日净亏 > 2U
    'total_loss_pct':           0.08,   # 总亏 > 8%
    'profit_trail_trigger':     0.015,  # 盈利 1.5% → 保本
}

FEE_RATES = {'binance': 0.0004, 'gate': 0.0005, 'bitget': 0.0006}

def check_entry(symbol, rate_8h, oi_usdt=None):
    """
    V3.0 入场检验器
    对标 pre-trade-validator 逻辑
    """
    daily_gross = abs(rate_8h) * 3
    
    # 手续费覆盖度
    avg_fee = 0.0005
    net = daily_gross - avg_fee * 2
    coverage = max(0, net / daily_gross) if daily_gross > 0 else 0
    
    checks = {
        'rate_ok':     abs(rate_8h)*100 >= 0.3,
        'net_daily_ok': net*100 >= ENTRY_RULES['min_daily_net_pct'],
        'coverage_ok':  coverage >= ENTRY_RULES['min_coverage'],
        'oi_ok':        True if oi_usdt is None else oi_usdt >= ENTRY_RULES['min_oi_usdt'],
    }
    
    grade = 'PASS'
    if all(checks.values()):
        if net*100 >= ENTRY_RULES['good_daily_net_pct'] and coverage >= ENTRY_RULES['good_coverage']:
            grade = 'A'  # 优选
        else:
            grade = 'B'  # 合格
    else:
        grade = 'FAIL'
    
    return {
        'symbol': symbol,
        'rate_8h_pct': round(rate_8h*100, 4),
        'daily_gross_pct': round(daily_gross*100, 3),
        'daily_net_pct': round(net*100, 3),
        'coverage': round(coverage, 3),
        'checks': checks,
        'grade': grade,
        'strategy': '空现货+多合约' if rate_8h < 0 else '多现货+空合约'
    }

def full_scan():
    """完整扫描 + V3.0 入场过滤"""
    rates = fetch(f"{FBASE}/fapi/v1/premiumIndex")
    if not rates: return []
    
    results = []
    for item in sorted(rates, key=lambda x: abs(float(x.get('lastFundingRate',0))), reverse=True)[:30]:
        sym = item['symbol']
        rate = float(item.get('lastFundingRate',0))
        if abs(rate) < 0.001: continue
        
        r = check_entry(sym, rate)
        if r['grade'] in ('A','B'):
            results.append(r)
    
    return sorted(results, key=lambda x: x['daily_net_pct'], reverse=True)

def run():
    print("="*70)
    print("🏗️  交易框架 V3.0 — 完整入场检验 + 风控规则")
    print("   来源: trading-framework-v3.md (Q李白体系)")
    print("="*70)
    
    results = full_scan()
    
    print(f"\n{'品种':14} {'8h费率':>8} {'日净利':>7} {'覆盖度':>6} {'评级':>4} {'策略'}")
    print("-"*70)
    for r in results:
        emoji = "⭐" if r['grade']=='A' else "✅"
        print(f"{r['symbol']:14} {r['rate_8h_pct']:>+8.4f}% {r['daily_net_pct']:>6.3f}% "
              f"{r['coverage']:>6.3f} {emoji}{r['grade']:>3}  {r['strategy']}")
    
    a_grade = [r for r in results if r['grade']=='A']
    print(f"\n📊 统计: A级={len(a_grade)} B级={len(results)-len(a_grade)} 总计={len(results)}")
    
    if a_grade:
        print(f"\n⭐ A级最优机会:")
        for r in a_grade[:3]:
            print(f"   {r['symbol']} 净日化={r['daily_net_pct']}% 覆盖={r['coverage']}")
    
    # 风控提示
    print(f"\n🛡️  当前风控规则 (V3.0):")
    print(f"   费率反转→平仓 | 基差>3%→强制退出 | 日亏>2U→暂停24h")
    print(f"   总亏>8%→全平  | 盈利1.5%→移动保本")
    
    return results

if __name__ == "__main__":
    run()
