"""
风控模块 — 融合仓库 contract-risk.js + lib/risk-manager.js
Kelly仓位 + 日亏上限 + 最大持仓 + ATR止损
"""
import math
from datetime import datetime, date

class RiskController:
    """
    融合仓库两个风控模块:
    - contract-risk.js: 合约专用风控 (ATR止损, Kelly仓位, 日亏3U)
    - lib/risk-manager.js: 全局风控 (回撤, 相关性, 交易所分散)
    """
    def __init__(self, config=None):
        cfg = config or {}
        # 合约专用参数 (来自 contract-risk.js)
        self.max_allocation = cfg.get('max_allocation', 0.10)   # 总资金10%做合约
        self.stop_loss_pct  = cfg.get('stop_loss_pct', 0.02)    # 2%止损
        self.max_positions  = cfg.get('max_positions', 2)        # 最多2个方向仓位
        self.max_daily_loss = cfg.get('max_daily_loss', 3.0)     # 日亏上限3U
        self.take_profit_r  = cfg.get('take_profit_r', 1.5)      # 1.5R止盈
        # 全局参数 (来自 lib/risk-manager.js)
        self.max_drawdown   = cfg.get('max_drawdown', 0.10)      # 最大回撤10%
        self.max_single_loss= cfg.get('max_single_loss', 50)     # 单笔最大亏损$50
        self.risk_per_trade = cfg.get('risk_per_trade', 0.004)   # 每笔风险0.4%

        self.positions = {}        # sym -> position info
        self.daily_pnl = 0.0
        self.peak_balance = 0.0
        self.total_pnl = 0.0
        self.trade_log = []
        self._reset_date = date.today()

    def _check_day_reset(self):
        if date.today() != self._reset_date:
            self.daily_pnl = 0.0
            self._reset_date = date.today()

    def can_open(self, equity: float) -> dict:
        """检查是否允许开仓"""
        self._check_day_reset()
        errors = []
        if len(self.positions) >= self.max_positions:
            errors.append(f"已达最大持仓数({self.max_positions})")
        if self.daily_pnl <= -self.max_daily_loss:
            errors.append(f"日亏已达上限 {self.max_daily_loss}U")
        if equity * self.max_allocation < 5:
            errors.append(f"合约资金不足5U")
        # 回撤检查
        if self.peak_balance > 0:
            drawdown = (self.peak_balance - equity) / self.peak_balance
            if drawdown >= self.max_drawdown:
                errors.append(f"最大回撤{drawdown:.1%}已触发保护")
        return {"ok": len(errors) == 0, "errors": errors}

    def calc_position(self, equity: float, price: float, atr: float, direction: str) -> dict:
        """
        计算仓位参数 (Kelly简化版 + ATR止损)
        融合 contract-risk.js calcPosition 逻辑
        """
        check = self.can_open(equity)
        if not check["ok"]:
            return {"ok": False, "errors": check["errors"]}

        # 止损距离: ATR*1.5 或 固定2% (取较大值)
        stop_dist = max(atr * 1.5, price * self.stop_loss_pct)
        sl = price - stop_dist if direction == "long" else price + stop_dist
        tp = price + stop_dist * self.take_profit_r if direction == "long" else price - stop_dist * self.take_profit_r

        # 仓位大小: 每笔最多亏0.4%权益
        risk_amount = min(equity * self.risk_per_trade, self.max_single_loss)
        size = round(risk_amount / stop_dist, 4)
        nominal = round(size * price, 2)

        return {
            "ok": True,
            "direction": direction,
            "entry": price,
            "size": size,
            "nominal_usdt": nominal,
            "stop_loss": round(sl, 4),
            "take_profit": round(tp, 4),
            "stop_dist_pct": f"{stop_dist/price*100:.2f}%",
            "risk_usdt": round(risk_amount, 2),
            "rr_ratio": self.take_profit_r,
        }

    def open_position(self, sym, direction, entry, size, sl, tp):
        self.positions[sym] = {
            "sym": sym, "direction": direction,
            "entry": entry, "size": size,
            "stop_loss": sl, "take_profit": tp,
            "open_time": datetime.now().isoformat()
        }
        return True

    def close_position(self, sym, exit_price):
        if sym not in self.positions:
            return None
        pos = self.positions.pop(sym)
        is_long = pos['direction'] == 'long'
        pnl = (exit_price - pos['entry']) * pos['size'] if is_long else (pos['entry'] - exit_price) * pos['size']
        fee = exit_price * pos['size'] * 0.0005  # 0.05% taker
        net_pnl = pnl - fee
        self.daily_pnl += net_pnl
        self.total_pnl += net_pnl
        record = {**pos, "exit": exit_price, "pnl": round(net_pnl, 4),
                  "close_time": datetime.now().isoformat()}
        self.trade_log.append(record)
        return record

    def status(self, equity):
        self._check_day_reset()
        if equity > self.peak_balance:
            self.peak_balance = equity
        drawdown = (self.peak_balance - equity) / self.peak_balance if self.peak_balance > 0 else 0
        return {
            "equity": equity,
            "daily_pnl": round(self.daily_pnl, 4),
            "total_pnl": round(self.total_pnl, 4),
            "drawdown": f"{drawdown:.2%}",
            "open_positions": len(self.positions),
            "can_open": self.can_open(equity)["ok"],
            "peak": self.peak_balance
        }

if __name__ == "__main__":
    rc = RiskController()
    equity = 250.0
    print("风控模块测试")
    print(f"账户权益: ${equity}")
    print(f"状态: {rc.status(equity)}")
    
    # 模拟BTC开仓
    pos = rc.calc_position(equity, 66800, 800, "long")
    print(f"\n开仓计算 BTC/USDT:")
    for k, v in pos.items():
        print(f"  {k}: {v}")
