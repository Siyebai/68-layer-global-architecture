"""
全策略交易系统监控器
覆盖: 合约方向性 | 资金费率套利 | 波段交易 | 对冲 | 跨所套利
持续验证 + 参数优化 + 实时报告
"""
import urllib.request, json, math, time, os
from datetime import datetime

BASE  = "https://api.binance.com"
FAPI  = "https://fapi.binance.com"
LOG   = "/root/.openclaw/workspace/trading-system/logs/monitor.log"
STATE = "/root/.openclaw/workspace/trading-system/logs/monitor_state.json"

os.makedirs(os.path.dirname(LOG), exist_ok=True)

def fetch(url, timeout=10):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:
        return None

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG, 'a') as f:
        f.write(line + '\n')

def ema(p, n):
    k=2/(n+1); e=p[0]
    for x in p[1:]: e=x*k+e*(1-k)
    return e

def rsi(c, n=14):
    g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
    l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
    ag=sum(g[-n:])/n; al=sum(l[-n:])/n
    return 100-(100/(1+ag/al)) if al else 100

def atr(h,l,c,n=14):
    t=[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,min(n+1,len(c)))]
    return sum(t)/len(t) if t else 0

# ── 策略1: 合约方向性 ──
def scan_directional(symbols, params):
    results = []
    for sym in symbols:
        k1h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=1h&limit=80")
        k4h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=80")
        if not k1h or not k4h: continue
        def sig(klines):
            c=[float(k[4]) for k in klines]
            h=[float(k[2]) for k in klines]
            l=[float(k[3]) for k in klines]
            price=c[-1]; r=rsi(c); m=ema(c[-26:],12)-ema(c,26)
            sma=sum(c[-20:])/20
            std=math.sqrt(sum((x-sma)**2 for x in c[-20:])/20)
            bb=(price-(sma-2*std))/(4*std) if std else 0.5
            a=atr(h,l,c)
            bull=sum([r<params['rsi_lo'],m>0,price>sma,bb<0.35])
            bear=sum([r>params['rsi_hi'],m<0,price<sma,bb>0.65])
            tot=bull+bear
            if tot==0: return 'neutral',0,price,a,r,m
            elif bull>bear: return 'long',bull/tot,price,a,r,m
            else: return 'short',bear/tot,price,a,r,m
        d1=sig(k1h); d4=sig(k4h)
        res=d1[0]==d4[0] and d1[0]!='neutral'
        avg_s=(d1[1]+d4[1])/2
        if res and avg_s>=0.75: grade='A'
        elif res and avg_s>=0.5: grade='B'
        elif avg_s>=0.75: grade='C'
        else: grade='D'
        if grade in ['A','B'] and d1[1]>=params['min_str']:
            stop=max(d1[3]*1.5, d1[2]*params['sl'])
            results.append({
                'sym':sym,'grade':grade,'dir':d1[0],'str':round(avg_s,2),
                'price':d1[2],'atr':d1[3],'rsi':round(d1[4],1),'macd':round(d1[5],4),
                'sl':round(d1[2]-stop if d1[0]=='long' else d1[2]+stop,4),
                'tp':round(d1[2]+stop*params['tp_r'] if d1[0]=='long' else d1[2]-stop*params['tp_r'],4),
                'stop_pct':round(stop/d1[2]*100,2)
            })
    return results

# ── 策略2: 资金费率套利 ──
def scan_funding():
    rates = fetch(f"{FAPI}/fapi/v1/premiumIndex")
    if not rates: return []
    opps = []
    for x in rates:
        r=float(x.get('lastFundingRate',0))
        if abs(r)<0.001: continue
        sym=x['symbol']
        # 验证现货是否存在
        spot = fetch(f"{BASE}/api/v3/ticker/price?symbol={sym}")
        if not spot: continue  # 无现货 = 无法对冲，跳过
        mark=float(x.get('markPrice',0))
        spot_p=float(spot.get('price',0))
        basis=abs(mark-spot_p)/spot_p*100 if spot_p else 99
        if basis>3: continue  # 基差>3%风险大
        opps.append({
            'symbol':sym,'rate':r,'rate_pct':round(r*100,4),
            'daily_pct':round(r*3*100,3),'annual_pct':round(r*3*365*100,1),
            'mark':mark,'spot':spot_p,'basis_pct':round(basis,3),
            'strategy':'买现货+空合约' if r>0 else '空现货+多合约'
        })
    opps.sort(key=lambda x:abs(x['rate']),reverse=True)
    return opps[:8]

