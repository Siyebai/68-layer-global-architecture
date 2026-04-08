"""
贝叶斯参数优化器 V2.0
融合自 libai-funding-rate/scripts/bayesian_optimizer.py（Q李白出品）
相比遗传算法：采样效率更高，收敛更快，过拟合风险更低
"""
import math, random, json
from datetime import datetime

class BayesianOptimizer:
    """
    高斯过程贝叶斯优化（纯标准库实现）
    参数空间搜索 + 期望改善(EI)采集函数
    """
    def __init__(self, param_bounds, n_initial=8):
        self.param_bounds = param_bounds  # {'param': (min, max)}
        self.n_initial = n_initial
        self.X = []   # 已观察参数组
        self.y = []   # 对应适应度分数
        self.best_params = None
        self.best_score = -float('inf')
        self.history = []
    
    def _random_params(self):
        return {k: random.uniform(lo, hi) for k, (lo, hi) in self.param_bounds.items()}
    
    def _normalize(self, x):
        keys = list(self.param_bounds.keys())
        return [(x[k] - self.param_bounds[k][0]) / 
                (self.param_bounds[k][1] - self.param_bounds[k][0])
                for k in keys]
    
    def _rbf_kernel(self, x1, x2, length=0.5):
        dist = sum((a-b)**2 for a,b in zip(x1,x2))
        return math.exp(-dist/(2*length**2))
    
    def _gp_predict(self, x_new):
        """简化高斯过程预测 → 均值和标准差"""
        if not self.X: return 0, 1
        xn = self._normalize(x_new)
        xs = [self._normalize(xi) for xi in self.X]
        
        K = [[self._rbf_kernel(xs[i],xs[j]) for j in range(len(xs))]
             for i in range(len(xs))]
        k_star = [self._rbf_kernel(xn, xi) for xi in xs]
        
        # 加正则化
        noise = 1e-4
        for i in range(len(K)): K[i][i] += noise
        
        # 解 K*alpha = y
        n = len(K)
        aug = [K[i][:] + [self.y[i]] for i in range(n)]
        for col in range(n):
            pivot = max(range(col,n), key=lambda r: abs(aug[r][col]))
            aug[col], aug[pivot] = aug[pivot], aug[col]
            if abs(aug[col][col]) < 1e-10: continue
            for row in range(n):
                if row != col:
                    factor = aug[row][col]/aug[col][col]
                    aug[row] = [aug[row][j]-factor*aug[col][j] for j in range(n+1)]
        alpha = [aug[i][n]/aug[i][i] if abs(aug[i][i])>1e-10 else 0 for i in range(n)]
        
        mean = sum(k_star[i]*alpha[i] for i in range(n))
        var = max(0, 1 - sum(k_star[i]**2 for i in range(n)))
        return mean, math.sqrt(var)
    
    def _ei(self, x, exploration=0.05):
        """期望改善(EI)采集函数"""
        mean, std = self._gp_predict(x)
        if std < 1e-8: return 0
        z = (mean - self.best_score - exploration) / std
        # 标准正态CDF近似
        cdf = 0.5*(1+math.erf(z/math.sqrt(2)))
        pdf = math.exp(-z**2/2)/math.sqrt(2*math.pi)
        return (mean - self.best_score - exploration)*cdf + std*pdf
    
    def suggest(self):
        if len(self.X) < self.n_initial:
            return self._random_params()
        
        # 随机采样候选，选EI最高的
        candidates = [self._random_params() for _ in range(200)]
        best_cand = max(candidates, key=lambda c: self._ei(c))
        return best_cand
    
    def observe(self, params, score):
        self.X.append(params)
        self.y.append(score)
        if score > self.best_score:
            self.best_score = score
            self.best_params = params.copy()
        self.history.append({'params': params, 'score': round(score,4), 'ts': datetime.now().isoformat()[:19]})
    
    def run(self, fitness_fn, n_iter=25, verbose=True):
        if verbose:
            print(f"🔬 贝叶斯优化器启动: {n_iter}轮, {len(self.param_bounds)}维参数空间")
        
        for i in range(n_iter):
            params = self.suggest()
            score = fitness_fn(params)
            self.observe(params, score)
            if verbose and (i+1) % 5 == 0:
                print(f"  第{i+1:3d}轮: score={score:.4f}  best={self.best_score:.4f}")
        
        if verbose:
            print(f"\n✅ 最优参数 (score={self.best_score:.4f}):")
            for k,v in self.best_params.items():
                print(f"  {k}: {v:.4f}")
        
        return self.best_params, self.best_score


if __name__ == "__main__":
    import urllib.request

    def fetch(url):
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                return json.loads(r.read())
        except: return None

    def get_closes(sym, interval='4h', limit=100):
        k = fetch(f"https://api.binance.com/api/v3/klines?symbol={sym}USDT&interval={interval}&limit={limit}")
        return [float(x[4]) for x in k] if k else []

    def rsi(c, n=14):
        g=[max(c[i]-c[i-1],0) for i in range(1,len(c))]
        l=[max(c[i-1]-c[i],0) for i in range(1,len(c))]
        ag=sum(g[-n:])/n; al=sum(l[-n:])/n
        return 100-(100/(1+ag/al)) if al else 100

    closes = get_closes('BTC', '4h', 150)
    if not closes:
        print("无法获取数据"); exit()

    def fitness(params):
        rsi_lo = params['rsi_oversold']
        rsi_hi = params['rsi_overbought']
        sl = params['stop_loss_pct']
        tp_r = params['take_profit_r']
        
        wins = losses = 0
        for i in range(20, len(closes)-5):
            c = closes[:i+1]
            r = rsi(c)
            if r < rsi_lo:
                entry = closes[i]
                stop = entry*(1-sl)
                tp = entry*(1+sl*tp_r)
                future = closes[i+1:i+6]
                if any(p >= tp for p in future): wins += 1
                elif any(p <= stop for p in future): losses += 1
        
        total = wins + losses
        if total < 5: return 0
        win_rate = wins/total
        pf = (wins*sl*tp_r)/(losses*sl) if losses>0 else wins
        return win_rate*0.5 + min(pf,5)*0.1

    bounds = {
        'rsi_oversold': (25, 50),
        'rsi_overbought': (50, 75),
        'stop_loss_pct': (0.01, 0.05),
        'take_profit_r': (1.0, 3.0)
    }
    
    opt = BayesianOptimizer(bounds, n_initial=8)
    best_params, best_score = opt.run(fitness, n_iter=30, verbose=True)
    
    # 保存
    result = {'bayesian_best': best_params, 'score': best_score,
              'ts': datetime.now().isoformat()[:19], 'source': 'libai-funding-rate'}
    with open('data/bayesian_params.json', 'w') as f:
        json.dump(result, f, indent=2)
    print(f"\n💾 已保存到 data/bayesian_params.json")
