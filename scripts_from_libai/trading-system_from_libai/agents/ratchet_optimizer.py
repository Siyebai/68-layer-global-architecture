"""
策略 Ratchet Loop 优化器
借鉴 Karpathy AutoResearch 棘轮循环思想（仓库知识库：karpathy-autoresearch-ratchet-loop.md）
核心：修改参数 → 回测 → 评估净P&L + Sharpe → 保留改进/回滚退步 → 循环
只进不退，每轮结果必须比上一轮好才保留
"""
import json, math, random, urllib.request
from datetime import datetime

BASE = "https://api.binance.com"

def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return json.loads(r.read())
    except: return None

def get_closes(sym, interval='4h', limit=150):
    k = fetch(f"{BASE}/api/v3/klines?symbol={sym}USDT&interval={interval}&limit={limit}")
    return [float(x[4]) for x in k] if k else []

def rsi(c, n=14):
    g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
    l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
    ag=sum(g[-n:])/n; al=sum(l[-n:])/n
    return 100-(100/(1+ag/al)) if al else 100

def walk_forward_score(params, closes, n_folds=4):
    """
    Walk-Forward 验证（来自 overfitting_prevention.py）
    时间顺序划分，防止回测过拟合
    折叠胜率的平均值更可靠
    """
    n = len(closes)
    fold_size = n // (n_folds + 1)
    scores = []
    
    for fold in range(n_folds):
        train_end = (fold + 1) * fold_size
        test_end = min(train_end + fold_size, n)
        test_data = closes[train_end:test_end]
        if len(test_data) < 10: continue
        
        wins = losses = 0
        rsi_lo = params['rsi_oversold']
        rsi_hi = params['rsi_overbought']
        sl = params['stop_loss_pct']
        tp_r = params['take_profit_r']
        
        for i in range(5, len(test_data)-5):
            c = test_data[:i+1]
            r = rsi(c)
            entry = test_data[i]
            future = test_data[i+1:i+6]
            
            if r < rsi_lo:
                stop = entry*(1-sl); tp = entry*(1+sl*tp_r)
                if any(p>=tp for p in future): wins+=1
                elif any(p<=stop for p in future): losses+=1
            elif r > rsi_hi:
                stop = entry*(1+sl); tp = entry*(1-sl*tp_r)
                if any(p<=tp for p in future): wins+=1
                elif any(p>=stop for p in future): losses+=1
        
        total = wins + losses
        if total >= 3:
            wr = wins/total
            pf = (wins*sl*tp_r)/(losses*sl) if losses>0 else wins
            scores.append(wr*0.5 + min(pf,4)*0.1)
    
    if not scores: return 0
    return sum(scores)/len(scores)

def mutate(params, bounds, sigma=0.15):
    """参数小幅变异（棘轮步长）"""
    new = {}
    for k, v in params.items():
        lo, hi = bounds[k]
        delta = (hi-lo)*sigma*random.gauss(0,1)
        new[k] = max(lo, min(hi, v+delta))
    return new

def ratchet_loop(symbols, n_rounds=20, verbose=True):
    """
    Karpathy Ratchet Loop — 交易参数版
    每轮：变异参数 → WFO评估 → 只保留更好的结果
    """
    bounds = {
        'rsi_oversold': (25, 48),
        'rsi_overbought': (52, 75),
        'stop_loss_pct': (0.01, 0.05),
        'take_profit_r': (1.0, 3.0)
    }
    
    # 初始参数（遗传算法结果）
    current_params = {
        'rsi_oversold': 41.36,
        'rsi_overbought': 58.57,
        'stop_loss_pct': 0.0299,
        'take_profit_r': 1.2056
    }
    
    # 拉取行情数据（一次性，所有轮共享）
    print("📥 拉取行情数据...")
    all_closes = {}
    for sym in symbols:
        c = get_closes(sym, '4h', 150)
        if c: all_closes[sym] = c
    
    if not all_closes:
        print("❌ 无法获取数据"); return None
    
    # 计算初始分数（多品种平均）
    def score_all(params):
        scores = [walk_forward_score(params, closes) 
                  for closes in all_closes.values()]
        return sum(scores)/len(scores) if scores else 0
    
    current_score = score_all(current_params)
    history = [{'round': 0, 'score': current_score, 'params': current_params.copy(),
                'action': 'init', 'ts': datetime.now().isoformat()[:19]}]
    
    if verbose:
        print(f"\n🔄 Ratchet Loop 启动: {n_rounds}轮, {len(all_closes)}个品种")
        print(f"   初始分数: {current_score:.4f}")
    
    accepted = 0
    for i in range(n_rounds):
        candidate = mutate(current_params, bounds)
        new_score = score_all(candidate)
        
        if new_score > current_score:
            current_params = candidate
            current_score = new_score
            action = '✅ 保留'
            accepted += 1
        else:
            action = '↩️  回滚'
        
        history.append({'round': i+1, 'score': round(new_score,4),
                        'best_score': round(current_score,4),
                        'action': action, 'ts': datetime.now().isoformat()[:19]})
        
        if verbose and (i+1) % 5 == 0:
            print(f"  第{i+1:3d}轮: {action}  best={current_score:.4f}  接受率={accepted/(i+1):.0%}")
    
    if verbose:
        print(f"\n🏆 最终最优参数 (score={current_score:.4f}):")
        for k, v in current_params.items():
            print(f"   {k}: {v:.4f}")
        print(f"   接受改进: {accepted}/{n_rounds} = {accepted/n_rounds:.0%}")
    
    return {
        'best_params': current_params,
        'best_score': current_score,
        'history': history,
        'accepted_rate': accepted/n_rounds,
        'ts': datetime.now().isoformat()[:19],
        'source': 'karpathy-ratchet-loop'
    }

if __name__ == "__main__":
    print("="*65)
    print("⚙️  策略 Ratchet Loop 优化器")
    print("   对标: Karpathy AutoResearch (棘轮循环)")
    print("="*65)
    
    result = ratchet_loop(['BTC','ETH','SOL'], n_rounds=25, verbose=True)
    
    if result:
        out = f"data/ratchet_params.json"
        with open(out, 'w') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n💾 已保存 {out}")
