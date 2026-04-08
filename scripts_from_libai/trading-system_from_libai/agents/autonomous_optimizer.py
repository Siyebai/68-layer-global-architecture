"""
自主学习优化器 — 融合仓库 genetic-optimizer.js + auto-learning.js + adaptive agent
遗传算法优化信号参数 + 在线自适应调参
"""
import random, math, json
from datetime import datetime

class Individual:
    """染色体个体 (对标仓库 genetic-optimizer.js Individual类)"""
    def __init__(self, chromosome, fitness=float('-inf')):
        self.chromosome = list(chromosome)
        self.fitness = fitness

    def clone(self):
        return Individual(list(self.chromosome), self.fitness)


class GeneticOptimizer:
    """
    遗传算法优化器 — 完整移植仓库 genetic-optimizer.js
    用于优化信号参数: RSI阈值、MACD周期、BB标准差、止损比例等
    """
    def __init__(self, gene_ranges, population_size=30, generations=50,
                 mutation_rate=0.1, crossover_rate=0.8, elitism=3):
        self.gene_ranges = gene_ranges   # [[min, max], ...]
        self.pop_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.elitism = elitism
        self.history = []

    def random_chromosome(self):
        return [r[0] + random.random() * (r[1] - r[0]) for r in self.gene_ranges]

    def init_population(self):
        return [Individual(self.random_chromosome()) for _ in range(self.pop_size)]

    def select_parents(self, population):
        """轮盘赌选择"""
        min_f = min(p.fitness for p in population)
        adjusted = [p.fitness - min_f + 1e-9 for p in population]
        total = sum(adjusted)
        def pick():
            r = random.random() * total
            for i, p in enumerate(population):
                r -= adjusted[i]
                if r <= 0: return p
            return population[-1]
        return pick(), pick()

    def crossover(self, p1, p2):
        """两点交叉"""
        if random.random() > self.crossover_rate:
            return p1.clone(), p2.clone()
        n = len(p1.chromosome)
        a, b = sorted(random.sample(range(n), 2))
        c1 = p1.chromosome[:a] + p2.chromosome[a:b] + p1.chromosome[b:]
        c2 = p2.chromosome[:a] + p1.chromosome[a:b] + p2.chromosome[b:]
        return Individual(c1), Individual(c2)

    def mutate(self, ind):
        """多项式变异"""
        chrom = list(ind.chromosome)
        for i, (lo, hi) in enumerate(self.gene_ranges):
            if random.random() < self.mutation_rate:
                delta = random.gauss(0, (hi - lo) * 0.1)
                chrom[i] = max(lo, min(hi, chrom[i] + delta))
        return Individual(chrom)

    def evolve(self, fitness_fn, verbose=False):
        """运行遗传算法"""
        pop = self.init_population()
        best = None

        for gen in range(self.generations):
            # 评估适应度
            for ind in pop:
                ind.fitness = fitness_fn(ind.chromosome)

            pop.sort(key=lambda x: x.fitness, reverse=True)
            if best is None or pop[0].fitness > best.fitness:
                best = pop[0].clone()

            self.history.append({
                "gen": gen, "best": round(best.fitness, 6),
                "avg": round(sum(p.fitness for p in pop) / len(pop), 6)
            })

            if verbose and gen % 10 == 0:
                print(f"  Gen {gen:3d} | best={best.fitness:.4f} | avg={self.history[-1]['avg']:.4f}")

            # 精英保留 + 新一代
            new_pop = pop[:self.elitism]
            while len(new_pop) < self.pop_size:
                p1, p2 = self.select_parents(pop)
                c1, c2 = self.crossover(p1, p2)
                new_pop.append(self.mutate(c1))
                if len(new_pop) < self.pop_size:
                    new_pop.append(self.mutate(c2))
            pop = new_pop

        return best.chromosome, best.fitness


