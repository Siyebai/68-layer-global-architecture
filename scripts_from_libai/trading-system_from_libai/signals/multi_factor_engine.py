"""
多因子信号融合引擎 — 融合文档《量化交易知识》3.2 节 + 仓库 signal-fusion-engine.js
5 大因子加权评分，胜率目标 60-70%
"""
import urllib.request, json, math

BASE = "https://api.binance.com"

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def ema(c, n):
    k=2/(n+1); e=c[0]
    for x in c[1:]: e=x*k+e*(1-k)
    return e

def rsi(c, n=14):
    g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
    l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
    ag=sum(g[-n:])/n; al=sum(l[-n:])/n
    return 100-(100/(1+ag/al)) if al else 100

def analyze_multi_factor(sym):
    """
    5 大因子评分体系（对标文档表：多因子信号融合）
    """
    k1h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=1h&limit=100")
    k4h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=50")
    if not k1h or not k4h: return None
    
    c=[float(k[4]) for k in k1h]
    h=[float(k[2]) for k in k1h]
    l=[float(k[3]) for k in k1h]
    v=[float(k[5]) for k in k1h]
    price=c[-1]
    
    # ── 因子 1: 趋势因子 (30% 权重) ──
    ema7=ema(c[-20:],7); ema25=ema(c[-50:],25); ema50=ema(c,50)
    trend_score=0
    if ema7>ema25>ema50: trend_score=1.0  # 多头排列
    elif ema7<ema25<ema50: trend_score=-1.0  # 空头排列
    elif ema7>ema25: trend_score=0.5
    elif ema7<ema25: trend_score=-0.5
    
    # ── 因子 2: 动量因子 (25% 权重) ──
    rsi_val=rsi(c)
    macd=ema(c[-26:],12)-ema(c,26)
    momentum_score=0
    if rsi_val<40 and macd>0: momentum_score=1.0
    elif rsi_val>60 and macd<0: momentum_score=-1.0
    elif rsi_val<50 and macd>0: momentum_score=0.5
    elif rsi_val>50 and macd<0: momentum_score=-0.5
    
    # ── 因子 3: 波动率因子 (15% 权重) ──
    sma20=sum(c[-20:])/20
    std=math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
    bb_width=2*std/sma20*100
    bb_pos=(price-(sma20-2*std))/(4*std) if std else 0.5
    vol_score=0
    if bb_width<2: vol_score=0.5  # 低波动，待突破
    elif 2<=bb_width<=5: vol_score=1.0  # 适中
    else: vol_score=0.3  # 过高
    
    # ── 因子 4: 成交量因子 (15% 权重) ──
    avg_v=sum(v[-20:])/20
    vol_ratio=v[-1]/avg_v if avg_v else 1
    vol_factor_score=0
    if vol_ratio>2: vol_factor_score=1.0  # 放量
    elif vol_ratio>1.5: vol_factor_score=0.7
    elif vol_ratio>1: vol_factor_score=0.5
    else: vol_factor_score=0.3
    
    # ── 因子 5: 市场情绪因子 (15% 权重) ──
    try:
        funding = fetch(f"{BASE}/fapi/v1/premiumIndex?symbol={sym}USDT")
        rate=float(funding[0].get('lastFundingRate',0)) if funding else 0
        # 极端费率 = 极端情绪
        if abs(rate)>0.001: sentiment_score=-0.5  # 极端，反向信号
        elif abs(rate)>0.0005: sentiment_score=0.3
        else: sentiment_score=0.7
    except: sentiment_score=0.5
    
    # ── 加权综合评分 ──
    weights = {'trend':0.30, 'momentum':0.25, 'vol':0.15, 'volume':0.15, 'sentiment':0.15}
    total_score = (
        trend_score * weights['trend'] +
        momentum_score * weights['momentum'] +
        vol_score * weights['vol'] +
        vol_factor_score * weights['volume'] +
        sentiment_score * weights['sentiment']
    )
    
    # 信号判定
    if total_score > 0.6:
        signal, grade = 'long', ('A' if total_score>0.8 else 'B')
    elif total_score < -0.6:
        signal, grade = 'short', ('A' if total_score<-0.8 else 'B')
    elif total_score > 0.3:
        signal, grade = 'long', 'C'
    elif total_score < -0.3:
        signal, grade = 'short', 'C'
    else:
        signal, grade = 'neutral', 'D'
    
    return {
        'symbol': sym,
        'price': price,
        'signal': signal,
        'grade': grade,
        'score': round(total_score, 3),
        'factors': {
            'trend': round(trend_score, 2),
            'momentum': round(momentum_score, 2),
            'volatility': round(vol_score, 2),
            'volume': round(vol_factor_score, 2),
            'sentiment': round(sentiment_score, 2)
        },
        'indicators': {
            'rsi': round(rsi_val, 1),
            'macd': round(macd, 4),
            'ema7': round(ema7, 2),
            'ema25': round(ema25, 2),
            'ema50': round(ema50, 2),
            'bb_pos': round(bb_pos, 2),
            'vol_ratio': round(vol_ratio, 2)
        }
    }

if __name__ == "__main__":
    print("="*70)
    print("🔬 多因子信号融合引擎 v1.0 (对标《量化交易知识》3.2 节)")
    print("="*70)
    
    symbols = ['BTC','ETH','SOL','BNB','XRP']
    results = [analyze_multi_factor(s) for s in symbols]
    
    print(f"\n{'品种':6} {'信号':8} {'评级':4} {'综合分':6} {'趋势':5} {'动量':5} {'波动':5} {'成交':5} {'情绪':5}")
    print("-"*70)
    for r in results:
        f=r['factors']
        print(f"{r['symbol']:6} {r['signal']:8} {r['grade']:4} {r['score']:>6.3f} {f['trend']:>5.2f} {f['momentum']:>5.2f} {f['volatility']:>5.2f} {f['volume']:>5.2f} {f['sentiment']:>5.2f}")
    
    actionable = [r for r in results if r['grade'] in ['A','B']]
    print(f"\n🎯 可操作信号：{len(actionable)} 个")
    for r in actionable:
        print(f"  {r['symbol']} {r['signal']} {r['grade']}级 (综合分={r['score']})")
