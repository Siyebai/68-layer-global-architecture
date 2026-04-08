"""
市场数据共享缓存层 — 优化多模块重复 API 调用
TTL: K线60秒, 价格5秒, 资金费率30秒
"""
import urllib.request, json, time, threading

_cache = {}
_lock = threading.Lock()

def fetch(url, ttl=60):
    now = time.time()
    with _lock:
        if url in _cache and now - _cache[url]['ts'] < ttl:
            return _cache[url]['data']
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        with _lock:
            _cache[url] = {'data': data, 'ts': now}
        return data
    except:
        return None

def get_klines(symbol, interval='4h', limit=100):
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}USDT&interval={interval}&limit={limit}"
    return fetch(url, ttl=60)

def get_price(symbol):
    url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT"
    return fetch(url, ttl=5)

def get_funding_rates():
    url = "https://fapi.binance.com/fapi/v1/premiumIndex"
    return fetch(url, ttl=30)

def get_closes(symbol, interval='4h', limit=100):
    k = get_klines(symbol, interval, limit)
    return [float(x[4]) for x in k] if k else []

def cache_stats():
    with _lock:
        return {'entries': len(_cache), 'keys': list(_cache.keys())[:5]}

if __name__ == "__main__":
    import concurrent.futures
    print("测试并行拉取...")
    symbols = ['BTC','ETH','SOL','BNB','XRP']
    t0 = time.time()
    
    # 并行拉取
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(get_closes, s): s for s in symbols}
        results = {concurrent.futures.as_completed(futs)[f]: futs[f] for f in futs}
    
    t1 = time.time()
    print(f"并行: {t1-t0:.2f}s — {len(symbols)} 个品种")
    
    # 缓存命中测试
    t2 = time.time()
    for s in symbols: get_closes(s)
    t3 = time.time()
    print(f"缓存命中: {t3-t2:.4f}s (应接近0)")
    print(f"缓存状态: {cache_stats()}")