class AdaptiveParamManager:
    """
    在线自适应参数管理 — 对标仓库 multi-agent-deep-v4.md 自适应学习机制
    每N笔交易后自动调整参数
    """
    def __init__(self, params=None):
        self.params = params or {
            "rsi_oversold": 40,     # RSI超卖阈值
            "rsi_overbought": 60,   # RSI超买阈值
            "min_strength": 0.6,    # 最低信号强度
            "stop_loss_pct": 0.02,  # 止损比例
            "take_profit_r": 1.5,   # 止盈倍数
        }
        self.trade_history = []
        self.adjust_every = 20      # 每20笔调整一次
        self.change_limit = 0.10    # 每次最大变化10%

    def record_trade(self, pnl, risk, signal_strength):
        self.trade_history.append({
            "pnl": pnl, "risk": risk,
            "strength": signal_strength,
            "ts": datetime.now().isoformat()
        })
        if len(self.trade_history) % self.adjust_every == 0:
            self._adapt()

    def _adapt(self):
        """根据最近表现自适应调整参数"""
        recent = self.trade_history[-self.adjust_every:]
        wins = [t for t in recent if t['pnl'] > 0]
        losses = [t for t in recent if t['pnl'] <= 0]
        win_rate = len(wins) / len(recent)
        avg_pnl = sum(t['pnl'] for t in recent) / len(recent)

        adjustments = []
        # 胜率低 → 提高信号强度要求
        if win_rate < 0.45:
            old = self.params['min_strength']
            self.params['min_strength'] = min(0.9, old * (1 + self.change_limit))
            adjustments.append(f"min_strength: {old:.2f}→{self.params['min_strength']:.2f}")

        # 胜率高但收益低 → 放宽止盈
        elif win_rate > 0.60 and avg_pnl < 0.005:
            old = self.params['take_profit_r']
            self.params['take_profit_r'] = min(3.0, old * (1 + self.change_limit))
            adjustments.append(f"take_profit_r: {old:.2f}→{self.params['take_profit_r']:.2f}")

        if adjustments:
            print(f"[AdaptiveParam] 参数自动调整: {', '.join(adjustments)}")
        return adjustments

    def get_params(self):
        return dict(self.params)


def demo_optimize():
    """演示遗传算法优化信号参数"""
    print("=" * 60)
    print("🧬 遗传算法参数优化演示")
    print("=" * 60)

    # 参数空间: [RSI超卖阈值, RSI超买阈值, 最低强度, 止损%, 止盈R]
    gene_ranges = [
        [25, 45],   # rsi_oversold
        [55, 75],   # rsi_overbought
        [0.5, 0.9], # min_strength
        [0.01, 0.04], # stop_loss_pct
        [1.2, 3.0], # take_profit_r
    ]

    def mock_fitness(chromosome):
        """模拟适应度函数 (实际使用回测结果)"""
        rsi_low, rsi_high, strength, sl, tp = chromosome
        # 简化评分: 合理区间得分高
        score = 0
        if 30 <= rsi_low <= 40: score += 0.3
        if 60 <= rsi_high <= 70: score += 0.3
        if 0.6 <= strength <= 0.8: score += 0.2
        if sl <= 0.025: score += 0.1
        score += (tp / 3.0) * 0.1
        return score + random.gauss(0, 0.02)

    optimizer = GeneticOptimizer(gene_ranges, population_size=20, generations=30)
    best_chrom, best_fitness = optimizer.evolve(mock_fitness, verbose=True)

    names = ["RSI超卖", "RSI超买", "最低强度", "止损%", "止盈R"]
    print(f"\n最优参数 (适应度={best_fitness:.4f}):")
    for name, val in zip(names, best_chrom):
        print(f"  {name:8}: {val:.4f}")
    print("\n💡 实际使用时，将回测胜率/盈亏比作为适应度函数")


if __name__ == "__main__":
    demo_optimize()
    print("\n" + "="*60)
    print("🔄 自适应参数管理器演示")
    apm = AdaptiveParamManager()
    print(f"初始参数: {apm.get_params()}")
    # 模拟20笔低胜率交易
    for i in range(20):
        pnl = -0.001 if i % 3 != 0 else 0.003
        apm.record_trade(pnl, 0.001, 0.65)
    print(f"调整后参数: {apm.get_params()}")
