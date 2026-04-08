#!/usr/bin/env node
/**
 * 自动补丁脚本 - 为 autonomous-five-layer-v7-2.js 添加动态技能加载（修复版）
 */

const fs = require('fs');
const path = require('path');

const targetFile = '/root/.openclaw/workspace/scripts_from_libai/autonomous-five-layer-v7-2.js';

console.log('🔧 正在修改主系统以集成动态技能加载器...\n');

// 读取原文件
let content = fs.readFileSync(targetFile, 'utf8');

// 备份
const backupFile = targetFile + `.dynamic-skill-loading-${Date.now()}.bak`;
fs.writeFileSync(backupFile, content);
console.log(`✅ 备份已保存: ${backupFile}`);

// 1. 在顶部 require 语句中添加 SkillLoader（在 TradingExecutor 之后）
const requireInsert = "const { SkillLoader } = require('./skill-loader');\n";
const afterTradingExecutor = content.indexOf("const { TradingExecutor } = require('./trading-system/trading-executor');");
if (afterTradingExecutor !== -1) {
  const insertPos = content.indexOf('\n', afterTradingExecutor);
  if (insertPos !== -1) {
    content = content.slice(0, insertPos) + requireInsert + content.slice(insertPos);
    console.log('✅ 1. 添加 SkillLoader require');
  }
}

// 2. 在 constructor 中添加 skillLoader 属性（在 tradingSystem = null 之后）
const tradingSystemNull = "this.tradingSystem = null;";
const tradingSystemPos = content.indexOf(tradingSystemNull);
if (tradingSystemPos !== -1) {
  const afterPos = tradingSystemPos + tradingSystemNull.length;
  const insertion = "\n    this.skillLoader = null; // 动态技能加载器";
  content = content.slice(0, afterPos) + insertion + content.slice(afterPos);
  console.log('✅ 2. 添加 skillLoader 属性');
}

// 3. 替换 integrateSkills() 方法
const integrateSkillsStart = content.indexOf('async integrateSkills() {');
if (integrateSkillsStart !== -1) {
  const methodBodyStart = content.indexOf('{', integrateSkillsStart) + 1;
  // 找到方法结束的大括号
  let braceCount = 1;
  let methodBodyEnd = methodBodyStart;
  while (braceCount > 0 && methodBodyEnd < content.length) {
    if (content[methodBodyEnd] === '{') braceCount++;
    if (content[methodBodyEnd] === '}') braceCount--;
    methodBodyEnd++;
  }
  
  // 新的方法体
  const newMethodBody = `
    console.log('\\n🔄 集成动态技能系统...');
    try {
      // 初始化技能加载器
      this.skillLoader = new SkillLoader(this, './skills');
      
      // 扫描并加载所有技能
      const loadedSkills = await this.skillLoader.loadAllSkills();
      
      // 将加载的技能合并到 this.skills
      for (const [name, instance] of loadedSkills) {
        this.skills[name] = instance;
      }
      
      const stats = this.skillLoader.getStats();
      console.log(\`✅ 动态技能系统已启用 (加载 \${stats.loaded}/\${stats.total} 个技能)\`);
    } catch (err) {
      console.error('[技能集成] 失败:', err.message);
    }
  `;
  
  content = content.slice(0, methodBodyStart) + newMethodBody + content.slice(methodBodyEnd);
  console.log('✅ 3. 替换 integrateSkills() 为动态加载');
}

// 4. 更新 stats.skillsIntegrated 为动态计算
const skillsIntegratedLine = "      skillsIntegrated: this.stats.skillsIntegrated,";
const newSkillsLine = "      skillsIntegrated: this.skillLoader ? this.skillLoader.getStats().loaded : 0,";
content = content.split('\n').map(line => 
  line.includes('skillsIntegrated:') && line.includes('this.stats.skillsIntegrated') 
    ? newSkillsLine 
    : line
).join('\n');
console.log('✅ 4. 更新技能计数为动态值');

// 5. 添加辅助方法（在 integrateTradingSystem 之后）
const integrateTradingSystemEnd = content.lastIndexOf('console.log(', content.lastIndexOf('integrateTradingSystem'));
if (integrateTradingSystemEnd !== -1) {
  const nextLinePos = content.indexOf('\n', integrateTradingSystemEnd);
  if (nextLinePos !== -1) {
    const additionalMethods = `

  /**
   * 获取技能加载状态报告
   */
  getSkillStatus() {
    if (!this.skillLoader) return { loaded: false, count: 0 };
    
    const stats = this.skillLoader.getStats();
    const skills = this.skillLoader.listSkills();
    
    return {
      loaded: true,
      totalScanned: stats.total,
      totalLoaded: stats.loaded,
      totalFailed: stats.failed,
      totalSkipped: stats.skipped,
      skills: skills,
      hasGetStatus: Array.from(this.skills.values()).some(s => typeof s.getStatus === 'function')
    };
  }

  /**
   * 调用技能方法（统一入口）
   */
  async callSkill(skillName, method, ...args) {
    if (!this.skillLoader) {
      throw new Error('Skill loader not initialized');
    }
    return await this.skillLoader.callSkill(skillName, method, ...args);
  }`;
    content = content.slice(0, nextLinePos) + additionalMethods + content.slice(nextLinePos);
    console.log('✅ 5. 添加技能状态报告和调用方法');
  }
}

// 写回文件
fs.writeFileSync(targetFile, content);
console.log('\n✅ 修改完成！');
console.log(`📝 文件已更新: ${targetFile}\n`);

// 验证
console.log('🔍 验证修改...');
const newContent = fs.readFileSync(targetFile, 'utf8');
const skillLoaderCount = (newContent.match(/SkillLoader/g) || []).length;
const getSkillStatusCount = (newContent.match(/getSkillStatus/g) || []).length;
console.log(`  SkillLoader 引用: ${skillLoaderCount}`);
console.log(`  getSkillStatus 方法: ${getSkillStatusCount}`);
console.log('\n✅ 所有修改已应用。系统现在将动态加载所有技能！');
