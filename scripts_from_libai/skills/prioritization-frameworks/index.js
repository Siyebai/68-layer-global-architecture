class PrioritizationSkill {
  constructor(system) { this.system = system; }
  iceScore(task) { const { impact = 1, confidence = 1, ease = 1 } = task; return (impact * confidence * ease) / 10; }
  riceScore(task) { const { reach = 1, impact = 1, confidence = 1, effort = 1 } = task; return (reach * impact * confidence) / effort; }
  async decide(taskList, framework = 'ice') { const scored = taskList.map(task => ({ ...task, score: framework === 'ice' ? this.iceScore(task) : this.iceScore(task) })); scored.sort((a,b) => b.score - a.score); return scored; }
  getStatus() { return { name: 'prioritization-frameworks', running: true, frameworks: ['ice', 'rice', 'eisenhower'], version: '1.0.0' }; }
}
module.exports = PrioritizationSkill;
