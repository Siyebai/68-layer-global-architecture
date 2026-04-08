"""
任务2: dryRun 模拟 — 用最优参数跑资金费率套利 + 方向性信号模拟交易
目标: 积累50笔模拟记录，统计真实胜率
"""
import urllib.request, json, math, time
from datetime import datetime

BASE  = "https://api.binance.com"
FAPI  = "https://fapi.binance.com"

# 最优参数 (遗传算法结果)
PARAMS = {
    "rsi_oversold":  41.36,
    "rsi_overbought":58.57,
    "min_strength":  0.73,
    "stop_loss_pct": 0.0299,
    "take_profit_r": 1.2056,
}

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def ema(prices, p):
    k=2/(p+1); e=prices[0]
    for x in prices[1:]: e=x*k+e*(1-k)
    return e

def calc_rsi(c, p=14):
    g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
    l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
    ag=sum(g[-p:])/p; al=sum(l[-p:])/p
    return 100-(100/(1+ag/al)) if al else 100

def get_signal(sym):
    k1h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=1h&limit=80")
    k4h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=80")
    def analyze(klines):
        c=[float(k[4]) for k in klines]
        h=[float(k[2]) for k in klines]
        l=[float(k[3]) for k in klines]
        price=c[-1]; rsi=calc_rsi(c)
        macd=ema(c[-26:],12)-ema(c,26)
        sma20=sum(c[-20:])/20
        std=math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
        bb_pos=(price-(sma20-2*std))/(4*std) if std else 0.5
        atr_list=[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,15)]
        atr=sum(atr_list)/len(atr_list)
        bull=sum([rsi<PARAMS['rsi_oversold'],macd>0,price>sma20,bb_pos<0.35])
        bear=sum([rsi>PARAMS['rsi_overbought'],macd<0,price<sma20,bb_pos>0.65])
        total=bull+bear
        if total==0: return 'neutral',0,price,atr
        elif bull>bear: return 'long',bull/total,price,atr
        else: return 'short',bear/total,price,atr
    d1h=analyze(k1h); d4h=analyze(k4h)
    resonance=d1h[0]==d4h[0] and d1h[0]!='neutral'
    avg_str=(d1h[1]+d4h[1])/2
    if resonance and avg_str>=0.75: grade='A'
    elif resonance and avg_str>=0.50: grade='B'
    elif avg_str>=0.75: grade='C'
    else: grade='D'
    return {'sym':sym,'dir':d1h[0],'strength':avg_str,'grade':grade,
            'price':d1h[2],'atr':d1h[3],'resonance':resonance}

def get_funding_opps():
    rates = fetch(f"{FAPI}/fapi/v1/premiumIndex")
    opps=[]
    for x in rates:
        r=float(x.get('lastFundingRate',0))
        if abs(r)>=0.002:
            opps.append({'symbol':x['symbol'],'rate':r,'mark':float(x.get('markPrice',0))})
    opps.sort(key=lambda x:abs(x['rate']),reverse=True)
    return opps[:5]

# ── dryRun 执行 ──
print("="*65)
print(f"🎮 dryRun 模拟器  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"   参数: RSI超卖={PARAMS['rsi_oversold']} | 强度≥{PARAMS['min_strength']} | SL={PARAMS['stop_loss_pct']:.1%} | TP={PARAMS['take_profit_r']}R")
print("="*65)

equity    = 250.0
sim_trades= []
SYMBOLS   = ['BTC','ETH','SOL','BNB','XRP','ADA']

# 1. 方向性信号 dryRun
print("\n📡 扫描方向性信号...")
for sym in SYMBOLS:
    sig = get_signal(sym)
    if sig['grade'] in ['A','B'] and sig['strength'] >= PARAMS['min_strength']:
        stop_dist = max(sig['atr']*1.5, sig['price']*PARAMS['stop_loss_pct'])
        sl = sig['price']-stop_dist if sig['dir']=='long' else sig['price']+stop_dist
        tp = sig['price']+stop_dist*PARAMS['take_profit_r'] if sig['dir']=='long' else sig['price']-stop_dist*PARAMS['take_profit_r']
        risk = equity*0.004
        size = round(risk/stop_dist, 6)
        nominal = round(size*sig['price'],2)
        trade = {
            "type": "directional", "mode": "dryRun",
            "symbol": f"{sym}USDT", "direction": sig['dir'],
            "grade": sig['grade'], "strength": round(sig['strength'],2),
            "entry": sig['price'], "stop_loss": round(sl,4),
            "take_profit": round(tp,4), "size": size,
            "nominal_usdt": nominal, "risk_usdt": round(risk,2),
            "fee_est": round(nominal*0.0005,4),
            "ts": datetime.now().isoformat()
        }
        sim_trades.append(trade)
        arrow = "📈" if sig['dir']=='long' else "📉"
        print(f"  {arrow} {sym:5} {sig['grade']}级{sig['dir']:6} 入场=${sig['price']:,.2f} SL=${sl:,.2f} TP=${tp:,.2f} 名义${nominal}")

# 2. 资金费率套利 dryRun
print("\n💰 资金费率套利 dryRun...")
opps = get_funding_opps()
for o in opps[:3]:
    alloc = equity * 0.15  # 单个机会最多15%资金
    spot = alloc/2; contract = alloc/2
    daily_income = spot * abs(o['rate'])*3
    trade = {
        "type": "funding_arbitrage", "mode": "dryRun",
        "symbol": o['symbol'], "rate_pct": round(o['rate']*100,4),
        "spot_usdt": round(spot,2), "contract_usdt": round(contract,2),
        "est_daily_income": round(daily_income,4),
        "strategy": "空现货+多合约" if o['rate']<0 else "买现货+空合约",
        "ts": datetime.now().isoformat()
    }
    sim_trades.append(trade)
    print(f"  💹 {o['symbol']:14} 费率={o['rate']*100:+.4f}%  分配${alloc:.0f}U  预计日收${daily_income:.3f}")

# 保存模拟记录
import os
log_file = '/root/.openclaw/workspace/trading-system/logs/dryrun_trades.jsonl'
os.makedirs(os.path.dirname(log_file), exist_ok=True)
with open(log_file,'a') as f:
    for t in sim_trades:
        f.write(json.dumps(t, ensure_ascii=False)+'\n')

# 统计
print(f"\n📊 本次 dryRun 统计:")
print(f"  方向性信号: {sum(1 for t in sim_trades if t['type']=='directional')} 笔")
print(f"  套利机会:   {sum(1 for t in sim_trades if t['type']=='funding_arbitrage')} 笔")
print(f"  总模拟笔数: {len(sim_trades)} 笔")

# 读取历史累计
try:
    with open(log_file,'r') as f:
        total = sum(1 for line in f)
    print(f"  历史累计:   {total} 笔 (目标50笔)")
    progress = min(total/50*100, 100)
    bar = '█'*int(progress/5) + '░'*(20-int(progress/5))
    print(f"  进度: [{bar}] {progress:.0f}%")
except: pass

print(f"\n✅ dryRun 记录已保存 → logs/dryrun_trades.jsonl")
