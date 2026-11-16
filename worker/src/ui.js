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
<p class="sub">An autonomous loop that finds units doing better than their context predicts, checks each with an independent method, and scores its own predictions. Everything below is a lead to check, not a finding to copy.</p>
<h2>Briefs</h2><div id="briefs" class="mut">Loading…</div>
<h2>Criticality</h2><div id="crit" class="mut">Loading…</div>
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
async function load(){
  try{
    const {briefs}=await get('/ps/briefs');
    document.getElementById('briefs').innerHTML=briefs.length?briefs.map(b=>
      '<div class="card"><details><summary>'+esc(b.name||b.unit)+' <span class="pill">z '+(+b.z).toFixed(2)+'</span><span class="mut">'+esc(String(b.published_at||'').slice(0,10))+'</span></summary><div class="md">'+md(b.markdown)+'</div></details></div>').join(''):'<span class="mut">No published briefs yet. The loop publishes only what passes the independent check.</span>';
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
