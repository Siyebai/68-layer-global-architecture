"""
回测框架 — 完整移植仓库 backtest.js
支持历史K线验证、手续费/滑点、胜率统计
"""
import urllib.request, json, math
from datetime import datetime
import sys
sys.path.insert(0, '/root/.openclaw/workspace/trading-system')
from signals.signal_engine import analyze, grade_signal, fetch

BASE = "https://api.binance.com"

class Backtest:
    """
    对标仓库 backtest.js，完整实现:
    - 手续费 0.05% taker
    - 滑点 0.03%
    - ATR止损/固定止盈
    - 详细统计
    """
    def __init__(self, config=None):
        cfg = config or {}
        self.commission   = cfg.get('commission', 0.0005)    # 0.05%
        self.slippage     = cfg.get('slippage', 0.0003)      # 0.03%
        self.stop_loss_pct= cfg.get('stop_loss_pct', 0.02)   # 2%止损
        self.take_profit_r= cfg.get('take_profit_r', 1.5)    # 1.5R止盈
        self.capital      = cfg.get('capital', 250)           # 初始资金
        self.risk_per_trade= cfg.get('risk_per_trade', 0.004) # 每笔风险0.4%

    def run(self, closes, highs, lows, label=""):
        capital = self.capital
        position = None
        trades = []

        for i in range(60, len(closes) - 1):
            c_slice = closes[:i+1]
            h_slice = highs[:i+1]
            l_slice = lows[:i+1]
            price = closes[i]
            next_open = closes[i+1]

            sig = analyze(c_slice, h_slice, l_slice)

            # 入场条件 (对标仓库 signal-engine: strength >= 0.75)
            if not position and sig['direction'] != 'neutral' and sig['strength'] >= 0.65:
                stop_dist = max(sig['atr'] * 1.5, price * self.stop_loss_pct)
                if sig['direction'] == 'long':
                    sl = price - stop_dist
                    tp = price + stop_dist * self.take_profit_r
                else:
                    sl = price + stop_dist
                    tp = price - stop_dist * self.take_profit_r

                entry = next_open * (1 + self.slippage if sig['direction']=='long' else 1 - self.slippage)
                risk_amt = capital * self.risk_per_trade
                size = risk_amt / stop_dist
                fee = entry * size * self.commission
                capital -= fee
                position = {
                    'direction': sig['direction'],
                    'entry': entry, 'sl': sl, 'tp': tp,
                    'size': size, 'open_bar': i
                }
                continue

            if position:
                p = position
                is_long = p['direction'] == 'long'
                closed = False
                exit_price = price

                # 止损
                if is_long and lows[i] <= p['sl']:
                    exit_price = p['sl']; closed = True
                if not is_long and highs[i] >= p['sl']:
                    exit_price = p['sl']; closed = True
                # 止盈
                if not closed and is_long and highs[i] >= p['tp']:
                    exit_price = p['tp']; closed = True
                if not closed and not is_long and lows[i] <= p['tp']:
                    exit_price = p['tp']; closed = True

                if closed:
                    pnl = (exit_price - p['entry']) * p['size'] if is_long else (p['entry'] - exit_price) * p['size']
                    fee = exit_price * p['size'] * self.commission
                    net = pnl - fee
                    capital += net
                    trades.append({
                        'dir': p['direction'], 'entry': p['entry'],
                        'exit': exit_price, 'pnl': round(net, 4),
                        'won': net > 0, 'bars': i - p['open_bar']
                    })
                    position = None

        return self._stats(trades, capital, label)

    def _stats(self, trades, final_capital, label):
        if not trades:
            return {"label": label, "trades": 0, "note": "无成交"}
        wins = [t for t in trades if t['won']]
        losses = [t for t in trades if not t['won']]
        win_rate = len(wins) / len(trades)
        gross_profit = sum(t['pnl'] for t in wins)
        gross_loss = abs(sum(t['pnl'] for t in losses))
        pf = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        avg_win = gross_profit / len(wins) if wins else 0
        avg_loss = gross_loss / len(losses) if losses else 0
        rr = avg_win / avg_loss if avg_loss > 0 else 0

        # 最大回撤
        cum = self.capital
        peak = cum
        max_dd = 0
        for t in trades:
            cum += t['pnl']
            if cum > peak: peak = cum
            dd = (peak - cum) / peak
            if dd > max_dd: max_dd = dd

        return {
            "label": label,
            "trades": len(trades),
            "win_rate": f"{win_rate:.1%}",
            "profit_factor": round(pf, 2),
            "rr_ratio": round(rr, 2),
            "total_pnl": round(final_capital - self.capital, 4),
            "final_capital": round(final_capital, 2),
            "return_pct": f"{(final_capital/self.capital-1)*100:.2f}%",
            "max_drawdown": f"{max_dd:.2%}",
            "avg_win": round(avg_win, 4),
            "avg_loss": round(avg_loss, 4),
        }


def run_backtest(symbol="BTC", interval="4h", limit=300):
    print(f"📊 回测: {symbol}USDT {interval} 最近{limit}根K线")
    klines = fetch(f"{BASE}/api/v3/klines?symbol={symbol}USDT&interval={interval}&limit={limit}")
    closes = [float(k[4]) for k in klines]
    highs  = [float(k[2]) for k in klines]
    lows   = [float(k[3]) for k in klines]

    bt = Backtest({"capital": 250, "stop_loss_pct": 0.02, "take_profit_r": 1.5})
    result = bt.run(closes, highs, lows, label=f"{symbol} {interval}")

    for k, v in result.items():
        print(f"  {k:18}: {v}")
    return result


if __name__ == "__main__":
    print("=" * 60)
    print("🔬 回测框架测试")
    print("=" * 60)
    for sym, tf in [("BTC","4h"), ("ETH","4h"), ("SOL","1h")]:
        print()
        run_backtest(sym, tf, 300)
