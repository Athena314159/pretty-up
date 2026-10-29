export const VERSION='3.2.0';
export const SOCIAL_POLICY='所有平台逐条进入原帖，阅读正文并看完全部图片，确认实际图序与加载成功；逐图记录可用、重复、补充、排除或未读。可用内页逐张摘录，封面集合不替代内页。作品图保持完整比例，整页核验截图另存。原帖数、合格帖数、可用图数和去重版式数分开。先按本任务使用语境和最新纠偏判断适用性，来源已核验不等于案例合格。';
export const STUDY_POLICY='文献/历史图像任务加载 references/study-evidence.md。按文件记录正文、图版图注、脚注与附录的实际已读范围；OCR与清点不等于读完，阅读、翻译、校对分别记录，缺页漏译自主补查。摘录保留页码/段号、原图与图注，解释背景、条件、表现与用途；推断标明。事件、图像、出版与藏品年代分开。沿原文术语、多语言同义词、引文与馆藏持续扩词并记录有效增量。';
export function timePolicy(t){return t.time_scope==='unrestricted'||/时间不限|不限时间|不限年代/.test((t.brief||t.topic||'')+' '+(t.focus||''))?'时间不限：按主题覆盖历史原始资料与当代研究，不以近三个月或两年截断；相关性与证据质量优先，不强制社媒热度排序。':`近期范围：${t.start||'近三个月'} 至 ${t.end||'执行日'}；历史范围：${t.historyStart||'按任务确定'} 至 ${t.historyEnd||'按任务确定'}。用户指定范围优先；默认优先有可比增长证据的相关近期趋势，历史必需资料独立保障。`;}
export function sourceAssessment(s,taskId){
 const review=s.task_reviews?.[taskId];
 if(review?.decision!=='accepted')return {eligible:false,reason:review?.reason||'缺少本任务适用性复核'};
 if(s.verification!=='verified')return {eligible:false,reason:'来源未核验'};
 if(s.evidence_type==='social_post'||s.total_media!==undefined){
  const n=s.total_media,items=s.media_items;
  if(!Number.isInteger(n)||n<1||!Array.isArray(items)||items.length!==n||new Set(items.map(x=>x.index)).size!==n||items.some(x=>!Number.isInteger(x.index)||x.index<1||x.index>n||x.visually_reviewed!==true||!['usable','duplicate','supplement','excluded'].includes(x.decision))||s.full_post_review_complete!==true||s.content_verified!==true||s.original_opened!==true)return {eligible:false,reason:'原帖或全部图片未核完'};
  if(!items.some(x=>x.decision==='usable'))return {eligible:false,reason:'没有符合目标的可用图片'};
 }
 return {eligible:true,reason:'记录核验与任务适用性均通过'};
}
export function mergeSource(old,incoming){
 const oldTime=Date.parse(old.verification_updated_at||''),newTime=Date.parse(incoming.verification_updated_at||'');
 const newer=Number.isFinite(newTime)&&(!Number.isFinite(oldTime)||newTime>oldTime);
 const merged={...old,...incoming,id:old.id,task_ids:[...new Set([...(old.task_ids||[]),...(incoming.task_ids||[])])]};
 const protectedFields=['verification','verification_updated_at','content_verified','original_opened','total_media','reviewed_count','full_post_review_complete','media_items'];
 if(!newer)for(const key of protectedFields)if(old[key]!==undefined)merged[key]=old[key];
 merged.task_reviews={...old.task_reviews};
 for(const [key,row] of Object.entries(incoming.task_reviews||{})){const prior=merged.task_reviews[key];if(!prior||Number.isFinite(Date.parse(row.updated_at))&&(!Number.isFinite(Date.parse(prior.updated_at))||Date.parse(row.updated_at)>Date.parse(prior.updated_at)))merged.task_reviews[key]=row;}
 return merged;
}
