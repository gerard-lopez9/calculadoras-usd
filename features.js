const storageKey = 'calculadoras-usd-v1';
const fields = ['strategy','extra','principal','rate','term','start','day','monthly','annual','annualMonth','life','damage','mode'];
let savedScenarios = [];
function capturePlan() {
  return {
    fields: Object.fromEntries(fields.map(id => [id,get(id).value])),
    debts: [...get('debts').rows].map(row => [...row.querySelectorAll('input')].map(input => input.value)),
    overrides: [...overrides],
    tab: get('home').hidden ? 'debt' : 'home'
  };
}
function restorePlan(state) {
  if (!state || !state.fields || !Array.isArray(state.debts)) return;
  for (const id of fields) if (typeof state.fields[id] === 'string') get(id).value = state.fields[id];
  get('debts').replaceChildren();
  for (const row of state.debts) if (Array.isArray(row) && row.length === 4) addDebt(row);
  overrides.clear();
  for (const [month,value] of state.overrides || []) {
    if (Number.isInteger(month) && Number.isFinite(value) && value >= 0) overrides.set(month,value);
  }
  get(state.tab === 'home' ? 'showHome' : 'showDebt').click();
  updateMortgage();
  if (get('debtForm').checkValidity()) get('debtForm').requestSubmit();
}
function persistPlan() {
  try {
    localStorage.setItem(storageKey,JSON.stringify({current:capturePlan(),scenarios:savedScenarios}));
    get('saveStatus').dataset.error='false';
    get('saveStatus').textContent = 'Guardado automáticamente en este dispositivo.';
  } catch {
    get('saveStatus').dataset.error='true';
    get('saveStatus').textContent = 'El navegador no permite guardar. Descarga tu tabla antes de cerrar.';
  }
}
function currentSummary() {
  const home = !get('home').hidden;
  if (!get(home ? 'mortgage' : 'debtForm').reportValidity()) return null;
  if (home) updateMortgage(); else get('debtForm').requestSubmit();
  const result = get(home ? 'homeResult' : 'debtResult');
  if (!result.querySelector('.stats')) return null;
  const stats = [...result.querySelectorAll('.stats strong')].map(node => node.textContent);
  return {type:home?'Hipoteca':'Deudas',time:stats[home?1:0],interest:stats[home?2:1],total:stats[home?3:2]};
}
function renderSavedPlans() {
  get('planList').replaceChildren();
  for (const item of savedScenarios) {
    const row = document.createElement('p');
    const open = document.createElement('button');
    open.textContent = 'Abrir ' + item.name;
    open.onclick = () => {restorePlan(item.state);persistPlan();};
    const remove = document.createElement('button');
    remove.textContent = 'Eliminar';
    remove.setAttribute('aria-label','Eliminar '+item.name);
    remove.onclick = () => {savedScenarios=savedScenarios.filter(plan=>plan!==item);persistPlan();renderSavedPlans();};
    row.append(open,' ',remove);
    get('planList').append(row);
  }
  const comparison = document.createElement('table');
  const heading = comparison.createTHead().insertRow();
  for (const title of ['Escenario','Tipo','Plazo','Intereses','Total']) {
    const cell=document.createElement('th');cell.textContent=title;heading.append(cell);
  }
  const body=comparison.createTBody();
  for(const plan of savedScenarios){
    const row=body.insertRow();
    for(const value of [plan.name,plan.summary.type,plan.summary.time,plan.summary.interest,plan.summary.total]) row.insertCell().textContent=typeof value==='string'&&value!==plan.name?value.replace(/USD[\s\u00a0]*/g,'$'):value;
  }
  get('comparison').replaceChildren(comparison);
}
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if(stored){
    savedScenarios=Array.isArray(stored.scenarios)?stored.scenarios.filter(item=>item.state&&item.summary&&typeof item.name==='string'):[];
    restorePlan(stored.current);
  }
} catch {get('saveStatus').textContent='No se pudieron recuperar los datos guardados.';}
renderSavedPlans();
document.addEventListener('input',event=>{if(event.target.closest('form'))persistPlan();});
document.addEventListener('change',event=>{if(event.target.closest('#schedule'))persistPlan();});
// Capture before a removed debt row leaves the document; save after its handler.
document.addEventListener('click',event=>{if(event.target.closest('#debts button,#add,nav button'))setTimeout(persistPlan,0);},true);
get('savePlan').onclick=()=>{
  const summary=currentSummary();if(!summary)return;
  savedScenarios.push({name:get('planName').value.trim()||'Plan '+(savedScenarios.length+1),state:capturePlan(),summary});
  persistPlan();renderSavedPlans();
  get('saveStatus').textContent='Escenario guardado en este dispositivo.';
  if(!motionPreference.matches&&!document.documentElement.classList.contains('keyboard-nav')){
    get('saveStatus').getAnimations().forEach(animation=>animation.cancel());
    get('saveStatus').animate([{opacity:.5},{opacity:1}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
};
get('exportPlan').onclick=()=>{
  if(!currentSummary())return;
  let rows;
  if(!get('home').hidden){
    rows=[...get('schedule').querySelectorAll('tr')].map(row=>[...row.children].map(cell=>{
      const input=cell.querySelector('input');
      return input ? input.value || input.placeholder : cell.textContent;
    }));
  }else{
    const debts=capturePlan().debts.map(([name,balance,rate,minimum])=>({name,balance:Number(balance),rate:Number(rate),minimum:Number(minimum)})).filter(d=>d.balance>0);
    const plan=payoff(debts,num('extra'),get('strategy').value);
    if(!plan)return;
    rows=[['Mes','Saldo inicial $','Interés $','Pago $','Saldo final $'],...plan.schedule];
    rows.push(['Estrategia',get('strategy').selectedOptions[0].textContent],['Extra mensual $',get('extra').value]);
    rows.push(['Resultado',get('debtResult').innerText]);
  }
  const safeCell=value=>{
    const text=String(value);
    const safe=/^[=+@-]/.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  const csv=rows.map(row=>row.map(safeCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='plan-usd.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
};
if('serviceWorker' in navigator && location.protocol==='https:'){
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>{
    get('offlineStatus').textContent='Listo para usar sin conexión en este dispositivo.';
  }).catch(()=>{get('offlineStatus').textContent='No se pudo preparar el modo sin conexión. Abre de nuevo con internet.';});
}else get('offlineStatus').textContent='Abre la versión publicada para activar el modo sin conexión.';

