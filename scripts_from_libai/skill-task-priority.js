#!/usr/bin/env node
// 技能2: 任务优先级决策框架
class TaskPriorityDecisionSkill {
  constructor(system) {
    this.system = system;
    this.priorityLevels = {
      CRITICAL: 100,
      HIGH: 80,
      MEDIUM: 50,
      LOW: 20,
      BACKGROUND: 10
    };
  }
  
  evaluatePriority(task) {
    // 多维度评估
    const urgency = this.assessUrgency(task);
    const impact = this.assessImpact(task);
    const dependencies = this.assessDependencies(task);
    const resource = this.assessResourceRequirement(task);
    const risk = this.assessRisk(task);
    
    // 加权计算
    const score = 
      urgency * 0.3 +
      impact * 0.25 +
      dependencies * 0.15 +
      resource * 0.15 +
      (100 - risk) * 0.15;
    
    return this.scoreToLevel(score);
  }
  
  assessUrgency(task) {
    if (!task.deadline) return 50;
    const hoursToDeadline = (new Date(task.deadline) - Date.now()) / (1000 * 60 * 60);
    if (hoursToDeadline < 1) return 100;
    if (hoursToDeadline < 6) return 80;
    if (hoursToDeadline < 24) return 60;
    return 30;
  }
  
  assessImpact(task) {
    const impactMap = {
      'trading': 90,
      'risk_control': 95,
      'system_health': 100,
      'learning': 70,
      'optimization': 75,
      'reporting': 60,
      'maintenance': 50
    };
    return impactMap[task.type] || 50;
  }
  
  assessDependencies(task) {
    if (!task.dependencies || task.dependencies.length === 0) return 50;
    return Math.min(100, 50 + task.dependencies.length * 10);
  }
  
  assessResourceRequirement(task) {
    const cpuEstimate = this.estimateCPU(task);
    const memEstimate = this.estimateMemory(task);
    return Math.min(100, (cpuEstimate + memEstimate) / 2);
  }
  
  assessRisk(task) {
    if (task.riskLevel === 'high') return 90;
    if (task.riskLevel === 'medium') return 60;
    return 30;
  }
  
  estimateCPU(task) {
    const base = 30;
    const complexity = task.complexity ? task.complexity * 20 : 20;
    return Math.min(100, base + complexity);
  }
  
  estimateMemory(task) {
    const base = 30;
    const dataSize = task.dataSize ? Math.log2(task.dataSize) * 10 : 20;
    return Math.min(100, base + dataSize);
  }
  
  scoreToLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'BACKGROUND';
  }
  
  getPriorityOrder() {
    return Object.entries(this.priorityLevels)
      .sort((a, b) => b[1] - a[1])
      .map(([level]) => level);
  }
}
module.exports = { TaskPriorityDecisionSkill };
