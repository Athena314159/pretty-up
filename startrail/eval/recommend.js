export function recommend(report) {
  const live = (report.models || []).filter((item) => item.live && Number.isFinite(item.score));
  if (live.length) {
    live.sort((a, b) => b.score - a.score || (a.cost || 0) - (b.cost || 0));
    const winner = live[0];
    return {
      model: winner.model,
      baseURL: winner.baseURL || '',
      backup: live[1]?.model || null,
      reason: `同一套金标上，${winner.model} 得分 ${winner.score}，高于其余已测模型。`,
    };
  }
  const rules = report.rules;
  return {
    model: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com',
    backup: null,
    reason: `规则模式在 ${rules.passed}/${rules.total} 项金标上得 ${rules.score} 分，实体延伸、逐字摘抄、抗注入、语言加重和收敛已经由确定性代码完成。模型要补的是多语言改写和综述。默认主模型用 deepseek-chat：走 OpenAI 兼容接口，中文和结构化输出够用，按量计费低，符合免费优先。备用位留空，不堆模型；配上备用密钥后可以再跑评测对比。`,
  };
}
