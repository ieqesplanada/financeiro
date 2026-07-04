// ============================================================
// API
// ============================================================
// API — com fallback para fila offline
// ============================================================
const API_URL = "https://script.google.com/macros/s/AKfycbwkn9bpHqL-ksZXw0UJjNEwUbUv_8d0c3-zxR0zfmTQLK0Ls0MuEpc5nGDvXEllolbu/exec";

async function apiGet(sheet) {
  const url = `${API_URL}?sheet=${encodeURIComponent(sheet)}&action=getAll`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (text.trim().startsWith('<!') || text.trim().startsWith('<html'))
    throw new Error('API retornou HTML (serviço indisponível)');
  const json = JSON.parse(text);
  if (!json.ok) throw new Error(json.error || 'Erro desconhecido');
  return json.data || [];
}

async function apiSave(sheet, data) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'save', sheet, data })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Erro ao salvar');
  return json.data;
}

async function apiUpdate(sheet, id, data) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'update', sheet, id, data })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Erro ao atualizar');
  return json.data;
}

async function apiDelete(sheet, id) {
  const url = `${API_URL}?action=delete&sheet=${encodeURIComponent(sheet)}&id=${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Erro ao excluir');
  return json.data;
}

// ── Versões seguras (com fila offline automática) ─────────────
async function apiSaveSeguro(sheet, data) {
  try {
    return await apiSave(sheet, data);
  } catch (err) {
    const opId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    enfileirarOperacao({ action: 'save', sheet, data: { ...data, _tmpId: opId }, id: opId });
    return { id: opId, _offline: true };
  }
}

async function apiUpdateSeguro(sheet, id, data) {
  try {
    return await apiUpdate(sheet, id, data);
  } catch (err) {
    enfileirarOperacao({ action: 'update', sheet, id, data });
    throw err; // deixa o chamador tratar visualmente
  }
}

async function apiDeleteSeguro(sheet, id) {
  try {
    return await apiDelete(sheet, id);
  } catch (err) {
    enfileirarOperacao({ action: 'delete', sheet, id, data: { id } });
    throw err;
  }
}


  // ============================================================
  // SESSÃO / LOGIN
  // ============================================================
  const SESSION_KEY = 'ieq_session';
  const SESSION_TTL = 8 * 60 * 60 * 1000;

  let SESSAO = null;

  const PERMISSOES = {
    podeEditar:  ['admin','tesoureiro'],
    podeExcluir: ['admin','tesoureiro'],
    podeLancar:  ['admin','tesoureiro'],
    podeConfig:  ['admin'],
  };

  function temPermissao(acao) {
    if (!SESSAO) return false;
    return (PERMISSOES[acao] || []).includes(SESSAO.permissao);
  }

  function salvarSessao(dados) {
    const sessao = { ...dados, loginEm: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    SESSAO = sessao;
  }

  function carregarSessao() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.loginEm > SESSION_TTL) { localStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch { return null; }
  }

  function limparSessao() { localStorage.removeItem(SESSION_KEY); SESSAO = null; }

  // ============================================================
  // LOGIN
  // ============================================================
  function toggleSenha() {
    const inp = document.getElementById('loginPass');
    const icon = document.getElementById('togglePassIcon');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
  }

  function mostrarErroLogin(msg) {
    const el = document.getElementById('loginErro');
    document.getElementById('loginErroMsg').textContent = msg;
    el.classList.add('active');
    document.getElementById('loginUser').classList.add('erro');
    document.getElementById('loginPass').classList.add('erro');
  }

  function limparErroLogin() {
    document.getElementById('loginErro').classList.remove('active');
    document.getElementById('loginUser').classList.remove('erro');
    document.getElementById('loginPass').classList.remove('erro');
  }

  async function efetuarLogin(e) {
    e.preventDefault();
    limparErroLogin();
    const login = document.getElementById('loginUser').value.trim();
    const senha = document.getElementById('loginPass').value;
    const lembrar = document.getElementById('lembrarUser').checked;
    const btn = document.getElementById('btnLogin');
    if (!login || !senha) { mostrarErroLogin('Preencha usuário e senha.'); return; }
    if (lembrar) localStorage.setItem('ieq_lembrar_user', login);
    else localStorage.removeItem('ieq_lembrar_user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Verificando...';
    try {
      const url = `${API_URL}?action=login&login=${encodeURIComponent(login)}&senha=${encodeURIComponent(senha)}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.ok) { salvarSessao({ nome: json.nome, permissao: json.permissao }); entrarNoSistema(); }
      else { mostrarErroLogin(json.erro || 'Usuário ou senha incorretos.'); document.getElementById('loginPass').value = ''; document.getElementById('loginPass').focus(); }
    } catch (err) { mostrarErroLogin('Erro de conexão. Verifique sua internet.'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Entrar'; }
  }

  function entrarNoSistema() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('appRoot').style.display = 'block';
    aplicarPermissoesUI();
    inicializarSistema();
  }

  function logout() {
    if (!confirm('Deseja sair do sistema?')) return;
    limparSessao();
    document.getElementById('appRoot').style.display = 'none';
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('loginPass').value = '';
    document.getElementById('loginUser').value = localStorage.getItem('ieq_lembrar_user') || '';
    limparErroLogin();
    showNotification('👋 Sessão encerrada.', 'info');
  }

  // ============================================================
  // PERMISSÕES
  // ============================================================
  function aplicarPermissoesUI() {
    if (!SESSAO) return;
    const { nome, permissao } = SESSAO;
    document.getElementById('sidebarUserNome').textContent = nome;
    const permLabels = { admin:'Admin', tesoureiro:'Tesoureiro', visualizador:'Visualizador' };
    const permClasses = { admin:'perm-admin', tesoureiro:'perm-tesoureiro', visualizador:'perm-visualizador' };
    document.getElementById('sidebarUserPerm').innerHTML =
      `<span class="perm-badge ${permClasses[permissao]||'perm-visualizador'}">
         <i class="fas fa-${permissao==='admin'?'crown':permissao==='tesoureiro'?'briefcase':'eye'} text-xs"></i>
         ${permLabels[permissao]||permissao}
       </span>`;
    const podeLancar = temPermissao('podeLancar');
    const podeConfig = temPermissao('podeConfig');
    const setVisivel = (id, visivel) => { const el = document.getElementById(id); if (el) el.style.display = visivel ? '' : 'none'; };
    setVisivel('btnNovoCulto', podeLancar);
    setVisivel('btnNovaEntrada', podeLancar);
    setVisivel('btnNovaDespesa', podeLancar);
    setVisivel('cardUsuarios', podeConfig);
  }

  // ============================================================
  // DB LOCAL
  // ============================================================
  const DB = {
    historico: [
      { mes:1, ano:2026, nome:'Janeiro',   saldoAnt:0,       entradas:2641.82, saidas:2641.82, saldoFinal:0,       ceia:56 },
      { mes:2, ano:2026, nome:'Fevereiro', saldoAnt:0,       entradas:4022.91, saidas:2963.70, saldoFinal:1181.61, ceia:44 },
      { mes:3, ano:2026, nome:'Março',     saldoAnt:1181.61, entradas:4172.40, saidas:4023.12, saldoFinal:1330.89, ceia:53 },
      { mes:4, ano:2026, nome:'Abril',     saldoAnt:1330.89, entradas:4235.18, saidas:4253.26, saldoFinal:1312.81, ceia:60 },
      { mes:5, ano:2026, nome:'Maio',      saldoAnt:1312.81, entradas:3483.14, saidas:3335.42, saldoFinal:1217.53, ceia:60 },
    ],

    despesas:[], cultos:[], entradas:[], config:{},
    saveLocal() {
      try {
        localStorage.setItem('despesas_cache', JSON.stringify(this.despesas));
        localStorage.setItem('cultos_cache',   JSON.stringify(this.cultos));
        localStorage.setItem('entradas_cache', JSON.stringify(this.entradas));
      } catch(e){}
    },
    loadLocal() {
      try {
        this.despesas = JSON.parse(localStorage.getItem('despesas_cache')||'[]');
        this.cultos   = JSON.parse(localStorage.getItem('cultos_cache')  ||'[]');
        this.entradas = JSON.parse(localStorage.getItem('entradas_cache')||'[]');
        this.config   = JSON.parse(localStorage.getItem('ieq_config')    ||'{}');
      } catch(e){ this.despesas=[]; this.cultos=[]; this.entradas=[]; this.config={}; }
    }
  };
  // ============================================================
  // NORMALIZAÇÃO
  // ============================================================
  function normalizarCulto(c) {
    return { ...c,
      totalDizimos:parseFloat(c.totalDizimos)||0,
      totalOfertas:parseFloat(c.totalOfertas)||0,
      // CORREÇÃO 1: totalArrecadado = dizimos + ofertas (SEM missões)
      totalArrecadado:parseFloat(c.totalArrecadado)||0,
      missoes:parseFloat(c.missoes)||0,
      especiais:parseFloat(c.especiais)||0,
      outras:parseFloat(c.outras)||0,
      presentes:parseInt(c.presentes)||0,
      visitantes:parseInt(c.visitantes)||0,
      criancas:parseInt(c.criancas)||0,
      caixaLocal:parseFloat(c.caixaLocal)||0,
      contaCorrente:parseFloat(c.contaCorrente)||0,
      dizimistas:parseJsonSafe(c.dizimistas,[]),
      ofertas:parseJsonSafe(c.ofertas,[]),
      observacoes: c.observacoes || '',
    };
  }
  function normalizarDespesa(d){
  // Garante que a data fique no formato yyyy-mm-dd para o input[type=date]
  let dataNormalizada = (d.data || '');
  if (dataNormalizada && dataNormalizada.includes('T')) {
    dataNormalizada = dataNormalizada.split('T')[0];
  }
  return {...d, valor:parseFloat(d.valor)||0, data: dataNormalizada};
}

  function normalizarEntrada(e){ return {...e, valor:parseFloat(e.valor)||0}; }
  function parseJsonSafe(v,f){ if(Array.isArray(v))return v; try{return JSON.parse(v)||f;}catch{return f;} }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================
 function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#096;')
        .replace(/\\/g, '&#092;');
}


  const fmt     = v=>(parseFloat(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtDate = d => {
  if (!d) return '-';
  const dateStr = String(d).split('T')[0];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, day] = parts.map(Number);
    const date = new Date(y, m - 1, day);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  }
  return '-';
};

  function monthKeyFromDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  function monthLabel(mk){
    const [y,m]=mk.split('-').map(Number);
    return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}).replace('.','').replace(/^\w/,c=>c.toUpperCase());
  }
  function prevMonthKey(mk){ const[y,m]=mk.split('-').map(Number); return monthKeyFromDate(new Date(y,m-2,1)); }

