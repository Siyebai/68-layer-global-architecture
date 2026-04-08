#!/usr/bin/env node
/**
 * 自动补丁脚本 - 为 autonomous-five-layer-v7-2.js 添加动态技能加载
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

// 1. 在顶部 require 语句中添加 SkillLoader
const requireInsert = "const { SkillLoader } = require('./skill-loader');\n";
const afterTradingExecutor = content.indexOf("const { TradingExecutor } = require('./trading-system/trading-executor');");
if (afterTradingExecutor !== -1) {
  const insertPos = content.indexOf('\n', afterTradingExecutor) + 1;
  content = content.slice(0, insertPos) + requireInsert + content.slice(insertPos);
  console.log('✅ 1. 添加 SkillLoader require');
}

// 2. 在 constructor 中添加 skillLoader 属性
const constructorEnd = content.indexOf('this.tradingSystem = null;') + 'this.tradingSystem = null;'.length;
if (constructorEnd !== -1) {
  const insertion = "\n    this.skillLoader = null; // 动态技能加载器";
  content = content.slice(0, constructorEnd) + insertion + content.slice(constructorEnd);
  console.log('✅ 2. 添加 skillLoader 属性');
}

// 3. 修改 integrateSkills() 方法为动态加载
const integrateSkillsStart = content.indexOf('async integrateSkills() {');
const integrateSkillsEnd = content.indexOf('}', content.indexOf('this.skills = {}')); // 简单定位

if (integrateSkillsStart !== -1) {
  // 找到方法体开始
  const methodBodyStart = content.indexOf('{', integrateSkillsStart) + 1;
  const methodBodyEnd = content.indexOf('console.log', methodBodyStart);
  
  // 替换为新的动态加载逻辑
  const newMethodBody = `
    console.log('\n🔄 集成动态技能系统...');
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
  
  // 找到方法结束位置
  const methodEnd = content.indexOf('}', methodBodyStart);
  content = content.slice(0, methodBodyStart) + newMethodBody + content.slice(methodEnd);
  console.log('✅ 3. 替换 integrateSkills() 为动态加载');
}

// 4. 更新 stats.skillsIntegrated 计数为动态值
const skillsIntegratedPattern = /skillsIntegrated: \d+/g;
content = content.replace(skillsIntegratedPattern, 'skillsIntegrated: this.skillLoader ? this.skillLoader.getStats().loaded : 0');
console.log('✅ 4. 更新技能计数为动态值');

// 5. 添加技能状态报告方法（可选增强）
const afterIntegrateV35 = content.lastIndexOf('}') > content.lastIndexOf('console.log') ? content.lastIndexOf('}') : content.lastIndexOf('console.log');
if (afterIntegrateV35 !== -1) {
  const newMethod = `

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
  
  content = content.slice(0, afterIntegrateV35) + newMethod + content.slice(afterIntegrateV35);
  console.log('✅ 5. 添加技能状态报告和调用方法');
}

// 写回修改后的文件
fs.writeFileSync(targetFile, content);
console.log('\n✅ 修改完成！');
console.log(`📝 文件已更新: ${targetFile}\n`);

// 验证修改
console.log('🔍 验证修改...');
const newContent = fs.readFileSync(targetFile, 'utf8');
const skillLoaderCount = (newContent.match(/SkillLoader/g) || []).length;
const getSkillStatusCount = (newContent.match(/getSkillStatus/g) || []).length;
console.log(`  SkillLoader 引用: ${skillLoaderCount}`);
console.log(`  getSkillStatus 方法: ${getSkillStatusCount}`);
console.log('\n✅ 所有修改已应用。系统现在将动态加载所有技能！');
