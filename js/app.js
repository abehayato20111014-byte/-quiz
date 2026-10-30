/* 中3物理クイズ 配布版: 個人情報の登録・通信なし。 */
(function () {
  'use strict';
  const C = window.QuizCore;
  const STORAGE = 'physics-quiz-v2';
  const DRAFT_STORAGE = 'physics-quiz-draft-v3';
  const LEGACY_STORAGE = 'physics-quest-arena-v1';
  const DEFAULT = {total:0, correct:0, byTopic:{}, history:[], mistakes:[], sound:false};
  const DESCRIPTIONS = {
    basic:'基本用語・身近な例・基本的な計算を中心に出題します。',
    standard:'基本と標準を出題します。学校の授業や定期テストの復習向けです。',
    challenge:'標準と発展を出題します。考える問題や応用計算が増えます。',
    mix:'基本・標準・発展の全レベルからランダムに出題します。'
  };
  const LABELS = {basic:'基本',standard:'標準',challenge:'発展',mix:'全難易度',review:'復習','復習':'復習'};
  const $ = id => document.getElementById(id);
  const escapeHTML = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topic = id => C.TOPICS.find(t=>t.id===id) || C.TOPICS[0];
  const storageOK = (()=>{try{localStorage.setItem('__pq_probe','1');localStorage.removeItem('__pq_probe');return true;}catch(_){return false;}})();
  const settings = {topics:new Set(C.TOPICS.map(t=>t.id)),count:10,difficulty:'standard',includeExtended:false};
  let data = load();
  let session=[],index=0,answers=[],chosen=new Set(),answered=false,showHint=false,pendingNumber='',reviewMode=false,weakCurrent=[];
  let audioContext=null;

  function load(){
    if(!storageOK)return {...DEFAULT};
    try {
      const parsed=JSON.parse(localStorage.getItem(STORAGE)||localStorage.getItem(LEGACY_STORAGE)||'null');
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {...DEFAULT};
      const nonneg=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,10000000):0;
      const result={...DEFAULT,sound:parsed.sound===true,total:nonneg(parsed.total),correct:nonneg(parsed.correct)};
      result.correct=Math.min(result.correct,result.total);
      if(parsed.byTopic&&typeof parsed.byTopic==='object')for(const t of C.TOPICS){const x=parsed.byTopic[t.id];if(x){const total=nonneg(x.total);result.byTopic[t.id]={total,correct:Math.min(total,nonneg(x.correct))};}}
      const validQuestion=q=>q&&typeof q==='object'&&typeof q.prompt==='string'&&q.prompt.length<2000&&C.TOPICS.some(t=>t.id===q.topic)&&q.diagram&&typeof q.diagram.src==='string'&&/^assets\/diagrams\/[a-z-]+\.png$/.test(q.diagram.src)&&Array.isArray(q.diagram.labels)&&q.diagram.labels.length<20&&['single','multi','number'].includes(q.kind)&&typeof q.explanation==='string'&&typeof q.hint==='string';
      if(Array.isArray(parsed.mistakes))result.mistakes=parsed.mistakes.filter(validQuestion).slice(0,150);
      if(Array.isArray(parsed.history))result.history=parsed.history.filter(h=>h&&typeof h==='object'&&Array.isArray(h.topics)&&Number.isFinite(h.total)&&Number.isFinite(h.correct)&&typeof h.date==='string').slice(0,30);
      return result;
    }catch(_){return {...DEFAULT};}
  }
  function save(){if(storageOK)try{localStorage.setItem(STORAGE,JSON.stringify(data));}catch(_){}updateSound();}
  function saveDraft(){if(!storageOK||!session.length)return;try{localStorage.setItem(DRAFT_STORAGE,JSON.stringify({version:3,session,index,answers,chosen:[...chosen],answered,showHint,pendingNumber,reviewMode}));}catch(_){}}
  function readDraft(){if(!storageOK)return null;try{const d=JSON.parse(localStorage.getItem(DRAFT_STORAGE)||'null');if(d?.version!==3||!Array.isArray(d.session)||!d.session.length||d.session.length>200||!Array.isArray(d.answers)||d.answers.length>d.session.length||!Number.isInteger(d.index)||d.index<0||d.index>=d.session.length||!d.session.every(q=>q&&typeof q.prompt==='string'&&typeof q.kind==='string'&&q.diagram&&Array.isArray(q.diagram.labels)&&C.TOPICS.some(t=>t.id===q.topic)))return null;return d;}catch(_){return null;}}
  function clearDraft(){if(storageOK)try{localStorage.removeItem(DRAFT_STORAGE);}catch(_){}}
  function announce(message){const el=$('announcer');if(el)el.textContent=message;}
  function updateSound(){const b=$('soundToggle');if(!b)return;b.classList.toggle('sound-on',!!data.sound);b.setAttribute('aria-pressed',data.sound?'true':'false');b.setAttribute('aria-label',data.sound?'効果音をオフにする':'効果音をオンにする');}
  function sound(success){if(!data.sound)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext ||= new AC();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime;o.type='sine';o.frequency.setValueAtTime(success?600:310,t);o.frequency.exponentialRampToValueAtTime(success?780:240,t+.15);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+.23);}catch(_){}}
  function showToast(message){let el=$('notice');if(!el){el=document.createElement('div');el.id='notice';el.className='toast';el.setAttribute('role','alert');document.body.appendChild(el);}el.textContent=message;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.remove(),3500);announce(message);}
  function home(){
    const pct=data.total?Math.round(data.correct/data.total*100):0;
    const draft=readDraft();
    $('app').innerHTML=`<section class="intro-strip"><div><div class="eyebrow">中学校 理科・第1分野</div><h1>中3物理の<span class="gradient-text">練習クイズ</span></h1><p>分野と問題数を選んで練習しよう。1問ずつ採点して、答えと理由を確認できます。</p></div><div class="intro-counter"><strong>10</strong><span>出題分野</span></div></section>
      ${draft?'<div class="resume-banner"><div><strong>前回の続きがあります</strong><span>途中の問題から再開できます。</span></div><button type="button" class="secondary-button" data-action="resume">続きから再開</button></div>':''}
      <div class="screen-grid settings-grid"><section class="panel"><div class="panel-title-row"><h2 class="panel-title">① 分野を選択</h2><div class="tiny-actions"><button class="link-button" type="button" data-action="all">全選択</button><button class="link-button" type="button" data-action="none">全解除</button></div></div><p class="subtitle">1分野だけでも、複数分野を組み合わせてもOK。</p><div class="topic-grid">${C.TOPICS.map(t=>`<button type="button" class="topic-toggle" data-action="topic" data-topic="${t.id}" aria-pressed="${settings.topics.has(t.id)}" style="--topic-color:${t.color};--topic-bg:${t.color}1b"><span class="topic-emoji" aria-hidden="true">${t.icon}</span><span class="topic-text"><strong>${escapeHTML(t.name)}</strong><small>${escapeHTML(t.sub)}</small></span><span class="tick" aria-hidden="true">✓</span></button>`).join('')}</div><p class="hint-line">選択中：<strong>${settings.topics.size}分野</strong>。一度に1問ずつ表示します。</p></section>
      <section class="panel"><h2 class="panel-title">② 問題の設定</h2><p class="subtitle">まずは「標準」・10問から始めるのがおすすめです。</p><div class="setting-label" id="difficultyLabel">難易度</div><div class="difficulty-row" role="group" aria-labelledby="difficultyLabel">${[['basic','基本'],['standard','標準'],['challenge','発展'],['mix','全難易度']].map(([id,text])=>`<button type="button" class="difficulty-btn" data-action="difficulty" data-difficulty="${id}" aria-pressed="${settings.difficulty===id}">${text}</button>`).join('')}</div><p class="difficulty-help" id="difficultyHelp">${DESCRIPTIONS[settings.difficulty]}</p>
      <label class="extended-option" for="extendedToggle"><input type="checkbox" id="extendedToggle" ${settings.includeExtended?'checked':''}><span><strong>中学範囲を超える数式問題も含める</strong><small>水圧の密度計算、直角方向の合力、運動エネルギーの公式など。オフなら通常の中学範囲に集中できます。</small></span></label>
      <label class="setting-label" for="countInput">問題数（1～200問）</label><div class="question-count"><button type="button" class="number-step" data-action="decrement" aria-label="1問減らす">−</button><input class="count-input" type="number" id="countInput" min="1" max="200" inputmode="numeric" value="${settings.count}"><button type="button" class="number-step" data-action="increment" aria-label="1問増やす">＋</button><span class="muted">問</span></div><div class="count-chips">${[5,10,20,30,50,100].map(n=>`<button class="count-chip ${n===settings.count?'active':''}" type="button" data-action="count-chip" data-count="${n}">${n}問</button>`).join('')}</div><button class="start-button" data-action="start" type="button">クイズを始める →</button><p class="hint-line">選択肢は選んでから「回答を決定」。数字は単位を入れずに入力します。</p>
      <div class="side-info"><h3>この端末の学習記録</h3><div class="side-stat-grid stats-3"><div class="stat"><div class="stat-num cyan">${data.total}</div><div class="stat-label">解いた問題</div></div><div class="stat"><div class="stat-num amber">${pct}%</div><div class="stat-label">累計正答率</div></div><div class="stat"><div class="stat-num">${data.mistakes.length}</div><div class="stat-label">復習候補</div></div></div><div class="side-actions"><button class="secondary-button" type="button" data-action="history">学習履歴</button><button class="secondary-button" type="button" data-action="review" ${data.mistakes.length?'':'disabled'}>復習する</button></div></div></section></div>
      <div class="home-notes"><p><strong>使い方：</strong>問題文と図の条件を確認 → 選択肢または数字で回答 → 解説を読む → 次へ。途中で閉じても、保存が使える端末なら再開できます。</p><p>${storageOK?'学習履歴はこのブラウザ内だけに保存され、外部送信されません。共有端末では使用後に履歴を削除してください。':'このブラウザでは保存機能が利用できません。回答はできますが、閉じると学習履歴は消えます。'}</p></div>`;
  }
  function setCount(n){settings.count=Math.max(1,Math.min(200,Math.trunc(Number(n))||1));home();$('countInput')?.focus();}
  function begin(review=false,onlyThis=null){
    if(!settings.topics.size){showToast('分野を1つ以上選択してください。');return;}
    const candidates=review?(onlyThis||data.mistakes).filter(q=>settings.topics.has(q.topic)):[];
    if(review&&!candidates.length){showToast('選択した分野の復習問題がありません。');return;}
    try{session=C.makeSession([...settings.topics],review?Math.min(settings.count,candidates.length):settings.count,settings.difficulty,review?candidates:null,settings.includeExtended);}catch(err){showToast(err.message);return;}
    index=0;answers=[];chosen=new Set();answered=false;showHint=false;pendingNumber='';reviewMode=review;weakCurrent=[];saveDraft();question();window.scrollTo(0,0);
  }
  function resume(){const draft=readDraft();if(!draft){showToast('再開できる問題がありません。');home();return;}session=draft.session;index=draft.index;answers=draft.answers;chosen=new Set(draft.chosen||[]);answered=!!draft.answered;showHint=!!draft.showHint;pendingNumber=String(draft.pendingNumber||'');reviewMode=!!draft.reviewMode;question();window.scrollTo(0,0);}
  function renderDiagram(q,t){
    const labels=q.diagram.labels.map(l=>escapeHTML(l.text));
    const diagramKey=q.diagram.src.match(/^assets\/diagrams\/([a-z-]+)\.png$/)?.[1];
    const source=(diagramKey&&window.__diagramAssets?.[diagramKey])||q.diagram.src;
    return `<figure class="diagram-wrap"><div class="diagram-frame"><img src="${escapeHTML(source)}" alt="${escapeHTML(t.name)}の模式図。条件は次の図の数値欄と問題文を参照。" draggable="false">${q.diagram.labels.map((l,i)=>`<span aria-hidden="true" class="diagram-label" style="left:${Number(l.x)}%;top:${Number(l.y)}%">${labels[i]}</span>`).join('')}<span class="diagram-note">模式図・縮尺は正確ではありません</span></div><figcaption class="diagram-legend"><strong>図の条件</strong>${labels.map(l=>`<span>${l}</span>`).join('')}</figcaption></figure>`;
  }
  function question(){
    const q=session[index],t=topic(q.topic),result=answers[index],isAnswered=!!result;
    answered=isAnswered;
    const correctSoFar=answers.filter(a=>a.correct).length;
    const p=Math.round((index+(isAnswered?1:0))/session.length*100);
    const kind=q.kind==='single'?'4択・1つ選択':q.kind==='multi'?'複数選択・すべて選択':'数字入力';
    const options=q.kind!=='number'?`<div class="option-grid" role="group" aria-label="回答の選択肢">${q.options.map((opt,i)=>{const selected=chosen.has(i),right=isAnswered&&q.answers.includes(i),wrong=isAnswered&&selected&&!q.answers.includes(i);return `<button type="button" class="option-button ${selected?'selected':''} ${right?'right':''} ${wrong?'wrong':''}" data-action="option" data-option="${i}" ${isAnswered?'disabled':''} aria-pressed="${selected}"><span class="option-index">${String.fromCharCode(65+i)}</span><span>${escapeHTML(opt)}</span></button>`;}).join('')}</div>`:`<div class="number-answer-row"><input type="text" id="numericAnswer" class="answer-input" inputmode="decimal" placeholder="数値を入力" autocomplete="off" spellcheck="false" aria-describedby="unitHint" ${isAnswered?'disabled':''} value="${escapeHTML(isAnswered?String(result.given):pendingNumber)}"><span class="answer-unit" id="unitHint">${escapeHTML(q.unit)}</span></div><p class="hint-line">単位は右側に表示されています。数値だけ入力してください。</p>`;
    const footer=isAnswered?`<div class="feedback ${result.correct?'good':'bad'}" id="feedback" role="status"><h3>${result.correct?'✓ 正解です':'答えを確認しよう'}</h3>${result.correct?'':`<p class="correct-answer">正解：${escapeHTML(C.correctText(q))}</p>`}<p>${escapeHTML(q.explanation)}</p></div><button class="primary-button feedback-next" data-action="next" type="button">${index===session.length-1?'結果を見る':'次の問題へ →'}</button>`:`<div class="question-actions"><button class="hint-button" type="button" data-action="hint" aria-expanded="${showHint}">${showHint?'ヒントを閉じる':'💡 ヒントを見る'}</button><button class="submit-button" type="button" data-action="submit">回答を決定する</button></div><div class="hint-box" id="hintText" ${showHint?'':'hidden'}>${escapeHTML(q.hint)}</div><p id="answerError" class="answer-error" role="alert"></p>`;
    $('app').innerHTML=`<div class="quiz-layout"><div class="play-heading"><button class="back-button" type="button" data-action="exit">← 設定に戻る</button><div class="play-quick"><span>${reviewMode?'復習':'問題'} ${index+1} / ${session.length}</span><span>正解 ${correctSoFar}問</span></div></div><div class="progress-outer" role="progressbar" aria-valuenow="${index+(isAnswered?1:0)}" aria-valuemin="0" aria-valuemax="${session.length}" aria-label="回答済み問題数"><div class="progress-inner" style="width:${p}%"></div></div><article class="question-card"><div class="question-header"><div class="question-topic"><span class="question-topic-icon" aria-hidden="true">${t.icon}</span>${escapeHTML(t.name)}</div><span class="question-type">${kind}</span></div><h2 class="prompt" id="questionTitle">Q${String(index+1).padStart(2,'0')}. ${escapeHTML(q.prompt)}</h2>${renderDiagram(q,t)}${options}${footer}</article></div>`;
    if(q.kind==='number'&&!isAnswered)$('numericAnswer')?.focus({preventScroll:true});
    announce(`${index+1}問目。${t.name}。${kind}。${isAnswered?'採点済み':''}`);
  }
  function selectOption(n){
    if(answered||!session.length)return;
    const q=session[index];if(q.kind==='number'||n<0||n>=q.options.length)return;
    if(q.kind==='single')chosen=new Set([n]);else if(chosen.has(n))chosen.delete(n);else chosen.add(n);
    document.querySelectorAll('.option-button').forEach((el,i)=>{const val=chosen.has(i);el.classList.toggle('selected',val);el.setAttribute('aria-pressed',String(val));});
    const error=$('answerError');if(error)error.textContent='';saveDraft();
  }
  function signature(q){return (q.templateId||'')+'|'+q.prompt+'|'+(q.diagram?.labels||[]).map(x=>x.text).join('|');}
  function submit(){
    if(answered||!session.length)return;
    const q=session[index],given=q.kind==='number'?($('numericAnswer')?.value??''):[...chosen];
    const evalResult=C.evaluate(q,given);
    if(!evalResult.valid){const error=$('answerError');if(error)error.textContent='選択肢を選ぶか、数値を入力してから判定してください。';announce('回答を入力してください。');return;}
    answered=true;answers[index]={correct:evalResult.correct,given,question:q};
    data.total++;if(evalResult.correct)data.correct++;
    const b=data.byTopic[q.topic]||{correct:0,total:0};b.total++;if(evalResult.correct)b.correct++;data.byTopic[q.topic]=b;
    if(!evalResult.correct){if(!data.mistakes.some(x=>signature(x)===signature(q)))data.mistakes.unshift(q);data.mistakes=data.mistakes.slice(0,150);}
    else data.mistakes=data.mistakes.filter(x=>signature(x)!==signature(q));
    save();saveDraft();sound(evalResult.correct);question();
    $('feedback')?.scrollIntoView({behavior:'instant',block:'nearest'});
    $('feedback')?.setAttribute('tabindex','-1');$('feedback')?.focus({preventScroll:true});
  }
  function next(){if(!answered)return;if(index>=session.length-1){finish();return;}index++;chosen=new Set();answered=false;showHint=false;pendingNumber='';saveDraft();question();window.scrollTo(0,0);}
  function finish(){
    const correct=answers.filter(a=>a.correct).length,total=session.length,accuracy=Math.round(100*correct/total);
    const record={date:new Date().toISOString(),topics:[...new Set(session.map(q=>q.topic))],mode:reviewMode?'review':settings.difficulty,total,correct,accuracy};
    data.history.unshift(record);data.history=data.history.slice(0,30);save();clearDraft();
    weakCurrent=answers.filter(a=>!a.correct).map(a=>a.question);
    const perTopic=[...new Set(session.map(q=>q.topic))].map(id=>{const subset=answers.filter(a=>a.question.topic===id);return `<li><span>${escapeHTML(topic(id).name)}</span><strong>${subset.filter(x=>x.correct).length} / ${subset.length}問</strong></li>`;}).join('');
    $('app').innerHTML=`<section class="result-hero" id="printArea"><div class="result-rank">学習結果</div><h1 class="result-title">${total}問おつかれさまでした</h1><p class="result-desc">答えだけでなく、考え方も確認してみましょう。</p><p class="print-name">クラス：____________　氏名：________________　実施日：____________</p><div class="result-stat-grid result-2"><div class="result-stat"><strong>${accuracy}%</strong><span>今回の正答率</span></div><div class="result-stat"><strong>${correct} / ${total}</strong><span>正解数</span></div></div><div class="result-actions no-print"><button class="primary-button" type="button" data-action="retry">もう一度解く</button><button class="secondary-button" type="button" data-action="home">分野を選び直す</button><button class="secondary-button" type="button" data-action="print">結果を印刷・PDF保存</button></div></section><section class="panel review-panel"><h3>分野別の結果</h3><ul class="topic-results">${perTopic}</ul></section><section class="panel review-panel no-print"><h3>${weakCurrent.length?'今回の間違いを確認':'全問正解です！'}</h3>${weakCurrent.length?`<div class="review-list">${weakCurrent.map(q=>`<div class="review-item"><p><b>${escapeHTML(topic(q.topic).name)}</b>：${escapeHTML(q.prompt)}</p><small>正解：${escapeHTML(C.correctText(q))}</small></div>`).join('')}</div><div class="side-actions"><button type="button" data-action="review-current" class="secondary-button">今回間違えた問題を復習</button></div>`:'<p class="muted">違う分野や難易度でも練習できます。</p>'}</section>`;
    window.scrollTo(0,0);announce(`学習終了。${total}問中${correct}問正解。`);
  }
  function history(){
    $('app').innerHTML=`<div class="quiz-layout"><div class="play-heading"><button type="button" class="back-button" data-action="home">← 設定に戻る</button><h2 class="panel-title">学習履歴</h2></div><section class="panel"><h3 class="panel-title" style="margin-bottom:18px">分野別の正答率</h3><div class="history-rows">${C.TOPICS.map(t=>{const x=data.byTopic[t.id]||{correct:0,total:0};const rate=x.total?Math.round(x.correct/x.total*100):0;return `<div><div class="topic-history"><b>${t.icon} ${escapeHTML(t.name)}</b><span>${x.total?`${x.correct}/${x.total}問 (${rate}%)`:'まだ解いていません'}</span></div><div class="progress-outer small-progress"><div class="progress-inner" style="width:${rate}%"></div></div></div>`;}).join('')}</div></section><section class="panel history-panel"><div class="panel-title-row"><h3 class="panel-title">最近の学習</h3><span class="muted">最大30回</span></div>${data.history.length?`<div class="history-rows">${data.history.map(h=>`<div class="history-row"><div><b>${escapeHTML(LABELS[h.mode]||'クイズ')} • ${Math.max(0,h.total)}問</b><small>${escapeHTML(formatDate(h.date))} / ${h.topics.length}分野</small></div><div class="history-score">${Math.round(h.accuracy)}%</div></div>`).join('')}</div>`:'<p class="empty-state">学習履歴はありません。まずは数問解いてみましょう。</p>'}</section><div class="side-actions"><button class="secondary-button" type="button" data-action="export">履歴をCSVで保存</button><button class="secondary-button" type="button" data-action="reset-stats">学習記録を削除</button></div><p class="hint-line">記録はこの端末のブラウザ内のみ。CSV出力・印刷したファイルの扱いは学校のルールに従ってください。</p></div>`;
  }
  function formatDate(d){const date=new Date(d);return Number.isFinite(date.getTime())?date.toLocaleString('ja-JP'):'不明';}
  function exportCSV(){const lines=[['日付','難易度','分野数','問題数','正解数','正答率(%)'],...data.history.map(h=>[formatDate(h.date),LABELS[h.mode]||'クイズ',h.topics.length,h.total,h.correct,h.accuracy])];const cell=x=>'"'+String(x).replace(/"/g,'""')+'"';const contents='\ufeff'+lines.map(row=>row.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='中3物理_学習履歴.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  function exitQuestion(){if(!session.length){home();return;}if(index<session.length-1||!answered){if(!window.confirm('学習を中断して設定画面に戻りますか？ 端末に保存できる場合は「続きから再開」で戻れます。'))return;}saveDraft();home();window.scrollTo(0,0);}
  document.addEventListener('click',event=>{
    const btn=event.target.closest('[data-action]');if(!btn||btn.disabled)return;
    const act=btn.dataset.action;
    switch(act){
      case 'topic':{const id=btn.dataset.topic;if(settings.topics.has(id))settings.topics.delete(id);else settings.topics.add(id);home();break;}
      case 'all':settings.topics=new Set(C.TOPICS.map(x=>x.id));home();break;
      case 'none':settings.topics.clear();home();break;
      case 'difficulty':settings.difficulty=btn.dataset.difficulty;home();break;
      case 'count-chip':setCount(btn.dataset.count);break;
      case 'increment':setCount(settings.count+1);break;
      case 'decrement':setCount(settings.count-1);break;
      case 'start':begin();break;
      case 'review':begin(true);break;
      case 'review-current':begin(true,weakCurrent);break;
      case 'resume':resume();break;
      case 'option':selectOption(Number(btn.dataset.option));break;
      case 'submit':submit();break;
      case 'hint':{showHint=!showHint;btn.setAttribute('aria-expanded',String(showHint));btn.textContent=showHint?'ヒントを閉じる':'💡 ヒントを見る';const hint=$('hintText');if(hint)hint.hidden=!showHint;saveDraft();break;}
      case 'next':next();break;
      case 'exit':exitQuestion();break;
      case 'home':home();window.scrollTo(0,0);break;
      case 'retry':begin(reviewMode);break;
      case 'history':history();break;
      case 'export':exportCSV();break;
      case 'print':window.print();break;
      case 'reset-stats':if(window.confirm('この端末に保存した学習履歴・復習候補をすべて削除しますか？ この操作は元に戻せません。')){data={...DEFAULT,sound:data.sound};save();history();}break;
    }
  });
  document.addEventListener('change',event=>{const e=event.target;if(e.id==='countInput'){settings.count=Math.max(1,Math.min(200,parseInt(e.value,10)||1));home();}else if(e.id==='extendedToggle'){settings.includeExtended=e.checked;}});
  document.addEventListener('input',event=>{if(event.target.id==='numericAnswer'){pendingNumber=event.target.value;saveDraft();}});
  document.addEventListener('keydown',event=>{
    if(event.target.id==='numericAnswer'&&event.key==='Enter'){event.preventDefault();submit();return;}
    if(event.target.tagName==='INPUT'||event.target.tagName==='BUTTON')return;
    if(!session.length||!document.querySelector('.question-card'))return;
    if(!answered&&/^[1-4]$/.test(event.key)&&session[index].kind!=='number'){event.preventDefault();selectOption(Number(event.key)-1);}
    if(event.key==='Enter'){event.preventDefault();answered?next():submit();}
  });
  $('brandHome').addEventListener('click',()=>{document.querySelector('.question-card')?exitQuestion():home();});
  $('soundToggle').addEventListener('click',()=>{data.sound=!data.sound;save();sound(true);});
  updateSound();home();
})();
