#!/usr/bin/env node
// 技能3: Subagent自主项目管理
class AutonomousProjectManagementSkill {
  constructor(system) {
    this.system = system;
    this.projects = new Map();
    this.taskQueue = [];
  }
  
  async createProject(project) {
    const projectId = `project_${Date.now()}`;
    this.projects.set(projectId, {
      id: projectId,
      name: project.name,
      description: project.description,
      tasks: [],
      status: 'planning',
      startTime: Date.now(),
      deadline: project.deadline,
      milestones: project.milestones || [],
      resources: project.resources || {},
      dependencies: project.dependencies || []
    });
    
    console.log(`[项目管理] 创建项目: ${project.name} (${projectId})`);
    return projectId;
  }
  
  async addTask(projectId, task) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    
    task.id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    task.projectId = projectId;
    task.status = 'pending';
    task.createdAt = Date.now();
    
    project.tasks.push(task);
    this.taskQueue.push(task);
    
    console.log(`[项目管理] 添加任务: ${task.name} → ${project.name}`);
    return task.id;
  }
  
  async scheduleTasks() {
    // 按优先级排序任务
    const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'BACKGROUND'];
    this.taskQueue.sort((a, b) => {
      const pa = a.priority || 'MEDIUM';
      const pb = b.priority || 'MEDIUM';
      return priorityOrder.indexOf(pa) - priorityOrder.indexOf(pb);
    });
    
    // 分配资源并执行
    for (const task of this.taskQueue) {
      if (task.status === 'pending') {
        await this.executeTask(task);
      }
    }
  }
  
  async executeTask(task) {
    console.log(`[项目管理] 执行任务: ${task.name} (优先级: ${task.priority || 'MEDIUM'})`);
    task.status = 'running';
    task.startedAt = Date.now();
    
    try {
      // 实际执行逻辑 (子agent调用)
      if (this.system.executeTask) {
        const result = await this.system.executeTask(task);
        task.status = 'completed';
        task.completedAt = Date.now();
        task.result = result;
        console.log(`[项目管理] 任务完成: ${task.name}`);
        return result;
      } else {
        throw new Error('System executeTask not available');
      }
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.retryCount = (task.retryCount || 0) + 1;
      console.error(`[项目管理] 任务失败: ${task.name} - ${error.message}`);
      
      // 重试逻辑
      if (task.retryCount < 3) {
        console.log(`[项目管理] 重试任务: ${task.name} (${task.retryCount}/3)`);
        task.status = 'pending';
        return await this.executeTask(task);
      }
      
      throw error;
    }
  }
  
  async getProjectStatus(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;
    
    const tasks = project.tasks;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const running = tasks.filter(t => t.status === 'running').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    
    return {
      ...project,
      stats: { total: tasks.length, completed, running, pending, failed },
      progress: tasks.length > 0 ? (completed / tasks.length) * 100 : 0
    };
  }
  
  async autoAdjustSchedule() {
    // 根据执行情况自动调整计划
    for (const [projectId, project] of this.projects) {
      const failedTasks = project.tasks.filter(t => t.status === 'failed');
      if (failedTasks.length > 0) {
        console.log(`[项目管理] 项目${project.name}有${failedTasks.length}个失败任务，重新调度...`);
        // 重新调度失败任务
        for (const task of failedTasks) {
          task.status = 'pending';
          this.taskQueue.push(task);
        }
      }
    }
    
    // 重新排序并执行
    await this.scheduleTasks();
  }
  
  getAllProjects() {
    return Array.from(this.projects.values());
  }
}
module.exports = { AutonomousProjectManagementSkill };
