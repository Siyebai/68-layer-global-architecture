#!/usr/bin/env node
// 简单日志工具 (复制自主系统)

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

class SimpleLogger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }

  error(msg, ...args) {
    if (this.level >= LOG_LEVELS.error) {
      console.error(`[ERROR] ${msg}`, ...args);
    }
  }

  warn(msg, ...args) {
    if (this.level >= LOG_LEVELS.warn) {
      console.warn(`[WARN] ${msg}`, ...args);
    }
  }

  info(msg, ...args) {
    if (this.level >= LOG_LEVELS.info) {
      console.info(`[INFO] ${msg}`, ...args);
    }
  }

  debug(msg, ...args) {
    if (this.level >= LOG_LEVELS.debug) {
      console.debug(`[DEBUG] ${msg}`, ...args);
    }
  }
}

module.exports = { SimpleLogger };