function getSegundoDomingoDoMes(mk){
    if (!mk || typeof mk !== 'string' || !mk.includes('-')) {
        console.error('getSegundoDomingoDoMes: parâmetro inválido:', mk);
        return null;
    }

    const [y, m] = mk.split('-').map(Number);
    if (isNaN(y) || isNaN(m)) {
        console.error('getSegundoDomingoDoMes: ano/mês inválidos:', {mk, y, m});
        return null;
    }

    let primeiroDom = null;
    for (let d = 1; d <= 7; d++) {
        if (new Date(y, m - 1, d).getDay() === 0) {
            primeiroDom = d;
            break;
        }
    }

    const segundo = primeiroDom + 7;
    const resultado = `${y}-${String(m).padStart(2,'0')}-${String(segundo).padStart(2,'0')}`;

    console.log('getSegundoDomingoDoMes:', {mk, y, m, primeiroDom, segundo, resultado});
    return resultado;
}


 function getPresentesCeia(mk){
    const segundoDom = getSegundoDomingoDoMes(mk);
    if(!segundoDom) return {presentes:0, data:null, encontrado:false};
    
    const cultos = getCultosMes(mk);
    if(!cultos.length) return {presentes:0, data:segundoDom, encontrado:false};
    
    // ✅ Comparação normalizada (ignora timestamp se existir)
    const exato = cultos.find(c => {
        const cd = String(c.data || '').split('T')[0]; // "2026-06-14T..." → "2026-06-14"
        return cd === segundoDom;
    });
    
    if(exato) return {presentes:exato.presentes||0, data:exato.data, encontrado:true};
    
    // ❌ REMOVIDO: busca por cultos próximos (dias 8-14)
    // Agora só conta se houver culto EXATAMENTE no 2º domingo
    
    return {presentes:0, data:segundoDom, encontrado:false};
}


  let GLOBAL_MONTH = monthKeyFromDate(new Date());

  function setGlobalMonth(mk){
    GLOBAL_MONTH=mk;
    ['filtroEntradaMes','filtroDespesaMes','filtroCultoMes'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=mk; });
    updatePageSubtitleForMonth();
    const p=document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard';
    if(p==='dashboard')     renderDashboard();
    if(p==='culto')         renderCultos();
    if(p==='entradas')      renderEntradas();
    if(p==='despesas')      filtrarDespesas();
    if(p==='distribuicoes') renderDistribuicoesMes();
  }

  function updatePageSubtitleForMonth(){
    const a=document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard';
    const map={
      dashboard:['Dashboard',`Visão geral financeira — ${monthLabel(GLOBAL_MONTH)}`],
      culto:['Relatório de Culto','REFC — Registro e sincronização'],
      entradas:['Entradas','Registro de arrecadações'],
      despesas:['Despesas','Controle de saídas financeiras'],
      distribuicoes:['Distribuições','Taxas e repasses obrigatórios'],
      relatorios:['Relatórios','Análises e exportações'],
      historico:['Histórico','Dados históricos 2026'],
      configuracoes:['Configurações','Logo, dados da igreja e sistema'],
    };
    document.getElementById('pageTitle').textContent   =map[a]?.[0]||a;
    document.getElementById('pageSubtitle').textContent=map[a]?.[1]||'';
  }

  function buildGlobalMonthOptions(){
    const sel=document.getElementById('globalMonthSelector'); if(!sel)return;
    const now=new Date(),opts=[];
    for(let i=12;i>=0;i--) opts.push(monthKeyFromDate(new Date(now.getFullYear(),now.getMonth()-i,1)));
    opts.push(monthKeyFromDate(new Date(now.getFullYear(),now.getMonth()+1,1)));
    sel.innerHTML=opts.map(mk=>`<option value="${mk}">${monthLabel(mk)}</option>`).join('');
    sel.value=GLOBAL_MONTH;
  }

  function mostrarLoading(show){ document.getElementById('loadingOverlay').classList.toggle('hidden',!show); }

  function showNotification(msg,type='success'){
    const n=document.createElement('div');
    n.className=`notification notif-${type}`;
    n.innerHTML=`<i class="fas fa-${type==='success'?'check-circle':type==='error'?'times-circle':type==='warning'?'exclamation-triangle':'info-circle'} mr-2"></i>${msg}`;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(),4000);
  }

  function openModal(id) {
    if(['modalNovoCulto','modalNovaDespesa','modalNovaEntrada','modalAlterarDespesa'].includes(id) && !temPermissao('podeLancar')) {
      showNotification('🔒 Sem permissão para esta ação.','error');
      return;
    }
    document.getElementById(id).classList.add('active');
  }
  function closeModal(id){ document.getElementById(id).classList.remove('active'); }
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('active'); });
  });

    function closeModal(id){ document.getElementById(id).classList.remove('active'); }
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('active'); });
  });

  // ===== COLE AQUI A FUNÇÃO NOVA =====
  function confirmarExclusao(mensagem, callback) {
    document.getElementById('msgConfirmarExclusao').textContent =
      mensagem || 'Esta ação não pode ser desfeita.';

    const btnOk = document.getElementById('btnConfirmarExclusaoOk');
    const novoBtn = btnOk.cloneNode(true);
    btnOk.parentNode.replaceChild(novoBtn, btnOk);

    novoBtn.addEventListener('click', () => {
      closeModal('modalConfirmarExclusao');
      callback();
    });

    document.getElementById('modalConfirmarExclusao').classList.add('active');
  }
  // ===== FIM DA FUNÇÃO NOVA =====


  function setBtnLoading(id,loading,label='Salvar'){
    const btn=document.getElementById(id); if(!btn)return;
    btn.disabled=loading;
    btn.innerHTML=loading?'<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...':`<i class="fas fa-save mr-2"></i>${label}`;
  }

  // ============================================================
  // NAVEGAÇÃO
  // ============================================================
  function showPage(page){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const pEl=document.getElementById(`page-${page}`),nEl=document.getElementById(`nav-${page}`);
    if(!pEl)return;
    pEl.classList.add('active'); if(nEl)nEl.classList.add('active');
    updatePageSubtitleForMonth();
    if(window.innerWidth<1024) closeSidebar();
    if(page==='dashboard')    renderDashboard();
    if(page==='culto')        renderCultos();
    if(page==='despesas')     {
  _categoriasVisiveis = true;  // ← GARANTE visibilidade
  const body = document.getElementById('categoriasDespesasBody');
  if (body) { body.style.maxHeight = '500px'; body.style.opacity = '1'; }
  const icon = document.getElementById('iconeToggleCategorias');
  if (icon) icon.style.transform = 'rotate(0deg)';
  filtrarDespesas(); renderCategoriasDespesas();
}

    if(page==='entradas')     renderEntradas();
    if(page==='historico')    renderHistorico();
    if(page==='relatorios')   renderRelatorios();
    if(page==='distribuicoes')renderDistribuicoesMes();
    if(page==='configuracoes')renderConfiguracoes();
  }
  function toggleSidebar(){
    const s=document.getElementById('sidebar'),o=document.getElementById('sidebarOverlay');
    const open=s.classList.contains('open');
    s.classList.toggle('open',!open); o.classList.toggle('active',!open);
  }
  function closeSidebar(){
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
  }
  function setSyncStatus(st){
    const el=document.getElementById('syncStatus');
    const c={syncing:{color:'bg-yellow-400',text:'Sincronizando...'},synced:{color:'bg-green-400',text:'Sincronizado'},error:{color:'bg-red-400',text:'Erro de conexão'}};
    const cf=c[st]||c.synced;
    el.innerHTML=`<div class="w-2 h-2 ${cf.color} rounded-full sync-pulse"></div><span class="text-gray-600 text-xs">${cf.text}</span>`;
  }
  function changeGlobalMonth(){
    const v=document.getElementById('globalMonthSelector').value;
    setGlobalMonth(v);
    showNotification(`📅 Mês: ${monthLabel(v)}`,'info');
  }

  // ============================================================
  // LOGO
  // ============================================================
  let _logoBase64Temp=null;

  function handleLogoUpload(e){
    const file=e.target.files[0]; if(!file)return;
    if(file.size>2*1024*1024){showNotification('❌ Imagem muito grande. Máx 2MB.','error');return;}
    const r=new FileReader();
    r.onload=ev=>{ _logoBase64Temp=ev.target.result; mostrarPreviewLogo(_logoBase64Temp); };
    r.readAsDataURL(file);
  }
  function handleLogoDrop(e){
    e.preventDefault();
    const file=e.dataTransfer.files[0];
    if(!file||!file.type.startsWith('image/')){showNotification('❌ Arquivo inválido.','error');return;}
    handleLogoUpload({target:{files:[file]}});
  }
  function mostrarPreviewLogo(src){
    document.getElementById('logoPreviewIcon').style.display='none';
    const img=document.getElementById('logoPreviewImg');
    img.src=src; img.style.display='block';
    document.getElementById('logoPreviewLabel').textContent='Logo carregada — clique em Salvar';
    document.getElementById('btnRemoverLogo').style.display='inline-flex';
  }
  function salvarLogo(){
    const src=_logoBase64Temp||DB.config.logo||null;
    if(!src){showNotification('⚠️ Selecione uma imagem primeiro.','warning');return;}
    DB.config.logo=src; localStorage.setItem('ieq_config',JSON.stringify(DB.config));
    _logoBase64Temp=null; aplicarLogoSidebar(src); aplicarLogoLogin(src);
    showNotification('✅ Logo salva!','success');
  }
  function removerLogo(){
    if(!confirm('Remover a logo?'))return;
    DB.config.logo=null; _logoBase64Temp=null;
    localStorage.setItem('ieq_config',JSON.stringify(DB.config));
    const img=document.getElementById('logoPreviewImg');
    img.style.display='none'; img.src='';
    document.getElementById('logoPreviewIcon').style.display='flex';
    document.getElementById('logoPreviewLabel').textContent='Nenhuma logo configurada';
    document.getElementById('btnRemoverLogo').style.display='none';
    document.getElementById('logoFileInput').value='';
    aplicarLogoSidebar(null); aplicarLogoLogin(null);
    showNotification('🗑️ Logo removida.','info');
  }
  function aplicarLogoSidebar(src){
    const def=document.getElementById('sidebarLogoDefault'),img=document.getElementById('sidebarLogoImg');
    if(src){ def.style.display='none'; img.src=src; img.style.display='block'; }
    else   { def.style.display='flex'; img.style.display='none'; img.src=''; }
  }
  function aplicarLogoLogin(src){
    const icon=document.getElementById('loginLogoIcon'),img=document.getElementById('loginLogoImg');
    if(src){ icon.style.display='none'; img.src=src; img.style.display='block'; }
    else   { icon.style.display='flex'; img.style.display='none'; img.src=''; }
  }
  function aplicarConfiguracoes(){
    if(DB.config.logo){ aplicarLogoSidebar(DB.config.logo); aplicarLogoLogin(DB.config.logo); }
    if(DB.config.nomeIgreja){
      document.getElementById('sidebarNomeIgreja').textContent=DB.config.nomeIgreja;
      document.getElementById('loginNomeIgreja').textContent=DB.config.nomeIgreja;
    }
  }
  function salvarConfiguracoes(){
    DB.config.nomeIgreja=document.getElementById('cfg-nome-igreja').value.trim()||'IEQ Esplanada';
    DB.config.endereco  =document.getElementById('cfg-endereco').value.trim();
    DB.config.pastor    =document.getElementById('cfg-pastor').value.trim();
    DB.config.tesoureiro=document.getElementById('cfg-tesoureiro').value.trim();
    DB.config.whatsapp=document.getElementById('cfg-whatsapp').value.trim();
    localStorage.setItem('ieq_config',JSON.stringify(DB.config));
    document.getElementById('sidebarNomeIgreja').textContent=DB.config.nomeIgreja;
    document.getElementById('loginNomeIgreja').textContent=DB.config.nomeIgreja;
    showNotification('✅ Configurações salvas!','success');
  }

  function renderConfiguracoes(){
    document.getElementById('cfg-nome-igreja').value=DB.config.nomeIgreja||'IEQ Esplanada';
    document.getElementById('cfg-endereco').value    =DB.config.endereco||'';
    document.getElementById('cfg-pastor').value      =DB.config.pastor||'';
    document.getElementById('cfg-tesoureiro').value  =DB.config.tesoureiro||'';
    document.getElementById('cfg-whatsapp').value    =DB.config.whatsapp||'';
    if(DB.config.logo) mostrarPreviewLogo(DB.config.logo);
    else {
      document.getElementById('logoPreviewImg').style.display='none';
      document.getElementById('logoPreviewIcon').style.display='flex';
      document.getElementById('btnRemoverLogo').style.display='none';
    }
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  const charts={ evolucao:null, despesas:null, comparativo:null };

  function renderDashboard(){
    const resMes = calcularResumoMes(GLOBAL_MONTH);
    const resAnt = calcularResumoMes(prevMonthKey(GLOBAL_MONTH));

    const sA = resMes.saldoAnt;
    const ent = resMes.entradas;
    const sai = resMes.saidas;
    const sF = resMes.saldoFinal;

    document.getElementById('kpi-saldo-ant').textContent=fmt(sA);
    document.getElementById('kpi-entradas').textContent =fmt(ent);
    document.getElementById('kpi-saidas').textContent  =fmt(sai);
    document.getElementById('kpi-saldo').textContent   =fmt(sF);

    const varEnt = resAnt.entradas ? ((ent/resAnt.entradas)-1)*100 : 0;
    const varSai = resAnt.saidas   ? ((sai/resAnt.saidas)-1)*100   : 0;

    document.getElementById('kpi-entradas-var').innerHTML=resAnt.entradas ? `${varEnt>=0?'+':''}${varEnt.toFixed(1)}% vs mês ant.` : '—';
    document.getElementById('kpi-saidas-var').innerHTML  =resAnt.saidas   ? `${varSai>=0?'+':''}${varSai.toFixed(1)}% vs mês ant.` : '—';
    document.getElementById('kpi-saldo-ant-sub').textContent=`Ref. ${monthLabel(prevMonthKey(GLOBAL_MONTH))}`;
    document.getElementById('kpi-saldo-sub').textContent    =`Saldo atualizado em ${new Date().toLocaleDateString('pt-BR')}`;

    const ceia = getPresentesCeia(GLOBAL_MONTH);
    document.getElementById('kpi-presentes').textContent=ceia.presentes;
    document.getElementById('kpi-presentes-info').textContent=ceia.encontrado ? `Data: ${fmtDate(ceia.data)}` : (ceia.data ? `Previsão: ${fmtDate(ceia.data)}` : '—');
    
    // Debug Ceia
    const debugCeia = document.getElementById('debug-data-ceia');
    if(debugCeia) {
        debugCeia.style.display = 'none'; // ocultar por padrão
        debugCeia.textContent = `Ceia esperada: ${getSegundoDomingoDoMes(GLOBAL_MONTH)}`;
    }

    const cultos = getCultosMes(GLOBAL_MONTH);
    document.getElementById('kpi-cultos').textContent=cultos.length;
    const media = ceia.presentes > 0 ? (ent/ceia.presentes) : 0;
    document.getElementById('kpi-media-pessoa').textContent=fmt(media);

    const miss = sum(cultos, c=>c.missoes);
    document.getElementById('kpi-missoes-mes').textContent=fmt(miss);

    renderChartEvolucao();
    renderChartDespesas();
    renderMovimentacoesDash();
    renderDistribuicoesDash();
  }

  function renderChartEvolucao(){
    const ctx=document.getElementById('chartEvolucao'); if(!ctx)return;
    const ano=new Date().getFullYear();
    const dados=calcularResumoAnual(ano);
    if(charts.evolucao) charts.evolucao.destroy();
    charts.evolucao=new Chart(ctx,{
      type:'bar',
      data:{
        labels:dados.map(d=>d.nome.slice(0,3)),
        datasets:[
          { label:'Entradas', data:dados.map(d=>d.entradas), backgroundColor:'#10b981', borderRadius:4 },
          { label:'Saídas',   data:dados.map(d=>d.saidas),   backgroundColor:'#ef4444', borderRadius:4 }
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:10} } } },
        scales:{ y:{ ticks:{ callback:v=>'R$'+v, font:{size:9} } }, x:{ ticks:{ font:{size:9} } } }
      }
    });
  }

  function renderChartDespesas(){
    const ctx=document.getElementById('chartDespesas'); if(!ctx)return;
    const desp=getDespesasMes(GLOBAL_MONTH);
    const cats={}; desp.forEach(d=>{ cats[d.categoria]=(cats[d.categoria]||0)+d.valor; });
    const labels=Object.keys(cats), data=Object.values(cats);
    if(charts.despesas) charts.despesas.destroy();
    if(!labels.length){
        // Limpar canvas se não houver dados
        const context = ctx.getContext('2d');
        context.clearRect(0, 0, ctx.width, ctx.height);
        return;
    }
    charts.despesas=new Chart(ctx,{
      type:'doughnut',
      data:{
        labels,
        datasets:[{ data, backgroundColor:['#1e3a5f','#c8a951','#e63946','#10b981','#3b82f6','#f59e0b','#8b5cf6','#065f46'] }]
      },
      options:{
        responsive:true,
        cutout:'70%',
        plugins:{ legend:{ position:'right', labels:{ boxWidth:10, font:{size:9} } } }
      }
    });
  }

  function renderMovimentacoesDash(){
    const e=getEntradasMes(GLOBAL_MONTH).map(x=>({...x,tipo:'Entrada'}));
    const s=getDespesasMes(GLOBAL_MONTH).map(x=>({...x,tipo:'Saída'}));
    const total=[...e,...s].sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,6);
    const tbody=document.getElementById('tabelaMovimentacoes');
    tbody.innerHTML=total.map(m=>`
      <tr class="text-xs border-b border-gray-50 table-row">
        <td class="py-2">${fmtDate(m.data)}</td>
        <td class="py-2 font-medium truncate max-w-[120px]">${escapeHtml(m.descricao||m.categoria||'—')}</td>
        <td class="py-2"><span class="px-2 py-0.5 rounded-full ${m.tipo==='Entrada'?'badge-green':'badge-red'}">${m.tipo}</span></td>
        <td class="py-2 text-right font-bold ${m.tipo==='Entrada'?'text-green-600':'text-red-600'}">${fmt(m.valor)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="py-4 text-center text-gray-400">Nenhuma movimentação</td></tr>';
  }

  function renderDistribuicoesDash(){
    const d=calcularDistribuicoes(GLOBAL_MONTH);
    const container=document.getElementById('dashDistribuicoes');
    container.innerHTML=d.map(i=>`
      <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full" style="background:${i.cor}"></div>
          <span class="text-xs font-medium text-gray-700">${i.label}</span>
        </div>
        <span class="text-xs font-bold text-gray-900">${fmt(i.valor)}</span>
      </div>
    `).join('');
  }

  // ============================================================
  // CÁLCULOS FINANCEIROS
  // ============================================================
  function sum(arr,fn){ return arr.reduce((s,x)=>s+(fn(x)||0),0); }
  function getEntradasMes(mk){ return DB.entradas.filter(e=>(e.data||'').startsWith(mk)); }
  function getDespesasMes(mk){ return DB.despesas.filter(d=>(d.data||'').startsWith(mk)); }
  function getCultosMes(mk){ return DB.cultos.filter(c=>(c.data||'').startsWith(mk)); }

  function calcularResumoMes(mk){
    const hist=DB.historico.find(h=>`${h.ano}-${String(h.mes).padStart(2,'0')}`===mk);
    if(hist) return { saldoAnt:hist.saldoAnt, entradas:hist.entradas, saidas:hist.saidas, saldoFinal:hist.saldoFinal };

    const prev=prevMonthKey(mk);
    const resPrev=calcularResumoMes(prev);
    const sA=resPrev.saldoFinal;
    const ent=sum(getEntradasMes(mk), e=>e.valor);
    const sai=sum(getDespesasMes(mk), d=>d.valor);
    return { saldoAnt:sA, entradas:ent, saidas:sai, saldoFinal:sA+ent-sai };
  }

  function calcularResumoAnual(ano){
    const meses=[];
    for(let m=1;m<=12;m++){
      const mk=`${ano}-${String(m).padStart(2,'0')}`;
      const res=calcularResumoMes(mk);
      meses.push({ mes:m, nome:monthLabel(mk), ...res });
    }
    return meses;
  }

  function calcularDistribuicoes(mk){
    const cultos=getCultosMes(mk);
    const diz=sum(cultos, c=>c.totalDizimos);
    const ofr=sum(cultos, c=>c.totalOfertas);
    const miss=sum(cultos, c=>c.missoes);
    return [
      { label:'CED (10% Díz)', valor:diz*0.1, cor:'#1e3a5f' },
      { label:'CND (5% Díz)',  valor:diz*0.05,cor:'#3b82f6' },
      { label:'F. Regional (3% Díz)', valor:diz*0.03, cor:'#8b5cf6' },
      { label:'Missões (100% Oferta Missões)', valor:miss, cor:'#10b981' }
    ];
  }

  // ============================================================
  // RELATÓRIO DE CULTO (REFC)
  // ============================================================
  function adicionarDizimista(nome='',valor=0,forma='Caixa'){
    const div=document.createElement('div');
    div.className='dizimista-row';
    div.innerHTML=`
      <input type="text" placeholder="Nome do Dizimista" class="input-field text-sm diz-nome" value="${escapeHtml(nome)}">
      <input type="number" step="0.01" placeholder="0,00" class="input-field text-sm diz-valor" value="${valor||''}" oninput="calcTotalCulto()">
      <select class="forma-pag diz-forma">
        <option value="Caixa" ${forma==='Caixa'?'selected':''}>💵 Caixa</option>
        <option value="PIX" ${forma==='PIX'?'selected':''}>📱 PIX</option>
      </select>
      <button type="button" class="btn-remove" onclick="this.parentElement.remove();calcTotalCulto()"><i class="fas fa-times"></i></button>
    `;
    document.getElementById('listaDizimistas').appendChild(div);
  }
  function adicionarOferta(nome='',valor=0,forma='Caixa'){
    const div=document.createElement('div');
    div.className='oferta-row';
    div.innerHTML=`
      <input type="text" placeholder="Oferta/Tipo" class="input-field text-sm of-nome" value="${escapeHtml(nome)}">
      <input type="number" step="0.01" placeholder="0,00" class="input-field text-sm of-valor" value="${valor||''}" oninput="calcTotalCulto()">
      <select class="forma-pag of-forma">
        <option value="Caixa" ${forma==='Caixa'?'selected':''}>💵 Caixa</option>
        <option value="PIX" ${forma==='PIX'?'selected':''}>📱 PIX</option>
      </select>
      <button type="button" class="btn-remove" onclick="this.parentElement.remove();calcTotalCulto()"><i class="fas fa-times"></i></button>
    `;
    document.getElementById('listaOfertas').appendChild(div);
  }
  function calcTotalCulto(){
    const d=coletarDizimistas(), o=coletarOfertas();
    const tD=sum(d,x=>x.valor), tO=sum(o,x=>x.valor);
    const mis=parseFloat(document.getElementById('c-missoes').value)||0;
    const esp=parseFloat(document.getElementById('c-especiais').value)||0;
    const out=parseFloat(document.getElementById('c-outras').value)||0;
    
    // CORREÇÃO 1: totalArrecadado = diz + of + esp + out (SEM missões)
    const total = tD + tO + esp + out;
    
    document.getElementById('totalDizimosLabel').textContent=fmt(tD);
    document.getElementById('totalOfertasLabel').textContent=fmt(tO);
    document.getElementById('totalArrecadado').textContent=fmt(total);
    
    // Auto-preenchimento Caixa/Conta
    const pixD = sum(d.filter(x=>x.forma==='PIX'), x=>x.valor);
    const pixO = sum(o.filter(x=>x.forma==='PIX'), x=>x.valor);
    const totalPix = pixD + pixO;
    const totalCaixa = total - totalPix;
    
    document.getElementById('c-conta').value = totalPix.toFixed(2);
    document.getElementById('c-caixa').value = totalCaixa.toFixed(2);
    
    return { totalDiz:tD, totalOf:tO, total:total };
  }
  function coletarDizimistas(){
    return[...document.querySelectorAll('.dizimista-row')].map(r=>({
      nome:r.querySelector('.diz-nome').value.trim(),
      valor:+r.querySelector('.diz-valor').value||0,
      forma:r.querySelector('.diz-forma').value
    })).filter(d=>d.valor>0||d.nome);
  }
  function coletarOfertas(){
    return[...document.querySelectorAll('.oferta-row')].map(r=>({
      nome:r.querySelector('.of-nome').value.trim(),
      valor:+r.querySelector('.of-valor').value||0,
      forma:r.querySelector('.of-forma').value
    })).filter(o=>o.valor>0||o.nome);
  }

  function openNovoCulto(){
    if(!temPermissao('podeLancar')){showNotification('🔒 Sem permissão.','error');return;}
    resetFormCulto();
    document.getElementById('cultoModalTitulo').textContent='Novo Relatório de Culto (REFC)';
    document.getElementById('modalNovoCulto').classList.add('active');
  }

  function openEditarCulto(idx){
    if(!temPermissao('podeEditar')){showNotification('🔒 Sem permissão para editar.','error');return;}
    const c=DB.cultos[idx]; if(!c)return;
    resetFormCulto();
    document.getElementById('cultoModalTitulo').textContent='Alterar Relatório de Culto (REFC)';
    document.getElementById('c-id').value        =c.id||'';
    document.getElementById('c-data').value      =c.data||'';
    document.getElementById('c-horario').value   =c.horario||'19:30';
    document.getElementById('c-pastor').value    =c.pastor||'';
    document.getElementById('c-pregador').value  =c.pregador||'';
    document.getElementById('c-tipo').value      =c.tipo||'Culto Regular';
    document.getElementById('c-cura').value      =c.cura||0;
    document.getElementById('c-presentes').value =c.presentes||0;
    document.getElementById('c-visitantes').value=c.visitantes||0;
    document.getElementById('c-criancas').value  =c.criancas||0;
    document.getElementById('c-observacoes').value=c.observacoes||''; // CORREÇÃO 4
    document.getElementById('listaDizimistas').innerHTML='';
    (c.dizimistas||[]).forEach(d=>adicionarDizimista(d.nome||'',d.valor||0,d.forma||'Caixa'));
    if(!(c.dizimistas||[]).length) adicionarDizimista();
    document.getElementById('listaOfertas').innerHTML='';
    (c.ofertas||[]).forEach(o=>adicionarOferta(o.nome||'',o.valor||0,o.forma||'Caixa'));
    if(!(c.ofertas||[]).length) adicionarOferta();
    document.getElementById('c-missoes').value   =parseFloat(c.missoes)||0;
    document.getElementById('c-especiais').value =parseFloat(c.especiais)||0;
    document.getElementById('c-outras').value    =parseFloat(c.outras)||0;
    calcTotalCulto();
    document.getElementById('modalNovoCulto').classList.add('active');
  }

  async function salvarCulto(e){
    e.preventDefault();
    const{totalDiz,totalOf,total}=calcTotalCulto();
    const nowIso=new Date().toISOString(),isEdit=!!document.getElementById('c-id').value;
    const cultoIdEx=document.getElementById('c-id').value;
    const missoes = parseFloat(document.getElementById('c-missoes').value)||0;

    const cultoData={
      data:document.getElementById('c-data').value,
      horario:document.getElementById('c-horario').value,
      pastor:document.getElementById('c-pastor').value,
      pregador:document.getElementById('c-pregador').value,
      tipo:document.getElementById('c-tipo').value,
      cura:+document.getElementById('c-cura').value||0,
      presentes:+document.getElementById('c-presentes').value||0,
      visitantes:+document.getElementById('c-visitantes').value||0,
      criancas:+document.getElementById('c-criancas').value||0,
      dizimistas:JSON.stringify(coletarDizimistas()),
      totalDizimos:totalDiz,
      ofertas:JSON.stringify(coletarOfertas()),
      totalOfertas:totalOf,
      // CORREÇÃO 1: missões salva separado, totalArrecadado sem missões
      missoes: missoes,
      especiais:parseFloat(document.getElementById('c-especiais').value)||0,
      outras:parseFloat(document.getElementById('c-outras').value)||0,
      totalArrecadado:total, // total = diz + of + especiais + outras (SEM missoes)
      caixaLocal:+document.getElementById('c-caixa').value||0,
      contaCorrente:+document.getElementById('c-conta').value||0,
      observacoes:document.getElementById('c-observacoes').value||'', // CORREÇÃO 4
      atualizadoEm:nowIso,
      criadoEm:nowIso
    };

    setBtnLoading('btnSalvarCulto',true,isEdit?'Salvar Alterações':'Salvar');
    try {
      if(isEdit) await excluirCultoPorId(cultoIdEx,{silent:true});
      const rc=await apiSave('cultos',cultoData);
      const culto={...cultoData,id:rc.id,dizimistas:coletarDizimistas(),ofertas:coletarOfertas()};
      DB.cultos.unshift(culto);
      // CORREÇÃO 1: Entrada registra apenas dízimos+ofertas (sem missões)
      if(total>0){
        const ed={
          descricao:`Culto ${fmtDate(culto.data)} — ${culto.tipo}`,
          valor:total, // total sem missões
          data:culto.data,
          origem:'culto',
          cultoId:rc.id,
          criadoEm:nowIso
        };
        const re=await apiSave('entradas',ed);
        DB.entradas.unshift({...ed,id:re.id});
      }
      // CORREÇÃO 1: Missões são salvas separadamente (só para dashboards)
      // Não gera entrada separada — apenas o campo missoes no culto alimenta distribuições e dashboard
      DB.saveLocal();
      closeModal('modalNovoCulto'); resetFormCulto();
      setSyncStatus('synced');
      showNotification(isEdit?'✅ Culto alterado!':`✅ Culto salvo! Dízimos+Ofertas: ${fmt(total)} | Missões: ${fmt(missoes)}`,'success');
    } catch(err){
      const lid=Date.now();
      const missoes2=parseFloat(document.getElementById('c-missoes').value)||0;
      DB.cultos.unshift({...cultoData,id:lid,dizimistas:coletarDizimistas(),ofertas:coletarOfertas()});
      if(total>0) DB.entradas.unshift({
        id:lid+1,
        descricao:`Culto ${fmtDate(cultoData.data)} — ${cultoData.tipo}`,
        valor:total,
        data:cultoData.data,
        origem:'culto',
        cultoId:lid
      });
      DB.saveLocal(); closeModal('modalNovoCulto'); resetFormCulto();
      setSyncStatus('error'); showNotification('⚠️ Salvo localmente','warning');
    } finally{
      setBtnLoading('btnSalvarCulto',false,'Salvar');
      renderCultos(); renderEntradas(); renderDashboard();
    }
  }

  function resetFormCulto(){
    document.getElementById('formCulto').reset();
    document.getElementById('c-id').value='';
    document.getElementById('listaDizimistas').innerHTML='';
    document.getElementById('listaOfertas').innerHTML='';
    document.getElementById('totalArrecadado').textContent='R$ 0,00';
    document.getElementById('totalDizimosLabel').textContent='R$ 0,00';
    document.getElementById('totalOfertasLabel').textContent='R$ 0,00';
    document.getElementById('c-caixa').value='0';
    document.getElementById('c-conta').value='0';
    document.getElementById('c-missoes').value='0';
    document.getElementById('c-especiais').value='0';
    document.getElementById('c-outras').value='0';
    document.getElementById('c-observacoes').value=''; // CORREÇÃO 4
    const hoje=new Date().toISOString().split('T')[0];
    document.getElementById('c-data').value=hoje;
    document.getElementById('c-horario').value='19:30';
    document.getElementById('c-pastor').value=DB.config.pastor||'Danilo de Oliveira Falcão';
    adicionarDizimista(); adicionarOferta(); calcTotalCulto();
  }

  function renderCultos(){
    const busca=(document.getElementById('buscaCulto')?.value||'').toLowerCase();
    const mes=document.getElementById('filtroCultoMes')?.value||GLOBAL_MONTH;
    const ceiaDom=getSegundoDomingoDoMes(mes);
    const lista=DB.cultos.filter(c=>{
      const mM=mes?(c.data||'').startsWith(mes):true;
      const mT=!busca||(c.data||'').includes(busca)||(c.tipo||'').toLowerCase().includes(busca)||(c.pregador||'').toLowerCase().includes(busca)||(c.pastor||'').toLowerCase().includes(busca);
      return mM&&mT;
    });
    document.getElementById('qtdCultosLabel').textContent=`${lista.length} culto(s)`;
    const tbody=document.getElementById('tabelaCultos');
    if(!lista.length){
      tbody.innerHTML=`<tr><td colspan="8" class="py-8 text-center text-gray-400"><i class="fas fa-bible text-4xl mb-3 block text-gray-300"></i>Nenhum culto encontrado</td></tr>`;
      atualizarTotaisCultos([]);
      return;
    }
    const podeEd=temPermissao('podeEditar'), podeEx=temPermissao('podeExcluir');
    tbody.innerHTML = lista.map(c => {
  const idx = DB.cultos.indexOf(c);
  const isCeia = ceiaDom && c.data === ceiaDom;
  const ceiaTag = isCeia
    ? `<span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">🍞 Ceia</span>`
    : '';
  const editBtn = podeEd
    ? `<button onclick="openEditarCulto(${idx})" class="btn-acao-edit w-7 h-7 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 text-xs flex items-center justify-center" title="Alterar"><i class="fas fa-pen"></i></button>`
    : `<button class="w-7 h-7 bg-gray-50 text-gray-300 rounded-lg text-xs flex items-center justify-center cursor-not-allowed" title="Sem permissão" disabled><i class="fas fa-pen"></i></button>`;
  const delBtn = podeEx
    ? `<button onclick="excluirCulto(${idx})" class="btn-acao-del w-7 h-7 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 text-xs flex items-center justify-center" title="Excluir"><i class="fas fa-trash"></i></button>`
    : `<button class="w-7 h-7 bg-gray-50 text-gray-300 rounded-lg text-xs flex items-center justify-center cursor-not-allowed" title="Sem permissão" disabled><i class="fas fa-trash"></i></button>`;

  return `
    <tr class="table-row border-b border-gray-50">
      <td class="p-2 text-sm font-medium">${fmtDate(c.data)}${ceiaTag}</td>
      <td class="p-2"><span class="badge-blue px-2 py-0.5 rounded text-xs font-semibold">${escapeHtml(c.tipo || '-')}</span></td>
      <td class="p-2 text-sm text-gray-600 hidden md:table-cell">${escapeHtml(c.pregador || c.pastor || '-')}</td>
      <td class="p-2 text-sm font-semibold text-center">${c.presentes || 0}</td>
      <td class="p-2 text-sm text-green-700 font-semibold">${fmt(c.totalDizimos || 0)}</td>
      <td class="p-2 text-sm text-green-700 font-semibold">${fmt(c.totalOfertas || 0)}</td>
      <td class="p-2 text-sm font-bold text-green-800">${fmt(c.totalArrecadado || 0)}</td>
      <td class="p-2">
        <div class="flex gap-1">
          <button onclick="verCulto(${idx})" class="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs flex items-center justify-center" title="Visualizar"><i class="fas fa-eye"></i></button>
          ${editBtn}
          <button onclick="imprimirCultoDireto(${idx})" class="w-7 h-7 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs flex items-center justify-center" title="Imprimir"><i class="fas fa-print"></i></button>
          <button onclick="compartilharCultoWhatsApp(${idx})" class="btn-whatsapp-sm" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>
          ${delBtn}
        </div>
      </td>
    </tr>`;
}).join('');

    atualizarTotaisCultos(lista);
  }
  // ============================================================
  // CATEGORIAS DE DESPESAS
  // ============================================================
  
   // ============================================================
  // CATEGORIAS DE DESPESAS (BLOCO ÚNICO E COMPLETO)
  // ============================================================
  const CATEGORIAS_PADRAO = [
    { nome:'ENERGIA', icone:'⚡' },
    { nome:'AGUA', icone:'💧' },
    { nome:'CED', icone:'🏛️' },
    { nome:'CND', icone:'🌐' },
    { nome:'CONTADOR', icone:'🧮' },
    { nome:'TAXA REGIONAL', icone:'🏦' },
    { nome:'COMBUSTIVEL', icone:'' },
    { nome:'PREBENDA', icone:'👤' },
    { nome:'PAPELARIA', icone:'📄' },
    { nome:'DARF', icone:'🧾' },
    { nome:'MATERIAL', icone:'📦' },
    { nome:'OUTROS', icone:'➕' },
  ];

  let _categoriasVisiveis = true;

  function getCategoriasDespesas() {
    if (!DB.config) DB.config = {};
    if (!Array.isArray(DB.config.categoriasDespesas) || DB.config.categoriasDespesas.length === 0) {
      DB.config.categoriasDespesas = CATEGORIAS_PADRAO.map(c => ({...c}));
    }
    return DB.config.categoriasDespesas;
  }

  function getCatIcon(categoria) {
    const cats = getCategoriasDespesas();
    const found = cats.find(c => c.nome === categoria);
    return found?.icone || '📌';
  }

  function salvarCategoriasDespesas() {
    localStorage.setItem('ieq_config', JSON.stringify(DB.config));
  }

  function renderCategoriasDespesas() {
    const container = document.getElementById('listaCategoriasDespesas');
    if (!container) return;
    const cats = getCategoriasDespesas();
    const podeEd = temPermissao('podeEditar');
    const podeEx = temPermissao('podeExcluir');
    container.innerHTML = cats.map((cat, i) => `
      <span class="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1.5 text-sm">
        <span>${cat.icone || '📌'}</span>
        <span class="font-medium text-gray-700">${escapeHtml(cat.nome)}</span>
        ${podeEd ? `<button onclick="editarCategoria(${i})" class="text-yellow-600 hover:text-yellow-800 ml-1" title="Editar"><i class="fas fa-pen text-xs"></i></button>` : ''}
        ${podeEx ? `<button onclick="excluirCategoria(${i})" class="text-red-500 hover:text-red-700 ml-0.5" title="Excluir"><i class="fas fa-times text-xs"></i></button>` : ''}
      </span>
    `).join('');
    const contador = document.getElementById('contadorCategorias');
    if (contador) contador.textContent = `${cats.length} categoria(s)`;
    atualizarSelectsCategoria();
  }

  function atualizarSelectsCategoria() {
    const cats = getCategoriasDespesas();
    const opts = cats.map(c => `<option value="${escapeHtml(c.nome)}">${c.icone || '📌'} ${escapeHtml(c.nome)}</option>`).join('');
    const selectsConfig = [
      { id: 'd-categoria',     temVazio: true,  vazioLabel: 'Selecione...' },
      { id: 'alt-d-categoria', temVazio: true,  vazioLabel: 'Selecione...' },
      { id: 'filtroCat',       temVazio: false, vazioLabel: 'Todas as categorias' },
    ];
    selectsConfig.forEach(sc => {
      const sel = document.getElementById(sc.id);
      if (!sel) return;
      const currentVal = sel.value;
      sel.innerHTML = `<option value="">${sc.vazioLabel}</option>` + opts;
      if (currentVal && [...sel.options].some(o => o.value === currentVal)) {
        sel.value = currentVal;
      }
    });
  }

  function toggleCategoriasDespesas() {
    const body = document.getElementById('categoriasDespesasBody');
    const icon = document.getElementById('iconeToggleCategorias');
    if (!body || !icon) return;
    _categoriasVisiveis = !_categoriasVisiveis;
    body.style.maxHeight = _categoriasVisiveis ? '500px' : '0px';
    body.style.opacity = _categoriasVisiveis ? '1' : '0';
    icon.style.transform = _categoriasVisiveis ? 'rotate(0deg)' : 'rotate(-90deg)';
  }

  function abrirNovaCategoria() {
    if (!temPermissao('podeEditar')) return;
    const nome = prompt('Nome da nova categoria:');
    if (!nome) return;
    const icone = prompt('Ícone/Emoji (opcional):', '📌');
    const cats = getCategoriasDespesas();
    if (cats.some(c => c.nome.toUpperCase() === nome.toUpperCase())) {
      alert('Esta categoria já existe!'); return;
    }
    cats.push({ nome: nome.toUpperCase(), icone: icone || '📌' });
    salvarCategoriasDespesas();
    renderCategoriasDespesas();
    showNotification('✅ Categoria adicionada!', 'success');
  }

  function editarCategoria(i) {
    if (!temPermissao('podeEditar')) return;
    const cats = getCategoriasDespesas();
    const cat = cats[i];
    const novoNome = prompt('Novo nome:', cat.nome);
    if (!novoNome) return;
    const novoIcone = prompt('Novo ícone:', cat.icone);
    cat.nome = novoNome.toUpperCase();
    cat.icone = novoIcone || '📌';
    salvarCategoriasDespesas();
    renderCategoriasDespesas();
    showNotification('✅ Categoria atualizada!', 'success');
  }

  function excluirCategoria(i) {
    if (!temPermissao('podeExcluir')) return;
    if (!confirm('Deseja excluir esta categoria? As despesas vinculadas não serão apagadas, mas perderão o vínculo visual.')) return;
    const cats = getCategoriasDespesas();
    cats.splice(i, 1);
    salvarCategoriasDespesas();
    renderCategoriasDespesas();
    showNotification('🗑️ Categoria removida.', 'info');
  }
  // ============================================================
  // RELATÓRIOS
  // ============================================================
  function renderRelatorios(){
    popularSelectMes('relatorioMesSelect');
    const selCulto = document.getElementById('relCultoMesSelect');
    if(selCulto){
      const now = new Date();
      const keysC = [];
      for(let i=12; i>=0; i--) {
        keysC.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() - i, 1)));
      }
      keysC.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
      selCulto.innerHTML = `<option value="">-- Intervalo abaixo --</option>` + keysC.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('');
    }

    document.getElementById('relCultoIni').value = GLOBAL_MONTH;
    document.getElementById('relCultoFim').value = GLOBAL_MONTH;
    popularSelectMes('relDizimistasMesSelect');
    popularSelectMes('relFormasMesSelect');

        const anoAtual = new Date().getFullYear();
    const resumoAnual = calcularResumoAnual(anoAtual);
    const hoje = new Date();
    const dadosRel = resumoAnual.filter(r => r.mes <= (hoje.getMonth() + 1));
    const dadosChart = dadosRel.length > 0 ? dadosRel : resumoAnual;
    
    const ctx = document.getElementById('chartComparativo');
    if (charts.comparativo) charts.comparativo.destroy();
    charts.comparativo = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dadosChart.map(r => r.nome),
          datasets: [{
            label: 'Saldo Final',
            data: dadosChart.map(r => r.saldoFinal),
            borderColor: '#1e3a5f',
            backgroundColor: 'rgba(30,58,95,0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#c8a951'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { callback: v => 'R$' + v.toLocaleString('pt-BR'), font: { size: 10 } } }
          }
        }
    });
 }
  
  function gerarRelatorio(){
  const ms = document.getElementById('relatorioMesSelect')?.value || GLOBAL_MONTH;
  const entMes = sum(getEntradasMes(ms), e => e.valor);
  const saiMes = sum(getDespesasMes(ms), d => d.valor);
  const resumo = calcularResumoMes(ms);
  const resumoPrev = calcularResumoMes(prevMonthKey(ms));
  const saldoAnt = resumo ? resumo.saldoAnt : (resumoPrev ? resumoPrev.saldoFinal : 0);
  const saldoFinal = resumo ? resumo.saldoFinal : (saldoAnt + entMes - saiMes);

  const logoHtml = DB.config.logo
    ? `<img src="${DB.config.logo}" style="width:64px;height:64px;border-radius:12px;object-fit:contain;background:#fff;padding:4px;border:2px solid rgba(255,255,255,0.3)">`
    : `<div style="font-size:34px">⛪</div>`;
  const nomeIgreja = escapeHtml(DB.config.nomeIgreja || 'IEQ Esplanada');
  const endereco = escapeHtml(DB.config.endereco || '');
  const despLista = getDespesasMes(ms);

  const linhasDespesas = despLista.length
    ? despLista.map(d => `
        <tr>
          <td>${getCatIcon(d.categoria)} ${escapeHtml(d.categoria||'')}</td>
          <td>${escapeHtml(d.descricao||'—')}</td>
          <td>${fmtDate(d.data)}</td>
          <td style="text-align:right;color:#dc2626;font-weight:600">${fmt(d.valor)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px">Nenhuma despesa no período</td></tr>`;

  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Relatório — ${monthLabel(ms)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:28px;color:#1f2937;background:#fff}
  img{max-width:100%;height:auto}

  .header{background:linear-gradient(135deg,#1e3a5f,#2d5a8f);color:white;border-radius:14px;padding:20px 24px;display:flex;align-items:center;gap:16px;margin-bottom:20px}
  .header h1{font-size:19px;margin:0}
  .header p{font-size:12px;color:#93c5fd;margin:2px 0 0}
  .header .tag{margin-top:8px;font-size:13px;letter-spacing:2px;color:#c8a951;font-weight:700}

  table{width:100%;border-collapse:collapse;margin:16px 0;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06)}
  th{background:#1e3a5f;color:white;padding:10px 14px;text-align:left;font-size:12px;letter-spacing:0.5px}
  td{padding:9px 14px;border-bottom:1px solid #eee;font-size:13px}
  tr:nth-child(even) td{background:#f9fafb}
  .total-row td{font-weight:700;background:#f1f5f9!important;font-size:14px;border-top:2px solid #1e3a5f}
  .green{color:#059669;font-weight:600}
  .red{color:#dc2626;font-weight:600}

  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;text-align:center}
  .kpi span{display:block;font-size:11px;color:#6b7280;margin-bottom:4px}
  .kpi strong{font-size:15px}

  .footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb}
  .print-btn{display:block;margin:24px auto 0;background:#1e3a5f;color:white;border:none;padding:12px 36px;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600}
  .print-btn:hover{background:#16304f}

  @media print{
    @page{margin:10mm;size:A4}
    body{padding:0;max-width:100%}
    .no-print{display:none!important}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    tr{break-inside:avoid}
  }
</style></head>
<body>

  <div class="header">
    ${logoHtml}
    <div>
      <h1>${nomeIgreja}</h1>
      ${endereco ? `<p>${endereco}</p>` : ''}
      <p class="tag">RELATÓRIO FINANCEIRO MENSAL — ${monthLabel(ms).toUpperCase()}</p>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><span>Saldo Anterior</span><strong style="color:#1e40af">${fmt(saldoAnt)}</strong></div>
    <div class="kpi"><span>Entradas</span><strong class="green">${fmt(entMes)}</strong></div>
    <div class="kpi"><span>Saídas</span><strong class="red">${fmt(saiMes)}</strong></div>
    <div class="kpi"><span>Saldo Final</span><strong style="color:#92400e">${fmt(saldoFinal)}</strong></div>
  </div>

  <table>
    <tr><th colspan="4">📄 DETALHAMENTO DE DESPESAS</th></tr>
    <tr style="background:#f1f5f9">
      <th style="background:#f1f5f9;color:#475569">Categoria</th>
      <th style="background:#f1f5f9;color:#475569">Descrição</th>
      <th style="background:#f1f5f9;color:#475569">Data</th>
      <th style="background:#f1f5f9;color:#475569;text-align:right">Valor</th>
    </tr>
    ${linhasDespesas}
    <tr class="total-row"><td colspan="3">TOTAL DE DESPESAS</td><td style="text-align:right" class="red">${fmt(saiMes)}</td></tr>
  </table>

  <div class="footer">
    Gerado em ${new Date().toLocaleString('pt-BR')} — ${nomeIgreja}<br>
    Sistema Financeiro Quadrangular - Desenvolvido por: Pr. Danilo Falcão
</div>

  <div class="no-print" style="text-align:center">
    <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </div>

</body></html>`);
  w.document.close();
}

    // ============================================================
  // RELATÓRIO DE DIZIMISTAS (nome, data, valor) — vindo do Sheets/DB.cultos
  // ============================================================
  function popularSelectMes(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const now = new Date();
    const keys = [];
    for (let i = 12; i >= 0; i--) keys.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    keys.push(monthKeyFromDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
    sel.innerHTML = keys.map(k => `<option value="${k}" ${k===GLOBAL_MONTH?'selected':''}>${monthLabel(k)}</option>`).join('');
  }

  function coletarDizimistasDoPeriodo(mk) {
    const cultos = getCultosMes(mk);
    const linhas = [];
    cultos.forEach(c => {
      (c.dizimistas || []).forEach(d => {
        if (d.valor > 0 || d.nome) {
          linhas.push({ nome: d.nome || '—', data: c.data, valor: parseFloat(d.valor) || 0, forma: d.forma || 'Caixa' });
        }
      });
    });
    linhas.sort((a,b) => (a.data||'').localeCompare(b.data||'') || (a.nome||'').localeCompare(b.nome||''));
    return linhas;
  }

  function gerarRelatorioDizimistas() {
    const mk = document.getElementById('relDizimistasMesSelect')?.value || GLOBAL_MONTH;
    const lista = coletarDizimistasDoPeriodo(mk);
    const total = lista.reduce((s,d) => s + d.valor, 0);
    const nomeIgreja = escapeHtml(DB.config.nomeIgreja || 'IEQ Esplanada');
    const logoHtml = DB.config.logo
      ? `<img src="${DB.config.logo}" style="width:56px;height:56px;border-radius:10px;object-fit:contain;background:#fff;padding:4px;border:2px solid rgba(255,255,255,0.3)">`
      : `<div style="font-size:30px">⛪</div>`;

    const linhasHtml = lista.length
      ? lista.map(d => `
          <tr>
            <td>${escapeHtml(d.nome)}</td>
            <td>${fmtDate(d.data)}</td>
            <td><span style="background:${d.forma==='PIX'?'#dbeafe':'#d1fae5'};color:${d.forma==='PIX'?'#1d4ed8':'#065f46'};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">${escapeHtml(d.forma)}</span></td>
            <td style="text-align:right;color:#059669;font-weight:600">${fmt(d.valor)}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px">Nenhum dizimista no período</td></tr>`;

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Relatório de Dizimistas — ${monthLabel(mk)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:28px;color:#1f2937;background:#fff}
  .header{background:linear-gradient(135deg,#1e3a5f,#2d5a8f);color:white;border-radius:14px;padding:20px 24px;display:flex;align-items:center;gap:16px;margin-bottom:20px}
  .header h1{font-size:19px;margin:0}
  .header p{font-size:12px;color:#93c5fd;margin:2px 0 0}
  .header .tag{margin-top:8px;font-size:13px;letter-spacing:2px;color:#c8a951;font-weight:700}
  table{width:100%;border-collapse:collapse;margin:16px 0;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06)}
  th{background:#1e3a5f;color:white;padding:10px 14px;text-align:left;font-size:12px}
  td{padding:9px 14px;border-bottom:1px solid #eee;font-size:13px}
  tr:nth-child(even) td{background:#f9fafb}
  .total-row td{font-weight:700;background:#f1f5f9!important;font-size:14px;border-top:2px solid #1e3a5f}
  .footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb}
  .print-btn{display:block;margin:24px auto 0;background:#1e3a5f;color:white;border:none;padding:12px 36px;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600}
  @media print{ @page{margin:10mm;size:A4} body{padding:0;max-width:100%} .no-print{display:none!important} *{-webkit-print-color-adjust:exact!important} tr{break-inside:avoid} }
</style></head>
<body>
  <div class="header">
    ${logoHtml}
    <div>
      <h1>${nomeIgreja}</h1>
      <p class="tag">RELATÓRIO DE DIZIMISTAS — ${monthLabel(mk).toUpperCase()}</p>
    </div>
  </div>
  <table>
    <tr><th>Nome</th><th>Data</th><th>Forma</th><th style="text-align:right">Valor</th></tr>
    ${linhasHtml}
    <tr class="total-row"><td colspan="3">TOTAL DE DÍZIMOS</td><td style="text-align:right;color:#059669">${fmt(total)}</td></tr>
  </table>
  <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} — ${nomeIgreja}<br>Sistema Financeiro Quadrangular - Desenvolvido por: Pr. Danilo Falcão</div>
  <div class="no-print" style="text-align:center"><button class="print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
</body></html>`);
    w.document.close();
  }

  function compartilharDizimistasWhatsApp() {
    const mk = document.getElementById('relDizimistasMesSelect')?.value || GLOBAL_MONTH;
    const lista = coletarDizimistasDoPeriodo(mk);
    if (!lista.length) { showNotification('⚠️ Nenhum dizimista no período.', 'warning'); return; }
    const total = lista.reduce((s,d) => s + d.valor, 0);
    const nomeIgreja = DB.config.nomeIgreja || 'IEQ Esplanada';
    let texto = '🙏 *' + nomeIgreja + ' - Relatório de Dizimistas*\n📅 *Mês:* ' + monthLabel(mk) + '\n\n';
    lista.forEach(d => { texto += '👤 ' + d.nome + ' | ' + fmtDate(d.data) + ' | ' + fmt(d.valor) + ' (' + d.forma + ')\n'; });
    texto += '\n💰 *Total:* ' + fmt(total) + '\n\n✨ Gerado pelo Sistema Financeiro IEQ';
    compartilharWhatsApp(texto);
  }

  // ============================================================
  // RELATÓRIO POR FORMA DE CONTRIBUIÇÃO (Caixa x Conta Bancária/PIX)
  // ============================================================
  function coletarFormasContribuicao(mk) {
    const cultos = getCultosMes(mk);
    const entradas = [];
    cultos.forEach(c => {
      (c.dizimistas || []).forEach(d => {
        if (d.valor > 0) entradas.push({ origem:'Dízimo', nome:d.nome||'—', data:c.data, valor:parseFloat(d.valor)||0, forma:d.forma||'Caixa' });
      });
      (c.ofertas || []).forEach(o => {
        if (o.valor > 0) entradas.push({ origem:'Oferta', nome:o.nome||'—', data:c.data, valor:parseFloat(o.valor)||0, forma:o.forma||'Caixa' });
      });
    });
    entradas.sort((a,b) => (a.data||'').localeCompare(b.data||''));
    return entradas;
  }

  function gerarRelatorioFormasContribuicao() {
    const mk = document.getElementById('relFormasMesSelect')?.value || GLOBAL_MONTH;
    const entradas = coletarFormasContribuicao(mk);
    const caixa = entradas.filter(e => e.forma === 'Caixa');
    const conta = entradas.filter(e => e.forma === 'PIX');
    const totalCaixa = caixa.reduce((s,e) => s + e.valor, 0);
    const totalConta = conta.reduce((s,e) => s + e.valor, 0);
    const nomeIgreja = escapeHtml(DB.config.nomeIgreja || 'IEQ Esplanada');
    const logoHtml = DB.config.logo
      ? `<img src="${DB.config.logo}" style="width:56px;height:56px;border-radius:10px;object-fit:contain;background:#fff;padding:4px;border:2px solid rgba(255,255,255,0.3)">`
      : `<div style="font-size:30px">⛪</div>`;

    const linhas = (lista) => lista.length
      ? lista.map(e => `
          <tr>
            <td>${escapeHtml(e.origem)}</td>
            <td>${escapeHtml(e.nome)}</td>
            <td>${fmtDate(e.data)}</td>
            <td style="text-align:right;color:#059669;font-weight:600">${fmt(e.valor)}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px">Nenhum registro</td></tr>`;

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Relatório por Forma — ${monthLabel(mk)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:28px;color:#1f2937;background:#fff}
  .header{background:linear-gradient(135deg,#1e3a5f,#2d5a8f);color:white;border-radius:14px;padding:20px 24px;display:flex;align-items:center;gap:16px;margin-bottom:20px}
  .header h1{font-size:19px;margin:0}
  .header .tag{margin-top:8px;font-size:13px;letter-spacing:2px;color:#c8a951;font-weight:700}
  h3{margin:24px 0 12px;color:#1e3a5f;font-size:16px;border-left:4px solid #c8a951;padding-left:10px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06)}
  th{background:#f1f5f9;color:#475569;padding:10px 14px;text-align:left;font-size:12px}
  td{padding:9px 14px;border-bottom:1px solid #eee;font-size:13px}
  .total-row td{font-weight:700;background:#f8fafc!important;font-size:14px}
  .footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb}
  .print-btn{display:block;margin:24px auto 0;background:#1e3a5f;color:white;border:none;padding:12px 36px;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600}
  @media print{ @page{margin:10mm;size:A4} body{padding:0;max-width:100%} .no-print{display:none!important} *{-webkit-print-color-adjust:exact!important} tr{break-inside:avoid} }
</style></head>
<body>
  <div class="header">
    ${logoHtml}
    <div>
      <h1>${nomeIgreja}</h1>
      <p class="tag">RELATÓRIO POR FORMA DE CONTRIBUIÇÃO — ${monthLabel(mk).toUpperCase()}</p>
    </div>
  </div>
  
  <h3>💵 CAIXA (Entradas em Dinheiro)</h3>
  <table>
    <tr><th>Origem</th><th>Nome</th><th>Data</th><th style="text-align:right">Valor</th></tr>
    ${linhas(caixa)}
    <tr class="total-row"><td colspan="3">TOTAL EM CAIXA</td><td style="text-align:right;color:#059669">${fmt(totalCaixa)}</td></tr>
  </table>

  <h3>📱 CONTA BANCÁRIA / PIX</h3>
  <table>
    <tr><th>Origem</th><th>Nome</th><th>Data</th><th style="text-align:right">Valor</th></tr>
    ${linhas(conta)}
    <tr class="total-row"><td colspan="3">TOTAL EM CONTA/PIX</td><td style="text-align:right;color:#1d4ed8">${fmt(totalConta)}</td></tr>
  </table>

  <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} — ${nomeIgreja}<br>Sistema Financeiro Quadrangular - Desenvolvido por: Pr. Danilo Falcão</div>
  <div class="no-print" style="text-align:center"><button class="print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
</body></html>`);
    w.document.close();
  }

  function compartilharFormasWhatsApp() {
    const mk = document.getElementById('relFormasMesSelect')?.value || GLOBAL_MONTH;
    const entradas = coletarFormasContribuicao(mk);
    if (!entradas.length) { showNotification('⚠️ Nenhum registro no período.', 'warning'); return; }
    const totalCaixa = entradas.filter(e => e.forma === 'Caixa').reduce((s,e) => s + e.valor, 0);
    const totalConta = entradas.filter(e => e.forma === 'PIX').reduce((s,e) => s + e.valor, 0);
    const nomeIgreja = DB.config.nomeIgreja || 'IEQ Esplanada';
    let texto = '📊 *' + nomeIgreja + ' - Resumo por Forma*\n📅 *Mês:* ' + monthLabel(mk) + '\n\n';
    texto += '💵 *Caixa (Dinheiro):* ' + fmt(totalCaixa) + '\n';
    texto += '📱 *Conta / PIX:* ' + fmt(totalConta) + '\n\n';
    texto += '💰 *Total Geral:* ' + fmt(totalCaixa + totalConta) + '\n\n✨ Gerado pelo Sistema Financeiro IEQ';
    compartilharWhatsApp(texto);
  }

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  async function inicializarSistema(){
    DB.loadLocal();
    aplicarConfiguracoes();
    buildGlobalMonthOptions();
    
    // Inicia sincronização em background
    sincronizarTudo(true);
    
    // Mostra página inicial
    showPage('dashboard');
    
    // Monitora fila offline
    setInterval(processarFilaOffline, 30000);
  }

  async function sincronizarTudo(background=false){
    if(!background) mostrarLoading(true);
    setSyncStatus('syncing');
    try {
      const [despesas, cultos, entradas] = await Promise.all([
        apiGet('despesas'), apiGet('cultos'), apiGet('entradas')
      ]);
      DB.despesas = despesas.map(normalizarDespesa);
      DB.cultos   = cultos.map(normalizarCulto);
      DB.entradas = entradas.map(normalizarEntrada);
      DB.saveLocal();
     const elSync = document.getElementById('ultimaSyncLabel');
     if (elSync) elSync.textContent = new Date().toLocaleTimeString('pt-BR');
      setSyncStatus('synced');
    } catch(err){
      console.error('Erro na sync:', err);
      setSyncStatus('error');
    } finally {
      if(!background) mostrarLoading(false);
      renderDashboard();
    }
  }

  // Fila Offline
  function enfileirarOperacao(op){
    const fila = JSON.parse(localStorage.getItem('offline_queue')||'[]');
    fila.push(op);
    localStorage.setItem('offline_queue', JSON.stringify(fila));
    atualizarBadgeOffline();
  }
  function atualizarBadgeOffline(){
    const fila = JSON.parse(localStorage.getItem('offline_queue')||'[]');
    const badge = document.getElementById('syncBadge');
    if(fila.length > 0){
      badge.textContent = fila.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
  async function processarFilaOffline(){
    const fila = JSON.parse(localStorage.getItem('offline_queue')||'[]');
    if(!fila.length) return;
    setSyncStatus('syncing');
    const novaFila = [];
    for(const op of fila){
      try {
        if(op.action==='save')   await apiSave(op.sheet, op.data);
        if(op.action==='update') await apiUpdate(op.sheet, op.id, op.data);
        if(op.action==='delete') await apiDelete(op.sheet, op.id);
      } catch(e){ novaFila.push(op); }
    }
    localStorage.setItem('offline_queue', JSON.stringify(novaFila));
    atualizarBadgeOffline();
    if(!novaFila.length) sincronizarTudo(true);
  }

  // Inicialização no DOM
  document.addEventListener('DOMContentLoaded', () => {
    SESSAO = carregarSessao();
    if(SESSAO) entrarNoSistema();
    else {
      document.getElementById('loginScreen').classList.add('active');
      document.getElementById('loginUser').value = localStorage.getItem('ieq_lembrar_user') || '';
    }
  });
