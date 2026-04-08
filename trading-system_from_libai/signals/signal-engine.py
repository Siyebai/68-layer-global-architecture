"""
信号引擎 — 融合仓库 signal-engine.js + high-winrate-strategy.js 逻辑
整合多周期共振 + 信号融合 + A/B/C/D分级
接入币安 API (非Gate)
"""
import urllib.request, json, time, math
from datetime import datetime

BASE = "https://api.binance.com"
FAPI = "https://fapi.binance.com"

SYMBOLS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX']

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

def ema(prices, period):
    k = 2 / (period + 1)
    e = prices[0]
    for p in prices[1:]:
        e = p * k + e * (1 - k)
    return e

def calc_rsi(closes, period=14):
    gains = [max(closes[i]-closes[i-1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i-1]-closes[i], 0) for i in range(1, len(closes))]
    ag = sum(gains[-period:]) / period
    al = sum(losses[-period:]) / period
    if al == 0: return 100
    return 100 - 100 / (1 + ag / al)

def calc_macd(closes):
    e12 = ema(closes[-26:], 12)
    e26 = ema(closes, 26)
    return e12 - e26

def calc_bb(closes, period=20):
    sma = sum(closes[-period:]) / period
    std = math.sqrt(sum((x - sma)**2 for x in closes[-period:]) / period)
    return sma - 2*std, sma, sma + 2*std

def calc_atr(highs, lows, closes, period=14):
    trs = []
    for i in range(1, min(period+1, len(closes))):
        trs.append(max(highs[i]-lows[i],
                      abs(highs[i]-closes[i-1]),
                      abs(lows[i]-closes[i-1])))
    return sum(trs)/len(trs) if trs else 0

def analyze(closes, highs, lows):
    """综合分析，返回方向+强度+详细指标"""
    rsi = calc_rsi(closes)
    macd = calc_macd(closes)
    bb_low, bb_mid, bb_high = calc_bb(closes)
    atr = calc_atr(highs, lows, closes)
    price = closes[-1]
    sma20 = sum(closes[-20:]) / 20
    sma50 = sum(closes[-50:]) / 20 if len(closes) >= 50 else sma20
    bb_pos = (price - bb_low) / (bb_high - bb_low) if (bb_high - bb_low) > 0 else 0.5

    # 多头信号计分 (来自仓库 high-winrate-strategy.js)
    bull_signals = []
    bear_signals = []

    if rsi < 40: bull_signals.append(f"RSI超卖({rsi:.1f})")
    if rsi > 60: bear_signals.append(f"RSI超买({rsi:.1f})")
    if macd > 0: bull_signals.append(f"MACD多头({macd:+.2f})")
    if macd < 0: bear_signals.append(f"MACD空头({macd:+.2f})")
    if price > sma20: bull_signals.append("价格>MA20")
    if price < sma20: bear_signals.append("价格<MA20")
    if bb_pos < 0.3: bull_signals.append(f"布林下轨({bb_pos:.2f})")
    if bb_pos > 0.7: bear_signals.append(f"布林上轨({bb_pos:.2f})")
    if price > sma50: bull_signals.append("价格>MA50")
    if price < sma50: bear_signals.append("价格<MA50")

    bull_count = len(bull_signals)
    bear_count = len(bear_signals)

    if bull_count > bear_count:
        direction = "long"
        strength = bull_count / (bull_count + bear_count)
    elif bear_count > bull_count:
        direction = "short"
        strength = bear_count / (bull_count + bear_count)
    else:
        direction = "neutral"
        strength = 0

    return {
        "direction": direction, "strength": round(strength, 2),
        "rsi": round(rsi, 1), "macd": round(macd, 4),
        "bb_pos": round(bb_pos, 2), "atr": round(atr, 4),
        "price": price, "sma20": round(sma20, 2),
        "bull_signals": bull_signals, "bear_signals": bear_signals
    }

