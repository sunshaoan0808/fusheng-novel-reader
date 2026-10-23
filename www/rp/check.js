/**
 * check.js — 纯逻辑属性判定器
 * 百分骰判定、四档结果、判定历史与累计统计
 * 无 DOM/浏览器依赖，Node 可直接 require
 */

/**
 * 创建判定器实例
 * @param {Object} [opts]
 * @param {Function} [opts.random] 返回 [0,1) 的函数，缺省 Math.random
 * @returns {Object} 判定器 API
 */
function createCheck(opts = {}) {
  const random = typeof opts.random === 'function' ? opts.random : Math.random;

  // 判定历史（最多 50 条）
  const history = [];
  // 累计统计
  const stats = { total: 0, successes: 0, criticals: 0, fumbles: 0 };

  /**
   * 掷骰：返回 1..sides 的整数
   * @param {number} sides 面数，须为不小于 2 的整数
   * @returns {number|null} 结果或 null（参数非法）
   */
  function rollDie(sides) {
    if (!Number.isInteger(sides) || sides < 2) return null;
    return Math.floor(random() * sides) + 1;
  }

  /**
   * 百分骰：返回 1..100 的整数
   * @returns {number}
   */
  function rollPercent() {
    return Math.floor(random() * 100) + 1;
  }

  /**
   * 计算目标值
   * @param {number} attribute 基础属性
   * @param {number} [modifier=0] 修正值
   * @param {number} [difficulty] 难度值
   * @returns {number} 钳制到 1..99 的目标值
   */
  function computeTarget(attribute, modifier = 0, difficulty) {
    let target = Math.round(attribute) + (typeof modifier === 'number' && Number.isFinite(modifier) ? modifier : 0);
    if (typeof difficulty === 'number' && Number.isFinite(difficulty)) {
      target -= difficulty;
    }
    if (target < 1) return 1;
    if (target > 99) return 99;
    return target;
  }

  /**
   * 判定主入口
   * @param {Object} input
   * @param {number} input.attribute 基础属性（必须为有限数）
   * @param {number} [input.modifier=0] 修正值（可选有限数）
   * @param {number} [input.difficulty] 难度值（可选有限数）
   * @returns {Object|null} 判定结果或 null（参数非法）
   */
  function check(input) {
    if (!input || typeof input !== 'object') return null;
    const { attribute, modifier = 0, difficulty } = input;

    if (typeof attribute !== 'number' || !Number.isFinite(attribute)) return null;

    const target = computeTarget(attribute, modifier, difficulty);
    const roll = rollPercent();

    let success, tier;
    if (roll === 1) {
      success = true;
      tier = 'critical';
    } else if (roll === 100) {
      success = false;
      tier = 'fumble';
    } else if (roll <= target) {
      success = true;
      tier = 'success';
    } else {
      success = false;
      tier = 'failure';
    }

    const margin = target - roll;

    // 更新统计
    stats.total++;
    if (success) stats.successes++;
    if (tier === 'critical') stats.criticals++;
    if (tier === 'fumble') stats.fumbles++;

    // 记录历史
    const record = { attribute, target, roll, success, tier };
    history.push(record);
    if (history.length > 50) history.shift();

    return { roll, target, success, tier, margin };
  }

  /**
   * 获取判定历史副本（时间顺序，最多 50 条）
   * @returns {Array<Object>}
   */
  function getHistory() {
    return [...history];
  }

  /**
   * 清空判定历史（不影响累计统计）
   */
  function clearHistory() {
    history.length = 0;
  }

  /**
   * 获取累计统计
   * @returns {Object} {total, successes, criticals, fumbles}
   */
  function getStats() {
    return { ...stats };
  }

  return {
    rollDie,
    rollPercent,
    check,
    history: getHistory,
    clearHistory,
    stats: getStats,
  };
}

module.exports = { createCheck };