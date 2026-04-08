#!/bin/bash
# 系统全面优化脚本
# 用于提升响应速度和流畅度

echo "=== 开始系统优化 ==="
date

# 1. 调整系统内核参数优化网络
echo "1. 优化系统内核网络参数..."
cat > /etc/sysctl.d/99-libai-optimization.conf << 'SYSCTL'
# 网络性能优化
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_tw_recycle = 0  # 安全考虑设为0
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15

# 内存和文件描述符优化
fs.file-max = 2097152
fs.nr_open = 1048576

# 虚拟内存优化
vm.swappiness = 10
vm.dirty_ratio = 40
vm.dirty_background_ratio = 10
vm.vfs_cache_pressure = 50

# 防止TIME_WAIT套接字占用
net.ipv4.tcp_max_tw_buckets = 400000
net.ipv4.tcp_fastopen = 3
SYSCTL

# 应用内核参数
sysctl -p /etc/sysctl.d/99-libai-optimization.conf 2>/dev/null || echo "需要root权限应用sysctl配置"

# 2. 调整进程限制
echo "2. 优化进程资源限制..."
cat > /etc/security/limits.d/99-libai.conf << 'LIMITS'
* soft nofile 1048576
* hard nofile 1048576
* soft nproc 1048576
* hard nproc 1048576
root soft nofile 1048576
root hard nofile 1048576
LIMITS

# 3. 优化Node.js应用性能
echo "3. 应用Node.js优化配置..."
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size --no-warnings"

# 4. 清理并重建Redis配置
echo "4. 更新Redis连接配置..."
if [ -f "/etc/redis/redis.conf" ]; then
  cp /etc/redis/redis.conf /etc/redis/redis.conf.backup
  sed -i 's/^maxclients.*/maxclients 10000/' /etc/redis/redis.conf 2>/dev/null
  sed -i 's/^tcp-keepalive.*/tcp-keepalive 60/' /etc/redis/redis.conf 2>/dev/null
  systemctl restart redis-server 2>/dev/null || service redis-server restart 2>/dev/null || echo "Redis服务重启需要手动执行"
fi

# 5. 清理系统缓存
echo "5. 清理系统缓存..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || echo "需要root权限清理系统缓存"

# 6. 优化磁盘I/O调度器
echo "6. 检查并优化I/O调度器..."
for disk in /sys/block/sd*; do
  if [ -e "$disk/queue/scheduler" ]; then
    echo "none" > "$disk/queue/scheduler" 2>/dev/null || echo "使用deadline调度器"
  fi
done

# 7. 检查并优化TCP BBR拥塞控制
echo "7. 启用TCP BBR拥塞控制..."
echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf 2>/dev/null
echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf 2>/dev/null
sysctl -p 2>/dev/null

echo ""
echo "=== 系统优化完成 ==="
date
echo ""
echo "注意事项:"
echo "1. 部分优化需要重启系统才能完全生效"
echo "2. Redis配置已备份并更新，建议重启Redis服务"
echo "3. 请检查优化效果: curl http://localhost:3000/health"
echo ""