def grade_signal(s1h, s4h):
    """A/B/C/D分级 — 对标仓库 signal-engine.js"""
    resonance = s1h['direction'] == s4h['direction'] and s1h['direction'] != 'neutral'
    avg_str = (s1h['strength'] + s4h['strength']) / 2
    if resonance and avg_str >= 0.75: return 'A', resonance
    if resonance and avg_str >= 0.50: return 'B', resonance
    if not resonance and avg_str >= 0.75: return 'C', resonance
    return 'D', resonance

def scan_symbol(sym):
    """扫描单个币种"""
    try:
        k1h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=1h&limit=80")
        k4h = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval=4h&limit=80")
        c1h = [float(k[4]) for k in k1h]
        h1h = [float(k[2]) for k in k1h]
        l1h = [float(k[3]) for k in k1h]
        c4h = [float(k[4]) for k in k4h]
        h4h = [float(k[2]) for k in k4h]
        l4h = [float(k[3]) for k in k4h]
        s1h = analyze(c1h, h1h, l1h)
        s4h = analyze(c4h, h4h, l4h)
        grade, resonance = grade_signal(s1h, s4h)
        return {
            "symbol": sym, "grade": grade,
            "direction": s1h['direction'], "strength": s1h['strength'],
            "rsi": s1h['rsi'], "macd": s1h['macd'],
            "atr": s1h['atr'], "price": s1h['price'],
            "bb_pos": s1h['bb_pos'], "resonance": resonance,
            "bull": s1h['bull_signals'], "bear": s1h['bear_signals'],
            "s1h": s1h, "s4h": s4h
        }
    except Exception as e:
        return {"symbol": sym, "error": str(e)[:60]}

def scan_funding_rates():
    """资金费率套利扫描 — 对标仓库 arbitrage-scanner.js"""
    rates = fetch(f"{FAPI}/fapi/v1/premiumIndex")
    opps = []
    for x in rates:
        rate = float(x.get('lastFundingRate', 0))
        if abs(rate) >= 0.0005:  # >0.05%/8h
            daily = rate * 3 * 100
            annual = rate * 3 * 365 * 100
            opps.append({
                "symbol": x['symbol'],
                "rate_pct": round(rate * 100, 4),
                "daily_pct": round(daily, 3),
                "annual_pct": round(annual, 1),
                "mark_price": float(x.get('markPrice', 0)),
                "strategy": "买现货+空合约" if rate > 0 else "空现货+多合约"
            })
    opps.sort(key=lambda x: abs(x['rate_pct']), reverse=True)
    return opps[:10]

if __name__ == "__main__":
    print("=" * 65)
    print(f"🔍 信号引擎扫描  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)
    results = [scan_symbol(s) for s in SYMBOLS]
    
    actionable = [r for r in results if r.get('grade') in ['A','B'] and 'error' not in r]
    others = [r for r in results if r.get('grade') not in ['A','B'] or 'error' in r]

    if actionable:
        print("\n🔥 可操作信号 (A/B级):")
        for r in actionable:
            emoji = "🔥" if r['grade']=='A' else "✅"
            print(f"  {emoji} {r['symbol']:6} {r['grade']}级 | {r['direction']:7} | RSI={r['rsi']} | 信号:{','.join(r.get('bull',[]) or r.get('bear',[]))}")
    else:
        print("\n😴 当前无 A/B级信号，市场观望")

    print("\n📊 全部信号:")
    for r in results:
        if 'error' in r:
            print(f"  {r['symbol']:6} ❌ {r['error']}")
            continue
        g = r['grade']
        emoji = {'A':'🔥','B':'✅','C':'⚠️','D':'😴'}[g]
        res = "共振" if r['resonance'] else "—"
        print(f"  {emoji} {r['symbol']:6} {g}级 | {r['direction']:7} str={r['strength']} | RSI={r['rsi']:5.1f} | {res} | ${r['price']:,.2f}")

    print("\n💰 资金费率套利机会:")
    opps = scan_funding_rates()
    for o in opps[:6]:
        tier = "🔥" if abs(o['daily_pct']) > 1 else "✅"
        print(f"  {tier} {o['symbol']:14} 费率={o['rate_pct']:+.4f}%  日化={o['daily_pct']:+.3f}%  {o['strategy']}")
    
    print(f"\n✅ 扫描完成，共 {len(results)} 个品种")
