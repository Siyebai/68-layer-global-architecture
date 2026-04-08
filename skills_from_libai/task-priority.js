#!/usr/bin/env node
// Task Priority Skill - V7.2
// 提供任务优先级管理

class TaskPrioritySkill {
  constructor() {
    this.name = 'task-priority';
    this.enabled = true;
    this.priorityLevels = ['critical', 'high', 'medium', 'low'];
  }

  assignPriority(task) {
    // 基于紧迫性和重要性分配优先级
    const now = Date.now();
    const deadline = task.deadline || now + 24 * 60 * 60 * 1000;
    const timeLeft = deadline - now;
    
    let priority = 'low';
    if (timeLeft < 60 * 60 * 1000) {
      priority = 'critical';
    } else if (timeLeft < 6 * 60 * 60 * 1000) {
      priority = 'high';
    } else if (timeLeft < 24 * 60 * 60 * 1000) {
      priority = 'medium';
    }
    
    task.priority = priority;
    return priority;
  }

  getNextTask(tasks) {
    // 按优先级排序任务
    return tasks.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] || 4) - (order[b.priority] || 4);
    })[0];
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      priorityLevels: this.priorityLevels,
      status: 'active'
    };
  }
}

module.exports = { TaskPrioritySkill };
