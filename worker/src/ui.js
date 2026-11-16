// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The web front-end: one static page served at / that reads /ps/briefs and /ps/criticality from this same Worker.
// All text from the API is escaped before it is rendered; the page never evaluates it.
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Practical Solutions</title>
<style>
:root{--bg:#fafaf7;--fg:#1c1c1a;--mut:#666;--card:#fff;--line:#e2e0d8;--ok:#1a7f37;--bad:#b42318;--acc:#0b5cad}
@media(prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mut:#9a9890;--card:#1f1f1c;--line:#34332e;--ok:#4cc26b;--bad:#f0746a;--acc:#6aaefc}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{margin:0 0 4px;font-size:1.6rem}h2{margin:32px 0 8px;font-size:1.15rem}
.sub{color:var(--mut);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;border:1px solid var(--line);font-size:.8rem;margin-right:6px}
.ok{color:var(--ok)}.bad{color:var(--bad)}.mut{color:var(--mut)}a{color:var(--acc)}
details summary{cursor:pointer;font-weight:600}details .md{margin-top:10px;font-size:.93rem}.md h1,.md h2,.md h3{font-size:1rem;margin:12px 0 4px}
.md ul{padding-left:20px;margin:6px 0}table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}
</style></head><body><main>
<h1>Practical Solutions</h1>
<p class="sub">Implementable solutions to pressing problems: what to do, what it takes, who can do it, and the cheapest first test. Each cites the published evidence it rests on, and says where it may not hold.</p>
<h2>Which problems, and why</h2><p class="mut" id="basis">Loading…</p><div id="probs" class="mut"></div>
<h2>Solutions</h2><div id="sols" class="mut">Loading…</div>
<h2>Candidate evidence the loop found</h2><p class="mut">Recent Cochrane reviews matching the highest-ranked problems, found by search. Unreviewed: nobody has judged whether they yield a solution.</p><div id="cands" class="mut">Loading…</div>
<h2>Evidence drafts that passed review</h2><p class="mut">Sentences quoted from a Cochrane abstract, then re-checked against the record by a separate step. They are evidence for a possible solution. What it takes, who acts and the first test still need a person.</p><div id="drafts" class="mut">Loading…</div>
<h2>What changed recently</h2><div id="chg" class="mut">Loading…</div>
<h2>Open leads from the loop</h2><p class="mut">Places the loop found doing better than their context predicts. These are hypotheses for people to check, not solutions.</p><div id="briefs" class="mut">Loading…</div>
<details><summary>Loop health</summary><div id="crit" class="mut">Loading…</div></details>
<p class="mut" id="foot"></p>
</main>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function md(src){
  const out=[];let list=false;
  for(const raw of String(src||'').split('\\n')){
    let l=esc(raw).replace(/\\*\\*(.+?)\\*\\*/g,'<b>$1</b>');
    const li=/^\\s*[-*] (.*)/.exec(l);
    if(li){if(!list){out.push('<ul>');list=true}out.push('<li>'+li[1]+'</li>');continue}
    if(list){out.push('</ul>');list=false}
    const h=/^(#{1,3}) (.*)/.exec(l);
    out.push(h?'<h'+h[1].length+'>'+h[2]+'</h'+h[1].length+'>':(l.trim()?'<p>'+l+'</p>':''));
  }
  if(list)out.push('</ul>');return out.join('');
}
async function get(p){const r=await fetch(p);if(!r.ok)throw new Error(p+' '+r.status);return r.json()}
function sol(x){return '<div class="card"><span class="pill">'+esc(x.problem)+'</span><h3 style="margin:8px 0 4px">'+esc(x.title)+'</h3><p style="margin:4px 0">'+esc(x.claim)+'</p>'+
 '<p style="margin:6px 0"><b>First test.</b> '+esc(x.first_test)+'</p><details><summary>Evidence, what it takes, limits</summary><div class="md">'+
 x.evidence.map(e=>'<p><b>'+esc(e.src)+'.</b> '+esc(e.finding)+'</p>').join('')+
 '<p><b>Worked where.</b> '+esc(x.works_where)+'</p><p><b>What it takes.</b> '+esc(x.takes)+'</p><p><b>Who can act.</b> '+esc(x.who)+'</p><p><b>Limits.</b> '+esc(x.limits)+'</p>'+
 '<p class="mut">Source check: '+esc(x.verified||'not yet checked')+' Seeded from the literature; check the cited source before relying on it.</p></div></details></div>'}
async function load(){
  let solutions=[];
  try{solutions=(await get('/solutions.json')).solutions;document.getElementById('sols').innerHTML=solutions.map(sol).join('')}catch(e){document.getElementById('sols').textContent='Could not load solutions: '+e.message}
  try{
    const pr=await get('/problems.json');
    document.getElementById('basis').textContent='How these were chosen: '+pr.basis;
    document.getElementById('probs').innerHTML='<table><tr><th>#</th><th>Problem</th><th>Now</th><th>Target</th><th>Gap</th><th>Solutions here</th></tr>'+pr.problems.map(x=>{
      const m=solutions.filter(y=>(y.problem_ids||[]).includes(x.id)).map(y=>esc(y.title)).join('; ')||'<span class="mut">none yet</span>';
      return '<tr><td>'+x.rank+'</td><td><b>'+esc(x.title)+'</b><div class="mut">'+esc(x.domain+' · '+x.unit)+'</div></td><td>'+(+x.value).toFixed(1)+' <span class="mut">('+x.year+')</span></td><td>'+(+x.target).toFixed(1)+'<div class="mut">'+esc(x.target_src)+'</div></td><td>'+Math.round(x.shortfall*100)+'%</td><td>'+m+'</td></tr>'}).join('')+'</table>'+(pr.unranked.length?'<p class="mut">No usable data this run: '+pr.unranked.map(u=>esc(u.title)).join(', ')+'.</p>':'');
  }catch(e){document.getElementById('basis').textContent='Could not load the problem ranking: '+e.message}
  try{const c=await get('/candidates.json');const ids=Object.keys(c);document.getElementById('cands').innerHTML=ids.length?ids.map(k=>'<div class="card"><span class="pill">'+esc(k)+'</span>'+c[k].items.map(i=>'<p style="margin:6px 0"><b>'+esc(i.title)+'</b> <span class="mut">('+esc(i.year)+(i.pmid?', PMID '+esc(i.pmid):'')+')</span><br><span class="mut">'+esc(i.abstract)+'</span></p>').join('')+'</div>').join(''):'<span class="mut">None yet; the first ticks are still running.</span>'}catch(e){document.getElementById('cands').textContent='Could not load candidates: '+e.message}
  try{const {drafts}=await get('/drafts.json');document.getElementById('drafts').innerHTML=drafts.length?drafts.map(d=>'<div class="card"><span class="pill">'+esc(d.problem)+'</span><b>'+esc(d.title)+'</b> <span class="mut">('+esc(d.year)+', PMID '+esc(d.pmid)+')</span>'+d.quotes.results.map(q=>'<p style="margin:6px 0">“'+esc(q)+'”</p>').join('')+d.quotes.conclusions.map(q=>'<p class="mut" style="margin:6px 0">“'+esc(q)+'”</p>').join('')+'<p class="mut">Review: '+esc(d.review)+'</p></div>').join(''):'<span class="mut">None yet.</span>'}catch(e){document.getElementById('drafts').textContent='Could not load drafts: '+e.message}
  try{const {changes,last_tick}=await get('/changes.json');document.getElementById('chg').innerHTML='<p class="mut">Last tick: '+esc(last_tick?last_tick.at:'none yet')+'</p>'+(changes.length?'<table>'+changes.slice(0,25).map(x=>'<tr><td class="mut">'+esc(String(x.at).slice(0,16))+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.id||x.problem||'')+' '+esc(x.status||x.title||x.error||'')+'</td></tr>').join('')+'</table>':'<span class="mut">No changes recorded yet.</span>')}catch(e){document.getElementById('chg').textContent='Could not load changes: '+e.message}
  try{
    const {briefs}=await get('/ps/briefs');
    document.getElementById('briefs').innerHTML=briefs.length?briefs.map(b=>
      '<div class="card"><details><summary>'+esc(b.name||b.unit)+' <span class="pill">z '+(+b.z).toFixed(2)+'</span><span class="mut">'+esc(String(b.published_at||'').slice(0,10))+'</span></summary><div class="md">'+md(b.markdown)+'</div></details></div>').join(''):'<span class="mut">No leads published yet.</span>';
  }catch(e){document.getElementById('briefs').textContent='Could not load briefs: '+e.message}
  try{
    const c=await get('/ps/criticality');
    const t=Array.isArray(c.tests)?c.tests:[];
    document.getElementById('crit').innerHTML='<div class="card"><b class="'+(c.critical?'ok':'bad')+'">'+(c.critical?'Critical: all tests pass':'Not yet critical')+'</b>'+
      '<table>'+t.map(x=>'<tr><td>'+esc(x.id)+'</td><td class="'+(x.status==='pass'?'ok':x.status==='fail'?'bad':'mut')+'">'+esc(x.status||'unmeasured')+'</td><td>'+esc(x.name||'')+'<div class="mut">'+esc('need: '+(x.need||'')+(x.value!==undefined?' · now: '+(typeof x.value==='object'?JSON.stringify(x.value):x.value):''))+'</div></td></tr>').join('')+'</table></div>';
  }catch(e){document.getElementById('crit').textContent='Could not load criticality: '+e.message}
  document.getElementById('foot').textContent='Live from this Worker. Updated '+new Date().toISOString().slice(0,19)+'Z';
}
load();
</script></body></html>`;
