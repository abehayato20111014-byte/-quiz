/* Physics Quest Arena - question engine. No network or dependencies. */
(function (global) {
  'use strict';
  const TOPICS = [
    {id:'water', name:'水圧', icon:'💧', color:'#56d2f6', sub:'深さ・水圧・圧力'},
    {id:'vectors', name:'力の合成と分解', icon:'↗', color:'#ad95ff', sub:'合力・向き・成分'},
    {id:'forceMotion', name:'運動と力のはたらき', icon:'⚡', color:'#f7b86b', sub:'合力と運動の変化'},
    {id:'horizontal', name:'水平面上の運動', icon:'→', color:'#62dab3', sub:'速さ・等速直線運動'},
    {id:'incline', name:'斜面上の運動', icon:'◢', color:'#ef90aa', sub:'斜面方向の力'},
    {id:'reaction', name:'作用・反作用', icon:'⇄', color:'#92b5ff', sub:'2物体に働く力'},
    {id:'work', name:'仕事', icon:'▣', color:'#ffd27c', sub:'力と移動距離'},
    {id:'kinetic', name:'運動エネルギー', icon:'◉', color:'#f89a8d', sub:'質量と速さ'},
    {id:'potential', name:'位置エネルギー', icon:'↑', color:'#9fd0ad', sub:'高さと重力'},
    {id:'mechanical', name:'力学的エネルギー', icon:'✦', color:'#c69bf1', sub:'エネルギーの保存'},
  ];
  const REG = [];
  // 数式が中学校の通常学習から外れる場合は、本人が明示的にオンにしたときのみ出題。
  const EXTENDED_IDS = new Set(['water_depth','water_find_depth','water_area','vec_orthogonal','k_speed_ratio','k_formula','k_compare']);
  function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
  function pick(a){return a[ri(0,a.length-1)];}
  function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=ri(0,i);[x[i],x[j]]=[x[j],x[i]];}return x;}
  function fmt(v){return Number.isInteger(v)?String(v):String(Number(v.toFixed(5)));}
  function add(topic, id, level, generator){REG.push({topic,id,level,generator,extended:EXTENDED_IDS.has(id)});}
  function diagram(name, labels=[]){return {src:'assets/diagrams/'+name+'.png', labels:labels.map((text,i)=>({text:String(text),x:82,y:25+i*19}))};}
  function qBase(kind,prompt,scene,explanation,hint){return {kind,prompt,diagram:scene,explanation,hint};}
  function choice(prompt,scene,correct,wrong,unit,explanation,hint){
    const display=v=>fmt(v)+(unit?' '+unit:'');
    const raw=[correct,...wrong.filter(v=>Math.abs(v-correct)>1e-9)];
    const uniq=[...new Set(raw.map(display))];
    let n=1;
    while(uniq.length<4){const v=correct+(((n%2)?1:-1)*Math.ceil(n/2)*(Math.abs(correct)>10?10:1));if(v>=0&&!uniq.includes(display(v)))uniq.push(display(v));n++;}
    const opts=shuffle(uniq.slice(0,4));
    return {...qBase('single',prompt,scene,explanation,hint),options:opts,answers:[opts.indexOf(display(correct))]};
  }
  function textChoice(prompt,scene,correct,wrong,explanation,hint){
    const opts=shuffle([correct,...wrong]);
    return {...qBase('single',prompt,scene,explanation,hint),options:opts,answers:[opts.indexOf(correct)]};
  }
  function multi(prompt,scene,entries,explanation,hint){
    const opts=shuffle(entries.map(([text,yes])=>({text,yes})));
    return {...qBase('multi',prompt,scene,explanation,hint),options:opts.map(x=>x.text),answers:opts.flatMap((x,i)=>x.yes?[i]:[])};
  }
  function number(prompt,scene,answer,unit,explanation,hint){
    return {...qBase('number',prompt,scene,explanation,hint),answer,unit};
  }
  function templatesFor(topics,mode,includeExtended=false){
    const levels = mode === 'basic'?[1]:mode==='standard'?[1,2]:mode==='challenge'?[2,3]:[1,2,3];
    return REG.filter(t=>topics.includes(t.topic)&&levels.includes(t.level)&&(includeExtended||!t.extended));
  }
  function makeSession(topics,count,mode='mix',review=[],includeExtended=false){
    if (review && review.length) return shuffle(review).slice(0,count).map((item,i)=>({...item,uid:'review-'+i+'-'+Date.now()}));
    const pool=templatesFor(topics,mode,includeExtended);
    if(!pool.length) throw new Error('選択できる問題がありません。');
    const grouped = topics.map(topic=>pool.filter(t=>t.topic===topic)).filter(g=>g.length);
    const all=[],seen=new Set();let lastId='';
    for(let i=0;i<count;i++){
      const group=grouped[i%grouped.length];
      let result=null;
      for(let tries=0;tries<140;tries++){
        const possible=tries<6?group.filter(t=>t.id!==lastId):group;
        const temp=pick(possible.length?possible:group);
        const candidate=temp.generator();
        const fingerprint=temp.id+'|'+candidate.prompt+'|'+candidate.diagram.labels.map(x=>x.text).join('|');
        if(!seen.has(fingerprint)||tries===139){
          result={...candidate,topic:temp.topic,templateId:temp.id,level:temp.level,uid:'q'+i+'-'+Math.random().toString(36).slice(2,9)};
          seen.add(fingerprint);lastId=temp.id;break;
        }
      }
      all.push(result);
    }
    return shuffle(all);
  }
  function evaluate(q,answer){
    if(q.kind==='number'){
      const cleaned=String(answer).trim().replace(/[０-９．－]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/,/g,'').replace(/，/g,'');
      if(cleaned==='')return {valid:false,correct:false};
      const x=Number(cleaned);
      if(!Number.isFinite(x))return {valid:false,correct:false};
      return {valid:true,correct:Math.abs(x-q.answer)<=Math.max(0.00001,Math.abs(q.answer)*0.000001)};
    }
    const nums=Array.isArray(answer)?answer:[answer];
    if(!nums.length)return {valid:false,correct:false};
    const got=[...new Set(nums.map(Number))].sort((a,b)=>a-b), wanted=[...q.answers].sort((a,b)=>a-b);
    return {valid:true,correct:got.length===wanted.length&&got.every((v,i)=>v===wanted[i])};
  }
  function correctText(q){return q.kind==='number'?fmt(q.answer)+(q.unit?' '+q.unit:''):q.answers.map(i=>q.options[i]).join(' ／ ');}
  const api={TOPICS,REG,add,ri,pick,shuffle,fmt,diagram,choice,textChoice,multi,number,makeSession,evaluate,correctText,templatesFor};
  global.QuizCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
