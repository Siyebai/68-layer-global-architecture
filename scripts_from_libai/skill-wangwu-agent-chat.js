#!/usr/bin/env node
// 技能5: 智能对话 (wangwu-agent-chat)
class WangwuAgentChatSkill {
  constructor(system) {
    this.system = system;
    this.conversationHistory = new Map();
    this.maxHistory = 10;
    this.sessionMetadata = new Map();
  }
  
  async chat(sessionId, message, context = {}) {
    const history = this.conversationHistory.get(sessionId) || [];
    
    // 记录会话元数据
    this.sessionMetadata.set(sessionId, {
      lastActive: Date.now(),
      messageCount: (this.sessionMetadata.get(sessionId)?.messageCount || 0) + 1,
      context: { ...context }
    });
    
    // 构建对话上下文
    const messages = [
      ...history.slice(-this.maxHistory),
      { role: 'user', content: message, context, timestamp: Date.now() }
    ];
    
    // 调用系统智能决策生成回复
    const response = await this.generateResponse(messages);
    
    // 更新历史
    history.push({ role: 'user', content: message, timestamp: Date.now() });
    history.push({ role: 'assistant', content: response, timestamp: Date.now() });
    this.conversationHistory.set(sessionId, history.slice(-this.maxHistory));
    
    return {
      response,
      sessionId,
      messageCount: this.sessionMetadata.get(sessionId).messageCount,
      timestamp: Date.now()
    };
  }
  
  async generateResponse(messages) {
    // 使用系统现有的决策引擎
    if (this.system.superAuto && this.system.superAuto.layers && this.system.superAuto.layers.cognition) {
      try {
        const decision = await this.system.superAuto.layers.cognition.decision.makeDecision({
          type: 'chat_response',
          messages,
          timestamp: Date.now()
        });
        return decision.response || this.defaultResponse(messages);
      } catch (error) {
        console.error('[智能对话] 决策引擎调用失败:', error.message);
        return this.defaultResponse(messages);
      }
    }
    
    return this.defaultResponse(messages);
  }
  
  defaultResponse(messages) {
    const lastMsg = messages[messages.length - 1];
    const systemStatus = this.system.getStatus ? this.system.getStatus() : null;
    const autonomy = systemStatus?.autonomousLevel || 'unknown';
    
    return `[智能对话] 系统V7.2运行中，自主度${autonomy}%。已收到消息："${lastMsg.content.substring(0, 50)}..."。当前状态：${systemStatus ? '正常' : '初始化中'}。`;
  }
  
  clearSession(sessionId) {
    this.conversationHistory.delete(sessionId);
    this.sessionMetadata.delete(sessionId);
    console.log(`[智能对话] 清除会话: ${sessionId}`);
  }
  
  getSessionHistory(sessionId) {
    return this.conversationHistory.get(sessionId) || [];
  }
  
  getAllSessions() {
    return Array.from(this.conversationHistory.keys());
  }
  
  getActiveSessions(maxAgeMinutes = 30) {
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    
    return Array.from(this.sessionMetadata.entries())
      .filter(([sessionId, meta]) => (now - meta.lastActive) < maxAge)
      .map(([sessionId, meta]) => ({
        sessionId,
        lastActive: meta.lastActive,
        messageCount: meta.messageCount
      }));
  }
  
  getStats() {
    const totalSessions = this.conversationHistory.size;
    const totalMessages = Array.from(this.conversationHistory.values())
      .reduce((sum, hist) => sum + hist.length, 0);
    const activeSessions = this.getActiveSessions(30).length;
    
    return {
      totalSessions,
      totalMessages,
      activeSessions,
      avgMessagesPerSession: totalSessions > 0 ? totalMessages / totalSessions : 0
    };
  }
}
module.exports = { WangwuAgentChatSkill };
