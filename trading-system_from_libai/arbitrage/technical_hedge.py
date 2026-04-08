"""
技术型强弱对冲策略 — 融合文档《合约对冲策略》第一部分第 3 节
做多技术形态强势品种，做空技术形态弱势品种
"""
import urllib.request, json, math

BASE = "https://api.binance.com"

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def calc_strength_score(sym):
    """
    计算单个品种的技术强度评分
    指标：RSI 相对强弱 + 价格相对均线位置 + 突破/破位时间先后
    """
    try:
        k = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=50")
        if not k: return None
        c = [float(x[4]) for x in k]
        h = [float(x[2]) for x in k]
        l = [float(x[3]) for x in k]
        price = c[-1]
        
        # RSI 强弱 (40%)
        def rsi(c, n=14):
            g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
            l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
            ag=sum(g[-n:])/n; al=sum(l[-n:])/n
            return 100-(100/(1+ag/al)) if al else 100
        
        rsi_val = rsi(c)
        rsi_score = (rsi_val - 50) / 50  # 归一化到 [-1, 1]
        
        # 价格相对均线位置 (35%)
        sma20 = sum(c[-20:])/20
        sma50 = sum(c[-50:])/20 if len(c)>=50 else sma20
        ma_score = ((price - sma20)/sma20 + (price - sma50)/sma50) / 2 * 100
        ma_score = max(-1, min(1, ma_score))  # 截断到 [-1, 1]
        
        # 突破/破位时间先后 (25%)
        # 计算最近一次突破 20 日高点或跌破 20 日低点的距离
        high20 = max(c[-20:])
        low20 = min(c[-20:])
        days_since_breakout = 0
        for i in range(1, min(20, len(c))):
            if c[-i] > high20 or c[-i] < low20:
                days_since_breakout = i
                break
        breakout_score = (20 - days_since_breakout) / 20  # 越近越强势
        
        # 综合评分
        total = rsi_score * 0.40 + ma_score * 0.35 + breakout_score * 0.25
        
        return {
            'symbol': sym,
            'price': price,
            'rsi': round(rsi_val, 1),
            'rsi_score': round(rsi_score, 3),
            'ma_score': round(ma_score, 3),
            'breakout_score': round(breakout_score, 3),
            'total_score': round(total, 3),
            'sma20': round(sma20, 2),
            'sma50': round(sma50, 2)
        }
    except Exception as e:
        return None

def scan_hedge_opportunity(symbols):
    """
    扫描强弱对冲机会
    选择最强和最弱品种配对
    """
    results = [calc_strength_score(s) for s in symbols]
    results = [r for r in results if r]
    if not results: return None
    
    # 排序
    results.sort(key=lambda x: x['total_score'], reverse=True)
    strongest = results[0]
    weakest = results[-1]
    
    # 对冲信号
    spread = strongest['total_score'] - weakest['total_score']
    if spread < 0.5:
        return {'action': 'hold', 'reason': '强弱差异不足 (<0.5)'}
    
    return {
        'action': 'hedge',
        'long': strongest['symbol'],
        'short': weakest['symbol'],
        'long_price': strongest['price'],
        'short_price': weakest['price'],
        'long_score': strongest['total_score'],
        'short_score': weakest['total_score'],
        'spread': round(spread, 3),
        'confidence': '高' if spread > 1.0 else '中',
        'long_rsi': strongest['rsi'],
        'short_rsi': weakest['rsi']
    }

if __name__ == "__main__":
    print("="*70)
    print("⚖️  技术型强弱对冲策略 (对标《合约对冲策略》1.3 节)")
    print("="*70)
    
    symbols = ['BTC','ETH','SOL','BNB','XRP','ADA','AVAX','DOT']
    
    print(f"\n{'品种':6} {'价格':>10} {'RSI':>6} {'强度分':>7} {'RSI 分':>6} {'MA 分':>6} {'突破分':>7}")
    print("-"*70)
    
    for s in symbols:
        r = calc_strength_score(s)
        if r:
            print(f"{r['symbol']:6} ${r['price']:>9.2f} {r['rsi']:>6.1f} {r['total_score']:>7.3f} {r['rsi_score']:>6.3f} {r['ma_score']:>6.3f} {r['breakout_score']:>7.3f}")
    
    print("\n" + "="*70)
    print("🎯 对冲机会:")
    opp = scan_hedge_opportunity(symbols)
    if opp and opp['action'] == 'hedge':
        print(f"  做多：{opp['long']} @ ${opp['long_price']:.2f} (强度={opp['long_score']})")
        print(f"  做空：{opp['short']} @ ${opp['short_price']:.2f} (强度={opp['short_score']})")
        print(f"  强弱差：{opp['spread']}  置信度：{opp['confidence']}")
        print(f"  RSI 对比：多头={opp['long_rsi']} vs 空头={opp['short_rsi']}")
    else:
        print(f"  {opp.get('reason', '无机会')}")
