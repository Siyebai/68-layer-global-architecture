"""
任务1: 遗传算法 × 回测 — 自动找最优参数
"""
import urllib.request, json, math, random
from datetime import datetime

BASE = "https://api.binance.com"

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def ema(prices, period):
    k = 2/(period+1); e = prices[0]
    for p in prices[1:]: e = p*k + e*(1-k)
    return e

def calc_rsi(closes, period=14):
    gains = [max(closes[i]-closes[i-1],0) for i in range(1,len(closes))]
    losses = [max(closes[i-1]-closes[i],0) for i in range(1,len(closes))]
    ag = sum(gains[-period:])/period; al = sum(losses[-period:])/period
    if al==0: return 100
    return 100 - 100/(1+ag/al)

def calc_macd(closes):
    return ema(closes[-26:],12) - ema(closes,26)

def calc_atr(highs, lows, closes, period=14):
    trs = [max(highs[i]-lows[i], abs(highs[i]-closes[i-1]), abs(lows[i]-closes[i-1]))
           for i in range(1, min(period+1,len(closes)))]
    return sum(trs)/len(trs) if trs else 0

def backtest(closes, highs, lows, params, capital=250):
    rsi_low, rsi_high, min_str, sl_pct, tp_r = params
    position = None
    trades = []

    for i in range(60, len(closes)-1):
        c = closes[:i+1]; h = highs[:i+1]; l = lows[:i+1]
        price = closes[i]
        rsi = calc_rsi(c)
        macd = calc_macd(c)
        sma20 = sum(c[-20:])/20
        bb_low = sma20 - 2*math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
        bb_high = sma20 + 2*math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
        bb_pos = (price-bb_low)/(bb_high-bb_low) if (bb_high-bb_low)>0 else 0.5
        atr = calc_atr(h, l, c)

        bull = sum([rsi<rsi_low, macd>0, price>sma20, bb_pos<0.35])
        bear = sum([rsi>rsi_high, macd<0, price<sma20, bb_pos>0.65])
        total = bull + bear
        if total == 0: sig_dir, strength = 'neutral', 0
        elif bull > bear: sig_dir, strength = 'long', bull/total
        else: sig_dir, strength = 'short', bear/total

        if not position and sig_dir != 'neutral' and strength >= min_str:
            stop_dist = max(atr*1.5, price*sl_pct)
            sl = price-stop_dist if sig_dir=='long' else price+stop_dist
            tp = price+stop_dist*tp_r if sig_dir=='long' else price-stop_dist*tp_r
            entry = closes[i+1]*(1+0.0003 if sig_dir=='long' else 1-0.0003)
            risk = capital*0.004
            size = risk/stop_dist
            capital -= entry*size*0.0005
            position = {'dir':sig_dir,'entry':entry,'sl':sl,'tp':tp,'size':size,'bar':i}

        elif position:
            p = position; is_long = p['dir']=='long'
            closed=False; exit_p=price
            if is_long and lows[i]<=p['sl']: exit_p=p['sl']; closed=True
            if not is_long and highs[i]>=p['sl']: exit_p=p['sl']; closed=True
            if not closed and is_long and highs[i]>=p['tp']: exit_p=p['tp']; closed=True
            if not closed and not is_long and lows[i]<=p['tp']: exit_p=p['tp']; closed=True
            if closed:
                pnl = (exit_p-p['entry'])*p['size'] if is_long else (p['entry']-exit_p)*p['size']
                net = pnl - exit_p*p['size']*0.0005
                capital += net
                trades.append({'pnl':net,'won':net>0})
                position = None

    if not trades: return -1
    wins = sum(1 for t in trades if t['won'])
    wr = wins/len(trades)
    gp = sum(t['pnl'] for t in trades if t['won'])
    gl = abs(sum(t['pnl'] for t in trades if not t['won']))
    pf = gp/gl if gl>0 else 1
    # 适应度 = 胜率*0.4 + 盈亏比*0.4 + 交易数惩罚
    fitness = wr*0.4 + min(pf/3,1)*0.4 + min(len(trades)/30,1)*0.2
    return fitness

# 获取多品种数据
print("📥 获取历史数据...")
datasets = []
for sym, tf in [('BTC','4h'),('ETH','4h'),('SOL','4h')]:
    k = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval={tf}&limit=400")
    datasets.append({
        'name': f"{sym}/{tf}",
        'closes': [float(x[4]) for x in k],
        'highs':  [float(x[2]) for x in k],
        'lows':   [float(x[3]) for x in k],
    })
print(f"✅ 数据就绪: {[d['name'] for d in datasets]}")

# 遗传算法
GENE_RANGES = [
    [25, 45],    # rsi_oversold
    [55, 75],    # rsi_overbought
    [0.50, 0.85],# min_strength
    [0.01, 0.04],# stop_loss_pct
    [1.2, 3.0],  # take_profit_r
]
POP = 25; GENS = 40; MR = 0.12; CR = 0.8; ELITE = 3

def random_chrom():
    return [r[0]+random.random()*(r[1]-r[0]) for r in GENE_RANGES]

def fitness_fn(chrom):
    scores = []
    for d in datasets:
        s = backtest(d['closes'], d['highs'], d['lows'], chrom)
        scores.append(s)
    return sum(scores)/len(scores)

