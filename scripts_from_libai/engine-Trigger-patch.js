// 三大引擎周期性触发补丁
// 插入到 startMessageLoop() 之后

// 启动三大引擎的周期性执行
setInterval(() => {
  try {
    // 1. 自主学习引擎 - 每小时执行
    if (system.learningEngine && system.learningEngine.trainingData.length >= 100) {
      system.learningEngine.learnFromExperience(system.learningEngine.trainingData);
      system.learningEngine.trainingData = []; // 清空已处理数据
      system.state.metrics.learningCycles++;
      logger.info('自主学习周期完成', { cycles: system.state.metrics.learningCycles });
    }
  } catch (err) {
    logger.error('学习引擎错误:', err);
  }
}, 60 * 60 * 1000); // 60分钟

setInterval(() => {
  try {
    // 2. 自主进化引擎 - 每天执行
    if (system.evolutionEngine && system.evolutionEngine.population.length > 0) {
      const fitness = system.calculateGlobalFitness();
      system.evolutionEngine.evolve(fitness);
      logger.info('自主进化周期完成', { generation: system.evolutionEngine.generation });
    }
  } catch (err) {
    logger.error('进化引擎错误:', err);
  }
}, 24 * 60 * 60 * 1000); // 24小时

setInterval(() => {
  try {
    // 3. 自主迭代引擎 - 每2小时执行
    if (system.iterationEngine && system.currentParams) {
      const performance = system.getRecentPerformance();
      system.currentParams = system.iterationEngine.iterate(system.currentParams, performance);
      logger.info('自主迭代周期完成', { iterations: system.state.metrics.iterationsCompleted });
    }
  } catch (err) {
    logger.error('迭代引擎错误:', err);
  }
}, 2 * 60 * 60 * 1000); // 2小时

logger.info('三大引擎定时器已启动');