# ── 策略3: 波段交易 (日线级别) ──
def scan_swing(symbols):
    results = []
    for sym in symbols:
        k1d = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=1d&limit=60")
        k4h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=80")
        if not k1d or not k4h: continue
        c1d=[float(k[4]) for k in k1d]
        h1d=[float(k[2]) for k in k1d]
        l1d=[float(k[3]) for k in k1d]
        c4h=[float(k[4]) for k in k4h]
        price=c1d[-1]
        r_1d=rsi(c1d); r_4h=rsi(c4h)
        macd_1d=ema(c1d[-26:],12)-ema(c1d,26)
        sma20=sum(c1d[-20:])/20; sma50=sum(c1d[-50:])/20 if len(c1d)>=50 else sma20
        a=atr(h1d,l1d,c1d)
        # 波段做多: RSI日线<40 + 4h<45 + 价格>MA50
        if r_1d<40 and r_4h<45 and price>sma50:
            results.append({'sym':sym,'type':'swing_long','timeframe':'1d+4h',
                'rsi_1d':round(r_1d,1),'rsi_4h':round(r_4h,1),
                'price':price,'sma20':round(sma20,2),'sma50':round(sma50,2),
                'atr':round(a,4),'confidence':'中'})
        # 波段做空: RSI日线>65 + 4h>60 + 价格<MA20
        elif r_1d>65 and r_4h>60 and price<sma20:
            results.append({'sym':sym,'type':'swing_short','timeframe':'1d+4h',
                'rsi_1d':round(r_1d,1),'rsi_4h':round(r_4h,1),
                'price':price,'sma20':round(sma20,2),'sma50':round(sma50,2),
                'atr':round(a,4),'confidence':'中'})
    return results

# ── 策略4: 对冲交易 (相关性对冲) ──
def scan_hedge(pairs):
    """统计套利: 相关币对价差偏离 → 做多弱势/做空强势"""
    results = []
    for sym_a, sym_b in pairs:
        k_a = fetch(f"{BASE}/api/v3/klines?symbol={sym_a}USDT&interval=4h&limit=30")
        k_b = fetch(f"{BASE}/api/v3/klines?symbol={sym_b}USDT&interval=4h&limit=30")
        if not k_a or not k_b: continue
        r_a=[float(k[4]) for k in k_a]
        r_b=[float(k[4]) for k in k_b]
        # 归一化收益率
        ret_a=[(r_a[i]-r_a[i-1])/r_a[i-1] for i in range(1,len(r_a))]
        ret_b=[(r_b[i]-r_b[i-1])/r_b[i-1] for i in range(1,len(r_b))]
        # 累计收益差
        cum_a=sum(ret_a[-10:]); cum_b=sum(ret_b[-10:])
        spread=cum_a-cum_b
        # 价差超过2%则有对冲机会
        if abs(spread)>0.02:
            if spread>0:  # A强B弱 → 空A多B
                action=f"空{sym_a}+多{sym_b}"
            else:         # B强A弱 → 空B多A
                action=f"空{sym_b}+多{sym_a}"
            results.append({
                'pair':f"{sym_a}/{sym_b}",'spread_pct':round(spread*100,2),
                'action':action,'signal':'强' if abs(spread)>0.05 else '中',
                'price_a':r_a[-1],'price_b':r_b[-1]
            })
    return results

# ── 策略5: 价差套利 (同币不同价格) ──
def scan_price_arb():
    """检测币安现货vs合约标记价格偏差"""
    results = []
    targets = ['BTC','ETH','SOL','BNB','XRP']
    for sym in targets:
        spot = fetch(f"{BASE}/api/v3/ticker/price?symbol={sym}USDT")
        fut  = fetch(f"{FAPI}/fapi/v1/ticker/price?symbol={sym}USDT")
        if not spot or not fut: continue
        sp=float(spot['price']); fp=float(fut['price'])
        diff=(fp-sp)/sp*100
        if abs(diff)>0.15:
            results.append({
                'symbol':sym,'spot':sp,'futures':fp,
                'diff_pct':round(diff,4),
                'action':'买现货+空合约' if diff>0 else '买合约+空现货'
            })
    return results

