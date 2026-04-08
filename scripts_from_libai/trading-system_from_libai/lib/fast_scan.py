"""
快速并行扫描入口 — 替代串行的 monitor.py 核心扫描逻辑
所有策略并行执行，总耗时从 ~30s 降至 ~8s
"""
import sys, os, time, concurrent.futures
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.market_cache import get_closes, get_funding_rates, get_klines
import math, json
from datetime import datetime

BASE_URL = "https://api.binance.com"
FUTURES_URL = "https://fapi.binance.com"

# ── 策略1: 资金费率套利 ──
def scan_funding():
    rates = get_funding_rates()
    if not rates: return []
    opps = []
    for item in sorted(rates, key=lambda x: abs(float(x.get('lastFundingRate',0))), reverse=True)[:10]:
        rate = float(item.get('lastFundingRate',0))
        daily = rate * 3 * 100
        if abs(daily) >= 0.3:
            opps.append({
                'type': 'funding',
                'symbol': item['symbol'],
                'daily_pct': round(daily, 3),
                'action': '空现货+多合约' if rate < 0 else '多现货+空合约'
            })
    return opps

# ── 策略2: 统计套利 Z-score ──
def scan_stat_arb():
    pairs = [('BTC','ETH'),('SOL','BNB'),('XRP','ADA')]
    results = []
    for a, b in pairs:
        ca = get_closes(a, '4h', 50)
        cb = get_closes(b, '4h', 50)
        if not ca or not cb: continue
        n = min(len(ca), len(cb))
        la = [math.log(x) for x in ca[-n:]]
        lb = [math.log(x) for x in cb[-n:]]
        mean_b = sum(lb)/n; mean_a = sum(la)/n
        cov = sum((la[i]-mean_a)*(lb[i]-mean_b) for i in range(n))
        var_b = sum((x-mean_b)**2 for x in lb)
        beta = cov/var_b if var_b else 1
        spread = [la[i]-beta*lb[i] for i in range(n)]
        mu = sum(spread)/n
        sigma = math.sqrt(sum((s-mu)**2 for s in spread)/n) or 1
        z = (spread[-1]-mu)/sigma
        if abs(z) >= 2.0:
            action = f"空{a}+多{b}" if z > 0 else f"多{a}+空{b}"
            results.append({'type':'stat_arb','pair':f"{a}/{b}",'zscore':round(z,3),'action':action})
    return results

# ── 策略3: BTC/ETH 对冲 ──
def scan_hedge():
    ca = get_closes('BTC', '4h', 30)
    ce = get_closes('ETH', '4h', 30)
    if not ca or not ce: return []
    ret_b = (ca[-1]/ca[-8]-1)*100
    ret_e = (ce[-1]/ce[-8]-1)*100
    spread = ret_b - ret_e
    if abs(spread) > 1.5:
        action = "空BTC+多ETH" if spread > 0 else "多BTC+空ETH"
        return [{'type':'hedge','pair':'BTC/ETH','spread':round(spread,2),'action':action}]
    return []

# ── 策略4: 方向性信号 (RSI) ──
def scan_direction():
    symbols = ['BTC','ETH','SOL']
    signals = []
    for sym in symbols:
        c = get_closes(sym, '4h', 30)
        if len(c) < 15: continue
        g = [max(c[i]-c[i-1],0) for i in range(1,len(c))]
        l = [max(c[i-1]-c[i],0) for i in range(1,len(c))]
        ag = sum(g[-14:])/14; al = sum(l[-14:])/14
        rsi = 100-(100/(1+ag/al)) if al else 100
        if rsi < 35:
            signals.append({'type':'dir','symbol':sym,'rsi':round(rsi,1),'action':'多','price':c[-1]})
        elif rsi > 65:
            signals.append({'type':'dir','symbol':sym,'rsi':round(rsi,1),'action':'空','price':c[-1]})
    return signals

def run_parallel_scan():
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f1 = ex.submit(scan_funding)
        f2 = ex.submit(scan_stat_arb)
        f3 = ex.submit(scan_hedge)
        f4 = ex.submit(scan_direction)
        funding = f1.result()
        stat    = f2.result()
        hedge   = f3.result()
        direc   = f4.result()
    elapsed = round(time.time()-t0, 2)
    
    all_opps = funding + stat + hedge + direc
    
    print(f"\n⚡ 并行扫描完成 ({elapsed}s) — {datetime.now().strftime('%H:%M:%S')}")
    print(f"   资金费率: {len(funding)} | 统计套利: {len(stat)} | 对冲: {len(hedge)} | 方向: {len(direc)}")
    
    if funding:
        print("\n💰 资金费率 TOP3:")
        for o in funding[:3]:
            print(f"   {o['symbol']:14} 日化={o['daily_pct']:+.3f}% {o['action']}")
    if stat:
        print("\n📐 统计套利:")
        for o in stat:
            print(f"   {o['pair']} Z={o['zscore']:+.3f} {o['action']}")
    if hedge:
        print("\n⚖️  对冲:")
        for o in hedge:
            print(f"   {o['pair']} 价差={o['spread']:+.2f}% {o['action']}")
    if direc:
        print("\n🎯 方向信号:")
        for o in direc:
            print(f"   {o['symbol']} RSI={o['rsi']} → {o['action']} @ ${o['price']:.2f}")
    
    return {'elapsed': elapsed, 'total': len(all_opps), 'opportunities': all_opps}

if __name__ == "__main__":
    result = run_parallel_scan()
    print(f"\n✅ 总机会: {result['total']} 个 | 耗时: {result['elapsed']}s")
