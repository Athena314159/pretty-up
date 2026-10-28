import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend } from './recommend.js';
import { scoreRules } from './score.js';

const rules = scoreRules();
const report = { generatedAt: new Date().toISOString(), rules, models: [], recommendation: null };
report.recommendation = recommend(report);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'last-report.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`规则模式 ${rules.passed}/${rules.total}，得分 ${rules.score}`);
for (const check of rules.checks) if (!check.ok) console.log(`未通过 ${check.id} ${check.detail}`);
console.log(`默认主模型：${report.recommendation.model}`);
console.log(report.recommendation.reason);
if (rules.passed !== rules.total) process.exitCode = 1;
