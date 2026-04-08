#!/bin/bash
# 精确编辑脚本 - 不破坏文件结构

FILE="/root/.openclaw/workspace/scripts_from_libai/autonomous-five-layer-v7-2.js"
BACKUP="${FILE}.precise-backup-$(date +%s)"
cp "$FILE" "$BACKUP"
echo "✅ 备份: $BACKUP"

# ========== 修改1: 添加 SkillLoader require ==========
# 在 "const { TradingExecutor } = require('./trading-system/trading-executor');" 行后添加
sed -i "/const { TradingExecutor } = require('.\/trading-system\/trading-executor');/a const { SkillLoader } = require('./skill-loader');" "$FILE"
echo "✅ 1. 添加 SkillLoader require"

# ========== 修改2: 添加 this.skillLoader 属性 ==========
# 在 "this.tradingSystem = null;" 行后添加
sed -i "/this.tradingSystem = null;/a \    this.skillLoader = null; // 动态技能加载器" "$FILE"
echo "✅ 2. 添加 skillLoader 属性"

# ========== 修改3: 替换 integrateSkills 方法 ==========
# 创建临时文件
TMP=$(mktemp)
awk '
/^  async integrateSkills\(\) {$/ {
  print "  async integrateSkills() {"
  print "    console.log('"'"'\\n🔄 集成动态技能系统...'"'"');"
  print "    try {"
  print "      this.skillLoader = new SkillLoader(this, '"'"'./scripts_from_libai/skills'"'"');"
  print "      const loadedSkills = await this.skillLoader.loadAllSkills();"
  print "      for (const [name, instance] of loadedSkills) {"
  print "        this.skills[name] = instance;"
  print "      }"
  print "      const stats = this.skillLoader.getStats();"
  print "      console.log(`✅ 动态技能系统已启用 (加载 ${"`"}{stats.loaded}${"`"}/${"`"}{stats.total}${"`"} 个技能)`);"
  print "    } catch (err) {"
  print "      console.error('[技能集成] 失败:', err.message);"
  print "    }"
  print "  }"
  skip=1
  next
}
skip && /^  }$/ { skip=0; next } # 跳过原来的方法体结束大括号
{ print }
' "$BACKUP" > "$TMP" && mv "$TMP" "$FILE"

echo "✅ 3. 替换 integrateSkills() 方法"

# ========== 验证 ==========
echo "🔍 进行语法检查..."
if node -c "$FILE" 2>/dev/null; then
  echo "✅ 语法检查通过"
  echo ""
  echo "🔍 验证修改结果..."
  echo "  SkillLoader 出现次数: $(grep -c 'SkillLoader' $FILE)"
  echo "  skillLoader 出现次数: $(grep -c 'skillLoader' $FILE)"
  echo "  动态技能集成已启用 ✓"
else
  echo "❌ 语法错误，恢复备份"
  cp "$BACKUP" "$FILE"
  exit 1
fi

echo ""
echo "✅ 所有修改完成！系统将加载 ./scripts_from_libai/skills 目录下的所有技能。"
