#!/usr/bin/env node
// Project Management Skill - V7.2
// 提供项目管理能力

class ProjectManagementSkill {
  constructor() {
    this.name = 'project-management';
    this.enabled = true;
  }

  createProjectPlan(objective, tasks) {
    return {
      objective,
      tasks: tasks.map((task, index) => ({
        ...task,
        id: `task_${index + 1}`,
        status: 'pending',
        createdAt: Date.now()
      })),
      createdAt: Date.now(),
      status: 'planning'
    };
  }

  updateTaskStatus(project, taskId, newStatus) {
    const task = project.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      task.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  getProjectProgress(project) {
    const total = project.tasks.length;
    const completed = project.tasks.filter(t => t.status === 'completed').length;
    return {
      total,
      completed,
      progress: total > 0 ? (completed / total) * 100 : 0,
      status: project.status
    };
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      status: 'active'
    };
  }
}

module.exports = { ProjectManagementSkill };