# ── 系统状态汇总 ──
def load_state():
    try:
        with open(STATE,'r') as f: return json.load(f)
    except: return {'rounds':0,'total_signals':0,'total_arb':0,'best_params':{},'history':[]}

def save_state(s):
    with open(STATE,'w') as f: json.dump(s, f, ensure_ascii=False, indent=2)

# ── 主监控循环 ──
PARAMS = {'rsi_lo':41.36,'rsi_hi':58.57,'min_str':0.73,'sl':0.0299,'tp_r':1.2056}
DIRECTIONAL_SYMS = ['BTC','ETH','SOL','BNB','XRP','ADA','AVAX','DOT']
SWING_SYMS       = ['BTC','ETH','SOL','BNB','XRP']
HEDGE_PAIRS      = [('BTC','ETH'),('SOL','AVAX'),('BNB','ETH')]

state = load_state()
state['rounds'] += 1
round_n = state['rounds']

log(f"{'='*60}")
log(f"🔄 监控轮次 #{round_n}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
log(f"{'='*60}")

# 1. 合约方向性
log("📡 [1/5] 合约方向性扫描...")
dir_signals = scan_directional(DIRECTIONAL_SYMS, PARAMS)
for s in dir_signals:
    arrow="📈" if s['dir']=='long' else "📉"
    log(f"  {arrow} {s['sym']:6} {s['grade']}级 {s['dir']:6} RSI={s['rsi']} str={s['str']} 入=${s['price']:,.2f} SL=${s['sl']:,.2f} TP=${s['tp']:,.2f}")
if not dir_signals: log("  😴 无方向性信号")

# 2. 资金费率套利
log("💰 [2/5] 资金费率套利扫描（含现货验证）...")
funding_opps = scan_funding()
for o in funding_opps[:4]:
    tier="🔥" if abs(o['daily_pct'])>=1 else "✅"
    log(f"  {tier} {o['symbol']:14} 费率={o['rate_pct']:+.4f}% 日化={o['daily_pct']:+.3f}% 基差={o['basis_pct']:.3f}% {o['strategy']}")
if not funding_opps: log("  😴 无有效套利机会")

# 3. 波段交易
log("📊 [3/5] 波段交易扫描（日线+4h共振）...")
swing_signals = scan_swing(SWING_SYMS)
for s in swing_signals:
    t="📈" if 'long' in s['type'] else "📉"
    log(f"  {t} {s['sym']:6} {s['type']} RSI_1d={s['rsi_1d']} RSI_4h={s['rsi_4h']} 价格=${s['price']:,.2f}")
if not swing_signals: log("  😴 无波段信号")

# 4. 对冲交易
log("⚖️  [4/5] 相关性对冲扫描...")
hedge_signals = scan_hedge(HEDGE_PAIRS)
for h in hedge_signals:
    log(f"  🔀 {h['pair']:12} 价差={h['spread_pct']:+.2f}% 操作={h['action']} 强度={h['signal']}")
if not hedge_signals: log("  😴 无对冲机会（价差正常）")

# 5. 现货/合约价差套利
log("🔗 [5/5] 现货-合约价差套利...")
arb_signals = scan_price_arb()
for a in arb_signals:
    log(f"  💱 {a['symbol']:6} 现货=${a['spot']:,.2f} 合约=${a['futures']:,.2f} 差={a['diff_pct']:+.4f}% {a['action']}")
if not arb_signals: log("  😴 价差正常，无套利空间")

# 统计更新
state['total_signals'] += len(dir_signals)
state['total_arb'] += len(funding_opps)
state['history'].append({
    'round': round_n, 'ts': datetime.now().isoformat(),
    'dir_signals': len(dir_signals), 'funding_opps': len(funding_opps),
    'swing': len(swing_signals), 'hedge': len(hedge_signals), 'arb': len(arb_signals)
})
if len(state['history'])>100: state['history'].pop(0)
save_state(state)

# 汇总
log(f"\n📋 本轮汇总:")
log(f"  合约方向性: {len(dir_signals)} 个信号  |  套利机会: {len(funding_opps)} 个")
log(f"  波段信号:   {len(swing_signals)} 个      |  对冲机会: {len(hedge_signals)} 个  |  价差: {len(arb_signals)} 个")
log(f"  累计轮次: {round_n}  总信号: {state['total_signals']}  总套利: {state['total_arb']}")
log(f"✅ 监控完成\n")