def crossover(p1, p2):
    if random.random()>CR: return list(p1), list(p2)
    a,b = sorted(random.sample(range(len(p1)),2))
    return p1[:a]+p2[a:b]+p1[b:], p2[:a]+p1[a:b]+p2[b:]

def mutate(chrom):
    c = list(chrom)
    for i,(lo,hi) in enumerate(GENE_RANGES):
        if random.random()<MR:
            c[i] = max(lo, min(hi, c[i]+random.gauss(0,(hi-lo)*0.1)))
    return c

print("\n🧬 启动遗传算法优化 (25个体 × 40代)...")
pop = [(random_chrom(), 0) for _ in range(POP)]
best_chrom, best_fit = pop[0]

for gen in range(GENS):
    scored = [(c, fitness_fn(c)) for c,_ in pop]
    scored.sort(key=lambda x: x[1], reverse=True)
    if scored[0][1] > best_fit:
        best_chrom, best_fit = scored[0]
    if gen % 8 == 0:
        print(f"  Gen {gen:2d} | best={best_fit:.4f} | avg={sum(s for _,s in scored)/len(scored):.4f}")
    new_pop = scored[:ELITE]
    while len(new_pop) < POP:
        p1 = scored[random.randint(0,min(10,POP-1))][0]
        p2 = scored[random.randint(0,min(10,POP-1))][0]
        c1, c2 = crossover(p1, p2)
        new_pop.append((mutate(c1), 0))
        if len(new_pop) < POP: new_pop.append((mutate(c2), 0))
    pop = new_pop

print(f"  Gen 39 完成 | best={best_fit:.4f}")
names = ["RSI超卖阈值","RSI超买阈值","最低信号强度","止损比例","止盈倍数R"]
print(f"\n🏆 最优参数 (综合适应度={best_fit:.4f}):")
for n, v in zip(names, best_chrom):
    print(f"  {n:12}: {v:.4f}")

# 用最优参数重跑回测
print("\n📊 最优参数回测验证:")
for d in datasets:
    cap = 250
    t_list = []
    position = None
    closes,highs,lows = d['closes'],d['highs'],d['lows']
    rsi_low,rsi_high,min_str,sl_pct,tp_r = best_chrom
    for i in range(60,len(closes)-1):
        c=closes[:i+1]; h=highs[:i+1]; l=lows[:i+1]
        price=closes[i]
        rsi=calc_rsi(c); macd=calc_macd(c)
        sma20=sum(c[-20:])/20
        bb_l=sma20-2*math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
        bb_h=sma20+2*math.sqrt(sum((x-sma20)**2 for x in c[-20:])/20)
        bb_pos=(price-bb_l)/(bb_h-bb_l) if (bb_h-bb_l)>0 else 0.5
        atr=calc_atr(h,l,c)
        bull=sum([rsi<rsi_low,macd>0,price>sma20,bb_pos<0.35])
        bear=sum([rsi>rsi_high,macd<0,price<sma20,bb_pos>0.65])
        total=bull+bear
        if total==0: sig_dir,strength='neutral',0
        elif bull>bear: sig_dir,strength='long',bull/total
        else: sig_dir,strength='short',bear/total
        if not position and sig_dir!='neutral' and strength>=min_str:
            stop_dist=max(atr*1.5,price*sl_pct)
            sl=price-stop_dist if sig_dir=='long' else price+stop_dist
            tp=price+stop_dist*tp_r if sig_dir=='long' else price-stop_dist*tp_r
            entry=closes[i+1]*(1+0.0003 if sig_dir=='long' else 1-0.0003)
            risk=cap*0.004; size=risk/stop_dist
            cap-=entry*size*0.0005
            position={'dir':sig_dir,'entry':entry,'sl':sl,'tp':tp,'size':size}
        elif position:
            p=position; is_long=p['dir']=='long'
            closed=False; exit_p=price
            if is_long and lows[i]<=p['sl']: exit_p=p['sl']; closed=True
            if not is_long and highs[i]>=p['sl']: exit_p=p['sl']; closed=True
            if not closed and is_long and highs[i]>=p['tp']: exit_p=p['tp']; closed=True
            if not closed and not is_long and lows[i]<=p['tp']: exit_p=p['tp']; closed=True
            if closed:
                pnl=(exit_p-p['entry'])*p['size'] if is_long else (p['entry']-exit_p)*p['size']
                net=pnl-exit_p*p['size']*0.0005; cap+=net
                t_list.append({'pnl':net,'won':net>0})
                position=None
    if not t_list: continue
    wins=sum(1 for t in t_list if t['won']); wr=wins/len(t_list)
    gp=sum(t['pnl'] for t in t_list if t['won'])
    gl=abs(sum(t['pnl'] for t in t_list if not t['won']))
    pf=gp/gl if gl>0 else 9.99
    ret=(cap/250-1)*100
    print(f"  {d['name']:8} | 交易{len(t_list):2d}笔 | 胜率{wr:.0%} | PF={pf:.2f} | 收益{ret:+.2f}%")

import json as _json
result = {"optimized_params": dict(zip(names, best_chrom)), "fitness": best_fit, "ts": datetime.now().isoformat()}
with open('/root/.openclaw/workspace/trading-system/data/optimized_params.json','w') as f:
    _json.dump(result, f, ensure_ascii=False, indent=2)
print("\n✅ 最优参数已保存 → data/optimized_params.json")
