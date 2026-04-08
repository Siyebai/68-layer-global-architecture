#!/usr/bin/env node
/**
 * GitHub Issue 通信检查器
 * 每30分钟检查Issue #3的新评论，处理@mention消息
 * 
 * 用法: AGENT_ID=cloud-libai node scripts/github-issue-watcher.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const AGENT_ID = process.env.AGENT_ID || 'unknown';
const ISSUE_NUMBER = 3;
const CHECK_STATE_FILE = path.join(__dirname, '..', 'memory', `github-last-check-${AGENT_ID}.json`);

console.log(`[${AGENT_ID}] GitHub Issue检查器启动 (Issue #${ISSUE_NUMBER})`);

function loadLastCheck() {
  try {
    const data = fs.readFileSync(CHECK_STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { lastCommentId: null, lastCheck: null };
  }
}

function saveLastCheck(lastCommentId) {
  const state = {
    lastCommentId,
    lastCheck: new Date().toISOString()
  };
  fs.writeFileSync(CHECK_STATE_FILE, JSON.stringify(state, null, 2));
}

function parseComments(output) {
  const comments = [];
  const lines = output.split('\n');
  let currentComment = null;
  
  for (let line of lines) {
    if (line.includes('Comment #') || line.includes('@')) {
      if (currentComment) comments.push(currentComment);
      currentComment = { body: line };
    } else if (currentComment) {
      currentComment.body += '\n' + line;
    }
  }
  if (currentComment) comments.push(currentComment);
  
  return comments;
}

function processNewComments(comments, lastCheckedId) {
  const newComments = [];
  
  for (let comment of comments) {
    const commentId = extractCommentId(comment);
    if (!commentId) continue;
    
    if (!lastCheckedId || commentId > lastCheckedId) {
      newComments.push(comment);
    }
  }
  
  return newComments;
}

function extractCommentId(comment) {
  return Date.now();
}

function handleMention(comment) {
  console.log(`[${AGENT_ID}] 检测到提及:`, comment.body.substring(0, 100));
  
  const body = comment.body.toLowerCase();
  if (body.includes(AGENT_ID.toLowerCase())) {
    console.log(`[${AGENT_ID}] 执行任务:`, comment.body);
    
    if (body.includes('status') || body.includes('状态')) {
      sendReply(comment, `[${AGENT_ID}] STATUS: 系统运行正常，PID=${process.pid}`);
    }
  }
}

function sendReply(originalComment, replyContent) {
  console.log(`[${AGENT_ID}] 回复: ${replyContent.substring(0, 80)}`);
}

function main() {
  const state = loadLastCheck();
  
  exec('gh issue view 3 --comments 2>/dev/null', (err, stdout, stderr) => {
    if (err) {
      console.error(`[${AGENT_ID}] 获取Issue失败:`, err.message);
      return;
    }
    
    const comments = parseComments(stdout);
    console.log(`[${AGENT_ID}] 获取到 ${comments.length} 条评论`);
    
    const newComments = processNewComments(comments, state.lastCommentId);
    console.log(`[${AGENT_ID}] 发现 ${newComments.length} 条新评论`);
    
    for (let comment of newComments) {
      handleMention(comment);
    }
    
    if (comments.length > 0) {
      saveLastCheck(extractCommentId(comments[comments.length - 1]));
    }
    
    console.log(`[${AGENT_ID}] 检查完成，下次检查30分钟后`);
  });
}

main();
setInterval(main, 30 * 60 * 1000);
console.log(`[${AGENT_ID}] 定时器已设置: 每30分钟检查一次`);
