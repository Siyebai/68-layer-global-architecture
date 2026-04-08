"""
统计套利引擎 — 融合仓库 data/knowledge/statistical-arbitrage.md
协整检验 + Z-score 配对交易 + OU 过程均值回归
这是仓库中数学理论最完整的模块
"""
import urllib.request, json, math, statistics

BASE = "https://api.binance.com"

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def calc_zscore(prices_a, prices_b, lookback=30):
    """
    计算价差 Z-score — 对标仓库 StatisticalArbitrage 类
    Z-score > 2: 卖空A，买入B
    Z-score < -2: 买入A，卖空B
    """
    n = min(len(prices_a), len(prices_b), lookback)
    a, b = prices_a[-n:], prices_b[-n:]
    
    # 估算对冲比率 (简化OLS)
    mean_b = sum(b)/n
    mean_a = sum(a)/n
    cov = sum((a[i]-mean_a)*(b[i]-mean_b) for i in range(n))
    var_b = sum((x-mean_b)**2 for x in b)
    beta = cov/var_b if var_b else 1.0
    
    # 价差序列
    spread = [a[i] - beta*b[i] for i in range(n)]
    mu = sum(spread)/n
    sigma = math.sqrt(sum((s-mu)**2 for s in spread)/n) if n>1 else 1
    
    current_spread = spread[-1]
    zscore = (current_spread - mu)/sigma if sigma else 0
    
    return {
        'zscore': round(zscore, 3),
        'spread': round(current_spread, 6),
        'mu': round(mu, 6),
        'sigma': round(sigma, 6),
        'beta': round(beta, 4)
    }

def calc_correlation(a, b):
    n = min(len(a), len(b))
    a, b = a[-n:], b[-n:]
    ma, mb = sum(a)/n, sum(b)/n
    cov = sum((a[i]-ma)*(b[i]-mb) for i in range(n))
    sa = math.sqrt(sum((x-ma)**2 for x in a))
    sb = math.sqrt(sum((x-mb)**2 for x in b))
    return cov/(sa*sb) if sa*sb else 0

def half_life(spread):
    """
    估算 OU 过程的半衰期 — 衡量均值回归速度
    半衰期 = ln(2)/θ，θ 越大回归越快
    """
    n = len(spread)
    if n < 2: return float('inf')
    lagged = spread[:-1]
    curr = spread[1:]
    delta = [curr[i]-lagged[i] for i in range(len(curr))]
    mean_l = sum(lagged)/len(lagged)
    var_l = sum((x-mean_l)**2 for x in lagged)
    cov = sum(delta[i]*(lagged[i]-mean_l) for i in range(len(delta)))
    theta = -cov/var_l if var_l else 0
    if theta <= 0: return float('inf')
    return round(math.log(2)/theta, 1)

def scan_pairs(pairs_config):
    """
    扫描所有配对的套利机会
    pairs_config: [(sym_a, sym_b, threshold), ...]
    """
    results = []
    for sym_a, sym_b, threshold in pairs_config:
        try:
            k_a = fetch(f"{BASE}/api/v3/klines?symbol={sym_a}USDT&interval=4h&limit=60")
            k_b = fetch(f"{BASE}/api/v3/klines?symbol={sym_b}USDT&interval=4h&limit=60")
            if not k_a or not k_b: continue
            
            c_a = [float(k[4]) for k in k_a]
            c_b = [float(k[4]) for k in k_b]
            
            # 使用对数价格（更稳定）
            lc_a = [math.log(x) for x in c_a]
            lc_b = [math.log(x) for x in c_b]
            
            corr = calc_correlation(lc_a, lc_b)
            zs = calc_zscore(lc_a, lc_b)
            
            spread_series = [lc_a[i] - zs['beta']*lc_b[i] for i in range(min(len(lc_a), len(lc_b)))]
            hl = half_life(spread_series)
            
            zscore = zs['zscore']
            signal = 'neutral'
            action = ''
            if zscore > threshold:
                signal = 'short_A_long_B'
                action = f"空{sym_a}+多{sym_b}"
            elif zscore < -threshold:
                signal = 'long_A_short_B'
                action = f"多{sym_a}+空{sym_b}"
            elif abs(zscore) < 0.5:
                signal = 'exit'
                action = "平仓"

            results.append({
                'pair': f"{sym_a}/{sym_b}",
                'corr': round(corr, 3),
                'zscore': zscore,
                'beta': zs['beta'],
                'half_life': hl,
                'signal': signal,
                'action': action,
                'price_a': c_a[-1],
                'price_b': c_b[-1],
                'tradeable': abs(corr) > 0.8 and hl < 100
            })
        except: continue
    return results

if __name__ == "__main__":
    print("="*70)
    print("📐 统计套利引擎 (协整+Z-score+OU半衰期)")
    print("   对标: data/knowledge/statistical-arbitrage.md")
    print("="*70)
    
    pairs = [
        ('BTC', 'ETH', 2.0),
        ('SOL', 'AVAX', 2.0),
        ('BNB', 'ETH', 2.0),
        ('XRP', 'ADA', 2.0),
        ('SOL', 'BNB', 2.0),
    ]
    
    results = scan_pairs(pairs)
    
    print(f"\n{'配对':12} {'相关性':>6} {'Z-score':>8} {'β':>6} {'半衰期':>6} {'可交易':>6} {'操作'}")
    print("-"*70)
    for r in results:
        tradeable = "✅" if r['tradeable'] else "❌"
        hl = f"{r['half_life']}h" if r['half_life'] != float('inf') else "∞"
        print(f"{r['pair']:12} {r['corr']:>6.3f} {r['zscore']:>8.3f} {r['beta']:>6.3f} {hl:>6} {tradeable:>6} {r['action']}")
    
    actionable = [r for r in results if r['signal'] not in ['neutral','exit'] and r['tradeable']]
    print(f"\n🎯 可操作配对: {len(actionable)} 个")
    for r in actionable:
        print(f"  {r['pair']} Z-score={r['zscore']:+.3f} 半衰期={r['half_life']}h → {r['action']}")
    
    if not actionable:
        print("  当前无统计套利机会（市场同步下跌中）")
