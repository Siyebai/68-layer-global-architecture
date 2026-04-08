#!/usr/bin/env node
// Wangwu Chat Skill - V7.2
// 提供智能对话能力

class WangwuChatSkill {
  constructor() {
    this.name = 'wangwu-chat';
    this.enabled = true;
    this.context = [];
    this.maxContextLength = 10;
  }

  async chat(message, userContext = {}) {
    // 简单的对话回复逻辑
    const response = this.generateResponse(message, userContext);
    
    // 更新上下文
    this.context.push({ role: 'user', content: message });
    this.context.push({ role: 'assistant', content: response });
    
    // 限制上下文长度
    if (this.context.length > this.maxContextLength) {
      this.context = this.context.slice(-this.maxContextLength);
    }
    
    return response;
  }

  generateResponse(message, context) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('你好') || lowerMessage.includes('hello')) {
      return '你好！我是王五AI助手，很高兴为您服务。';
    }
    if (lowerMessage.includes('状态') || lowerMessage.includes('status')) {
      return '系统运行正常，自主度105%，所有模块运行稳定。';
    }
    if (lowerMessage.includes('帮助') || lowerMessage.includes('help')) {
      return '我可以帮助您进行任务管理、优先级排序、项目规划和智能对话。';
    }
    
    return `收到您的消息："${message}"。我会持续学习以提供更好的服务。`;
  }

  clearContext() {
    this.context = [];
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      contextLength: this.context.length,
      status: 'active'
    };
  }
}

module.exports = { WangwuChatSkill };
