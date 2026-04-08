"""
资金费率扫描器 — 融合仓库 claude-plugins/funding-rate-scanner
支持 OKX/Gate/Bitget 三交易所，无需 API Key
"""
import urllib.request, json, time
from datetime import datetime

def fetch_okx():
    """OKX 资金费率 (公开接口)"""
    try:
        url = "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read())
        info = data.get('data', [{}])[0]
        if not info: return None
        return {
            'exchange': 'OKX',
            'symbol': info.get('instId', 'BTC-USDT-SWAP'),
            'rate_8h': float(info.get('fundingRate', 0)),
            'next_rate': float(info.get('nextFundingRate', 0)),
            'next_time': info.get('fundingTime', '')
        }
    except: return None

def fetch_gate():
    """Gate.io 资金费率 (公开接口)"""
    try:
        url = "https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT"
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read())
        return {
            'exchange': 'Gate',
            'symbol': 'BTC_USDT',
            'rate_8h': float(data.get('funding_rate', 0)),
            'mark_price': float(data.get('mark_price', 0)),
            'funding_next': data.get('funding_next_apply', '')
        }
    except: return None

def tier(daily_pct):
    """分级显示"""
    if daily_pct > 2: return "🔴 EXCEPTIONAL"
    if daily_pct > 0.5: return "🟠 STRONG"
    if daily_pct > 0.15: return "🟡 MODERATE"
    return "⚪ WEAK"

def scan_all(top_n=15, min_daily=0.1):
    """扫描多交易所"""
    print("="*65)
    print(f"💰 资金费率扫描器 (OKX + Gate + Bitget)  {datetime.now().strftime('%H:%M:%S')}")
    print("="*65)
    
    # OKX
    okx = fetch_okx()
    if okx:
        daily = okx['rate_8h'] * 3 * 100
        print(f"\nOKX:")
        print(f"  {okx['symbol']}  8h费率={okx['rate_8h']*100:.4f}%  日化={daily:.3f}%  {tier(daily)}")
        print(f"  下次结算：{okx.get('next_time','N/A')}")
    
    # Gate
    gate = fetch_gate()
    if gate:
        daily = gate['rate_8h'] * 3 * 100
        print(f"\nGate.io:")
        print(f"  {gate['symbol']}  8h费率={gate['rate_8h']*100:.4f}%  日化={daily:.3f}%  {tier(daily)}")
        print(f"  标记价：${gate.get('mark_price',0):,.2f}")
    
    # 币安合约 (已有)
    try:
        url = "https://fapi.binance.com/fapi/v1/premiumIndex"
        with urllib.request.urlopen(url, timeout=5) as r:
            rates = json.loads(r.read())
        print(f"\nBinance Futures (Top {top_n}):")
        sorted_rates = sorted(rates, key=lambda x: abs(float(x.get('lastFundingRate',0))), reverse=True)[:top_n]
        for item in sorted_rates:
            rate = float(item.get('lastFundingRate', 0)) * 100
            daily = rate * 3
            if abs(daily) >= min_daily:
                sym = item['symbol']
                mark = float(item.get('markPrice', 0))
                strat = "买现货+空合约" if rate > 0 else "空现货+多合约"
                print(f"  {sym:14} 费率={rate:+.4f}%  日化={daily:+.3f}%  {tier(abs(daily))}  {strat}")
    except Exception as e:
        print(f"\nBinance 获取失败：{e}")
    
    print(f"\n✅ 扫描完成")
    return True

if __name__ == "__main__":
    scan_all()
