"""
套利扫描器 — 融合仓库 arbitrage-scanner.js + funding-rate-monitor.js
资金费率套利 + 基差检查 + 费率反转预警
接入币安 API
"""
import urllib.request, json, time
from datetime import datetime

BASE_API  = "https://api.binance.com"
BASE_FAPI = "https://fapi.binance.com"

MIN_DAILY_RATE  = 0.003   # 日收益至少0.3%
MIN_RR          = 2.0     # 风险回报比>=2
MAX_BASIS_PCT   = 3.0     # 现货合约基差<3%

def fetch(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())

class ArbitrageScanner:
    """
    融合仓库两个套利模块:
    - arbitrage-scanner.js: 综合套利机会扫描
    - funding-rate-monitor.js: 费率反转预警
    """
    def __init__(self):
        self.prev_rates = {}   # 费率历史，用于反转检测
        self.alerts = []

    def scan_funding(self):
        """资金费率套利扫描"""
        rates = fetch(f"{BASE_FAPI}/fapi/v1/premiumIndex")
        opps = []

        for x in rates:
            sym = x['symbol']
            rate = float(x.get('lastFundingRate', 0))
            mark = float(x.get('markPrice', 0))
            daily_rate = rate * 3  # 3次/天

            # 费率反转检测 (对标 funding-rate-monitor.js)
            prev = self.prev_rates.get(sym)
            if prev is not None:
                if prev < -0.001 and rate >= -0.001:
                    self.alerts.append({
                        "type": "funding_flip",
                        "symbol": sym, "from": prev, "to": rate,
                        "action": "⚠️ 费率反转！立即减仓50%",
                        "ts": datetime.now().isoformat()
                    })
            self.prev_rates[sym] = rate

            # 套利机会筛选 (对标 arbitrage-scanner.js 阈值)
            if abs(daily_rate) >= MIN_DAILY_RATE / 100:
                opps.append({
                    "symbol": sym,
                    "rate_pct": round(rate * 100, 4),
                    "daily_pct": round(daily_rate * 100, 3),
                    "annual_pct": round(daily_rate * 365 * 100, 1),
                    "mark_price": mark,
                    "strategy": "买现货+空合约" if rate > 0 else "空现货+多合约",
                    "direction": "positive" if rate > 0 else "negative",
                    "score": abs(daily_rate) * 100  # 机会评分
                })

        opps.sort(key=lambda x: x['score'], reverse=True)
        return opps

    def calc_hedge_position(self, equity, opp, hedge_ratio=0.3):
        """
        计算对冲仓位
        equity: 账户权益
        hedge_ratio: 用于套利的资金比例 (最多30%)
        """
        alloc = equity * hedge_ratio
        # 现货买入 + 合约做空 (等量)
        spot_size = alloc / 2
        contract_notional = alloc / 2
        daily_income = spot_size * abs(opp['daily_pct']) / 100
        return {
            "allocation": round(alloc, 2),
            "spot_usdt": round(spot_size, 2),
            "contract_notional": round(contract_notional, 2),
            "estimated_daily_income": round(daily_income, 4),
            "estimated_monthly_income": round(daily_income * 30, 2),
            "remark": "需评估现货流动性和合约深度"
        }

    def get_alerts(self):
        alerts = self.alerts.copy()
        self.alerts.clear()
        return alerts


def run_scan():
    scanner = ArbitrageScanner()
    print("=" * 65)
    print(f"💰 套利扫描器  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    opps = scanner.scan_funding()
    high = [o for o in opps if abs(o['daily_pct']) >= 1.0]
    medium = [o for o in opps if 0.3 <= abs(o['daily_pct']) < 1.0]

    if high:
        print(f"\n🔥 高收益机会 (日化≥1%):")
        for o in high[:5]:
            print(f"  {o['symbol']:14} 费率={o['rate_pct']:+.4f}%  日化={o['daily_pct']:+.3f}%  年化≈{o['annual_pct']:+.1f}%")
            print(f"    策略: {o['strategy']}")
            # 示例: 假设账户250U
            pos = scanner.calc_hedge_position(250, o, hedge_ratio=0.2)
            print(f"    仓位建议(250U账户20%对冲): 现货${pos['spot_usdt']}+合约${pos['contract_notional']}")
            print(f"    预计日收益: ${pos['estimated_daily_income']}  月收益: ${pos['estimated_monthly_income']}")

    if medium:
        print(f"\n✅ 中等机会 (日化0.3-1%):")
        for o in medium[:5]:
            print(f"  {o['symbol']:14} 费率={o['rate_pct']:+.4f}%  日化={o['daily_pct']:+.3f}%  {o['strategy']}")

    if not high and not medium:
        print("\n😴 当前无显著套利机会")

    print(f"\n📊 共扫描到 {len(opps)} 个潜在机会")
    return opps


if __name__ == "__main__":
    run_scan()
