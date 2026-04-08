#!/usr/bin/env node
/**
 * 动态技能加载器 - 增强版
 * 扫描 skills/ 目录并自动加载所有技能模块
 */

const fs = require('fs');
const path = require('path');

class SkillLoader {
  constructor(system, skillsDir = './skills') {
    this.system = system;
    this.skillsDir = path.resolve(skillsDir);
    this.loadedSkills = new Map();
    this.skillStats = {
      total: 0,
      loaded: 0,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * 扫描技能目录
   */
  scanSkills() {
    console.log('\n🔍 扫描技能目录:', this.skillsDir);
    
    if (!fs.existsSync(this.skillsDir)) {
      console.error('❌ 技能目录不存在:', this.skillsDir);
      return [];
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const skillModules = [];

    for (const entry of entries) {
      const fullPath = path.join(this.skillsDir, entry.name);
      
      // 跳过非技能文件
      if (entry.name.startsWith('.') || entry.name === 'SKILL.md') {
        continue;
      }

      if (entry.isDirectory()) {
        // 目录技能：查找 index.js 或 main.js
        const indexJs = path.join(fullPath, 'index.js');
        const mainJs = path.join(fullPath, 'main.js');
        const entryFile = fs.existsSync(indexJs) ? indexJs : (fs.existsSync(mainJs) ? mainJs : null);
        
        if (entryFile) {
          skillModules.push({
            name: this.normalizeSkillName(entry.name),
            path: entryFile,
            type: 'directory',
            dirName: entry.name
          });
        } else {
          console.log(`  ⚠️  目录无入口文件: ${entry.name}/`);
          this.skillStats.skipped++;
        }
      } else if (entry.name.endsWith('.js')) {
        // 独立JS文件技能
        skillModules.push({
          name: this.normalizeSkillName(entry.name.replace('.js', '')),
          path: fullPath,
          type: 'file'
        });
      }
    }

    console.log(`  发现 ${skillModules.length} 个技能模块`);
    return skillModules;
  }

  /**
   * 标准化技能名称（用于对象键名）
   */
  normalizeSkillName(name) {
    // 转换为 camelCase
    return name
      .replace(/-([a-z])/g, (g) => g[1].toUpperCase())
      .replace(/_([a-z])/g, (g) => g[1].toUpperCase())
      .replace(/\s+/g, '');
  }

  /**
   * 动态加载单个技能
   */
  loadSkill(skillModule) {
    try {
      console.log(`  📦 加载技能: ${skillModule.name} (${path.basename(skillModule.path)})`);
      
      // 动态 require
      const SkillClass = require(skillModule.path);
      
      // 实例化（传递 system 引用）
      let skillInstance;
      if (typeof SkillClass === 'function') {
        // 类构造函数
        skillInstance = new SkillClass(this.system);
      } else if (typeof SkillClass === 'object' && SkillClass.default) {
        // ES6 default export
        skillInstance = new SkillClass.default(this.system);
      } else if (typeof SkillClass === 'object') {
        // 已经是实例或对象
        skillInstance = SkillClass;
      } else {
        console.warn(`  ⚠️  未知导出类型: ${skillModule.name}`);
        this.skillStats.skipped++;
        return null;
      }

      this.skillStats.loaded++;
      console.log(`  ✅ ${skillModule.name} 加载成功`);
      return { name: skillModule.name, instance: skillInstance };
      
    } catch (err) {
      console.error(`  ❌ ${skillModule.name} 加载失败:`, err.message);
      this.skillStats.failed++;
      return null;
    }
  }

  /**
   * 加载所有技能
   */
  async loadAllSkills() {
    console.log('\n==========================================');
    console.log('  动态技能加载器 v2.0');
    console.log('==========================================');

    const skillModules = this.scanSkills();
    this.skillStats.total = skillModules.length;
    
    console.log('\n📦 开始加载技能...\n');

    const loaded = new Map();

    for (const module of skillModules) {
      // 跳过已加载的（如5个核心技能）
      if (this.loadedSkills.has(module.name)) {
        console.log(`  ⏭️  已加载，跳过: ${module.name}`);
        this.skillStats.skipped++;
        continue;
      }

      const result = this.loadSkill(module);
      if (result) {
        loaded.set(result.name, result.instance);
        this.loadedSkills.set(result.name, result.instance);
      }
    }

    // 统计报告
    console.log('\n==========================================');
    console.log('  技能加载完成');
    console.log('==========================================');
    console.log(`  总计: ${this.skillStats.total}`);
    console.log(`  成功: ${this.skillStats.loaded}`);
    console.log(`  失败: ${this.skillStats.failed}`);
    console.log(`  跳过: ${this.skillStats.skipped}`);
    console.log(`  实际加载: ${loaded.size}`);
    console.log('==========================================\n');

    return loaded;
  }

  /**
   * 获取所有已加载技能
   */
  getAllSkills() {
    return this.loadedSkills;
  }

  /**
   * 获取技能统计
   */
  getStats() {
    return this.skillStats;
  }

  /**
   * 调用技能方法
   */
  async callSkill(skillName, method, ...args) {
    const skill = this.loadedSkills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    if (typeof skill[method] !== 'function') {
      throw new Error(`Method not found: ${skillName}.${method}`);
    }
    return await skill[method](...args);
  }

  /**
   * 列出所有可用技能
   */
  listSkills() {
    return Array.from(this.loadedSkills.keys());
  }

  /**
   * 获取技能状态
   */
  getSkillStatus() {
    const status = {};
    for (const [name, skill] of this.loadedSkills) {
      status[name] = {
        loaded: true,
        hasGetStatus: typeof skill.getStatus === 'function'
      };
    }
    return status;
  }
}

module.exports = SkillLoader;
