import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Bell, CalendarDays, ChevronDown, FileText, LayoutDashboard, Menu, Pencil, Plus, RefreshCw, Save, Search, Settings2, TrendingUp, X, BarChart3, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Project = { id: string; name: string; status: string; total_entry: number; total_exit: number };
type Operation = { id: string; project_id: string; operation_number: number; name: string };
type Movement = { id: string; project_id: string; operation_id: string; entry_total: number; exit_total: number; recorded_at: string; created_at: string };
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (value: number) => brl.format(Number.isFinite(value) ? value : 0);
const date = (value: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const parseAmount = (value: string) => Number(value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value) || 0;

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [projectId, setProjectId] = useState('');
  const [operationId, setOperationId] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editOperationName, setEditOperationName] = useState('');
  const [editOperationNumber, setEditOperationNumber] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [operationModal, setOperationModal] = useState<'add' | 'edit' | null>(null);
  const [opEditId, setOpEditId] = useState('');
  const [opNumber, setOpNumber] = useState('');
  const [opName, setOpName] = useState('');
  const [opProjectId, setOpProjectId] = useState('');
  const [expandedProject, setExpandedProject] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [inlineProjectName, setInlineProjectName] = useState('');
  const [view, setView] = useState<'dashboard' | 'reports' | 'settings'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const load = async () => {
    setLoading(true);
    const [p, o, m] = await Promise.all([
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('operations').select('*').order('operation_number'),
      supabase.from('movements').select('*').order('recorded_at', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (p.error || o.error || m.error) setMessage('Não foi possível carregar os dados.');
    const nextProjects = (p.data ?? []) as Project[];
    setProjects(nextProjects); setOperations((o.data ?? []) as Operation[]); setMovements((m.data ?? []) as Movement[]);
    setProjectId((current) => current || nextProjects[0]?.id || ''); setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const currentProject = projects.find((project) => project.id === projectId);
  const currentOperations = useMemo(() => operations.filter((operation) => operation.project_id === projectId), [operations, projectId]);
  const currentOperation = currentOperations.find((operation) => operation.id === operationId) ?? currentOperations[0];
  const history = movements.filter((item) => item.project_id === projectId && item.operation_id === currentOperation?.id).sort((a, b) => `${b.recorded_at}${b.created_at}`.localeCompare(`${a.recorded_at}${a.created_at}`));
  const allProjectHistory = movements.filter((item) => item.project_id === projectId).sort((a, b) => `${b.recorded_at}${b.created_at}`.localeCompare(`${a.recorded_at}${a.created_at}`));
  const displayedHistory = showAllHistory ? allProjectHistory : history;
  const displayedHistoryNet = useMemo(() => displayedHistory.map((item, i) => {
    const prev = displayedHistory.slice(i + 1).find((other) => other.operation_id === item.operation_id);
    const entryDiff = Number(item.entry_total) - (prev ? Number(prev.entry_total) : 0);
    const exitDiff = Number(item.exit_total) - (prev ? Number(prev.exit_total) : 0);
    return entryDiff - exitDiff;
  }), [displayedHistory]);
  const previous = history[0];
  const previousPrevious = history[1];
  const previousResult = previous
    ? (Number(previous.entry_total) - (previousPrevious ? Number(previousPrevious.entry_total) : 0)) - (Number(previous.exit_total) - (previousPrevious ? Number(previousPrevious.exit_total) : 0))
    : 0;
  const entryNumber = parseAmount(entry);
  const exitNumber = parseAmount(exit);
  const newEntry = entryNumber - (previous?.entry_total ?? 0);
  const newExit = exitNumber - (previous?.exit_total ?? 0);
  const projectTotals = useMemo(() => movements.reduce<Record<string, { entry: number; exit: number }>>((acc, item) => {
    if (!acc[item.project_id]) acc[item.project_id] = { entry: 0, exit: 0 };
    acc[item.project_id].entry += Number(item.entry_total) || 0;
    acc[item.project_id].exit += Number(item.exit_total) || 0;
    return acc;
  }, {}), [movements]);
  const projectEntry = projectTotals[projectId]?.entry ?? 0;
  const projectExit = projectTotals[projectId]?.exit ?? 0;
  const todayResult = useMemo(() => {
    const today = todayIso();
    const projectOps = operations.filter((op) => op.project_id === projectId);
    let result = 0;
    for (const op of projectOps) {
      const opMovements = movements
        .filter((m) => m.project_id === projectId && m.operation_id === op.id)
        .sort((a, b) => `${a.recorded_at}${a.created_at}`.localeCompare(`${b.recorded_at}${b.created_at}`));
      for (let i = 0; i < opMovements.length; i++) {
        const cur = opMovements[i];
        const prev = opMovements[i - 1];
        if (cur.recorded_at === today) {
          const entryDiff = Number(cur.entry_total) - (prev ? Number(prev.entry_total) : 0);
          const exitDiff = Number(cur.exit_total) - (prev ? Number(prev.exit_total) : 0);
          result += entryDiff - exitDiff;
        }
      }
    }
    return result;
  }, [movements, projectId, operations]);
  const projectTotal = todayResult;
  const projectResult = projectTotal / 2;
  const lastUpdateByProject = useMemo(() => movements.reduce<Record<string, string>>((acc, item) => {
    const cur = acc[item.project_id];
    if (!cur || item.recorded_at > cur) acc[item.project_id] = item.recorded_at;
    return acc;
  }, {}), [movements]);
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (currentOperations.length && !currentOperations.some((operation) => operation.id === operationId)) setOperationId(currentOperations[0].id);
  }, [currentOperations, operationId]);
  useEffect(() => {
    if (previous) { setEntry(String(previous.entry_total)); setExit(String(previous.exit_total)); }
    else { setEntry(''); setExit(''); }
  }, [previous, projectId, operationId]);

  const openEditor = () => {
    if (!currentProject || !currentOperation) return;
    setEditName(currentProject.name);
    setEditOperationName(currentOperation.name);
    setEditOperationNumber(String(currentOperation.operation_number));
    setEditingProject(true);
  };

  const saveEditor = async () => {
    if (!currentProject || !currentOperation || !editName.trim() || !editOperationName.trim() || !editOperationNumber) return;
    const numberValue = Number(editOperationNumber);
    if (!Number.isInteger(numberValue) || numberValue < 1) return;
    setSaving(true);
    const projectUpdate = await supabase.from('projects').update({ name: editName.trim() }).eq('id', currentProject.id);
    const operationUpdate = await supabase.from('operations').update({ name: editOperationName.trim(), operation_number: numberValue }).eq('id', currentOperation.id);
    if (projectUpdate.error || operationUpdate.error) setMessage('Não foi possível salvar as alterações.');
    else { setMessage('Projeto atualizado com sucesso.'); setEditingProject(false); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const openAddOperation = (pid: string) => {
    setOpProjectId(pid);
    setOpEditId('');
    const projectOps = operations.filter((op) => op.project_id === pid);
    const next = projectOps.length ? Math.max(...projectOps.map((op) => op.operation_number)) + 1 : 1;
    setOpNumber(String(next));
    setOpName('');
    setOperationModal('add');
  };

  const openEditOperation = (id: string) => {
    const op = operations.find((operation) => operation.id === id);
    if (!op) return;
    setOpProjectId(op.project_id);
    setOpEditId(id);
    setOpNumber(String(op.operation_number));
    setOpName(op.name);
    setOperationModal('edit');
  };

  const deleteOperation = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta operação e todos os seus lançamentos?')) return;
    setSaving(true);
    const { error } = await supabase.from('operations').delete().eq('id', id);
    if (error) setMessage('Não foi possível excluir a operação.');
    else { setMessage('Operação excluída.'); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const deleteMovement = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    setSaving(true);
    const { error } = await supabase.from('movements').delete().eq('id', id);
    if (error) setMessage('Não foi possível excluir o lançamento.');
    else { setMessage('Lançamento excluído.'); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const saveOperation = async () => {
    if (!opProjectId || !opName.trim() || !opNumber) return;
    const numberValue = Number(opNumber);
    if (!Number.isInteger(numberValue) || numberValue < 1) return;
    setSaving(true);
    if (operationModal === 'add') {
      const { error } = await supabase.from('operations').insert({ project_id: opProjectId, operation_number: numberValue, name: opName.trim() });
      if (error) setMessage('Não foi possível criar a operação.'); else { setMessage('Operação criada com sucesso.'); setOperationModal(null); await load(); }
    } else {
      const { error } = await supabase.from('operations').update({ operation_number: numberValue, name: opName.trim() }).eq('id', opEditId);
      if (error) setMessage('Não foi possível salvar a operação.'); else { setMessage('Operação atualizada com sucesso.'); setOperationModal(null); await load(); }
    }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const openAddProject = () => {
    setNewProjectName('');
    setProjectModal(true);
  };

  const saveProject = async () => {
    if (!newProjectName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('projects').insert({ name: newProjectName.trim() });
    if (error) setMessage('Não foi possível criar o projeto.');
    else { setMessage('Projeto criado com sucesso.'); setProjectModal(false); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este projeto e todos os seus lançamentos?')) return;
    setSaving(true);
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) setMessage('Não foi possível excluir o projeto.');
    else { setMessage('Projeto excluído.'); if (projectId === id) setProjectId(''); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const saveProjectName = async (id: string) => {
    const name = inlineProjectName.trim();
    if (!name || name === projects.find((project) => project.id === id)?.name) { setEditingProjectId(''); return; }
    setSaving(true);
    const { error } = await supabase.from('projects').update({ name }).eq('id', id);
    if (error) setMessage('Não foi possível salvar o nome do projeto.'); else { setMessage('Projeto atualizado com sucesso.'); await load(); }
    setEditingProjectId('');
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const save = async () => {
    if (!currentProject || !currentOperation || entry === '' || exit === '' || newEntry < 0 || newExit < 0) return;
    setSaving(true);
    const { error } = await supabase.from('movements').insert({ project_id: currentProject.id, operation_id: currentOperation.id, entry_total: entryNumber, exit_total: exitNumber, recorded_at: todayIso() });
    if (error) setMessage('Não foi possível salvar este lançamento.'); else { setMessage('Lançamento salvo no histórico.'); await load(); }
    setSaving(false); window.setTimeout(() => setMessage(''), 3000);
  };

  const dashboardView = <div className="layout"><aside><div className="aside-title"><div><small>CARTEIRA</small><h2>Projetos ativos</h2></div></div>{loading ? <p className="muted">Carregando projetos...</p> : <div className="projects">{filteredProjects.map((project) => <article className={`project ${project.id === projectId ? 'selected' : ''}`} key={project.id} onClick={() => { setProjectId(project.id); setOperationId(''); }}><div className="project-name"><b>{project.name}</b><span>Ativo</span></div><button className="edit-project" aria-label={`Editar ${project.name}`} onClick={(event) => { event.stopPropagation(); if (project.id === projectId) openEditor(); else { setProjectId(project.id); setOperationId(''); } }}><Pencil size={13} /></button><div className="totals"><div className="last-update"><span>Última alteração</span><strong>{lastUpdateByProject[project.id] ? date(lastUpdateByProject[project.id]) : 'Sem registros'}</strong></div></div></article>)}</div>}<div className="help">Central de ajuda <span>?</span></div></aside>
  <main>{message && <div className="notice">{message}</div>}<div className="main-heading"><div><small>LANÇAMENTO OPERACIONAL</small><h2>{currentProject?.name ?? 'Selecione um projeto'}</h2><p>Acompanhe o realizado por etapa e registre o novo acumulado.</p></div><div className="reference"><CalendarDays size={16} /> Referência de hoje<strong>{date(todayIso())}</strong></div></div><div className="operation-picker"><span>Fichas</span><label><select value={currentOperation?.id ?? ''} onChange={(event) => setOperationId(event.target.value)}>{currentOperations.map((operation) => <option key={operation.id} value={operation.id}>{String(operation.operation_number).padStart(2, '0')} — {operation.name}</option>)}</select><ChevronDown size={15} /></label></div>
  <div className="cards"><section className="card"><div className="card-head"><div><small>NOVO LANÇAMENTO</small><h3>Informe os acumulados atuais</h3></div><em>01</em></div><div className="inputs"><label>Entrada acumulada<div><b>R$</b><input inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="0,00" /><ArrowUpRight size={16} /></div><small>Valor total realizado até agora</small></label><label>Saída acumulada<div><b>R$</b><input inputMode="decimal" value={exit} onChange={(event) => setExit(event.target.value)} placeholder="0,00" /><ArrowDownRight size={16} /></div><small>Custos totais realizados até agora</small></label></div><button className="save" disabled={saving || entry === '' || exit === '' || newEntry < 0 || newExit < 0} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar lançamento'} <ArrowUpRight size={16} /></button></section><section className="card"><div className="card-head"><div><small>BASE DE COMPARAÇÃO</small><h3>Lançamento anterior</h3></div><em className="muted-badge">02</em></div>{previous ? <><div className="previous-date"><div><strong>{date(previous.recorded_at)}</strong><span>Último registro encontrado</span></div><CalendarDays size={17} /></div><div className="previous-values"><div>Entrada<strong>{money(previous.entry_total)}</strong></div><div>Saída<strong>{money(previous.exit_total)}</strong></div><div>Resultado<strong style={previousResult < 0 ? { color: '#dc2626' } : undefined}>{money(previousResult)}</strong></div></div><p className="tip">O novo movimento será calculado automaticamente a partir deste lançamento.</p></> : <p className="empty">Ainda não há lançamento anterior para esta operação.</p>}</section></div>
  <section className={`result ${projectTotal < 0 ? 'negative' : ''}`}><div><small>RESULTADO DO DIA</small><h3>Resultado do dia</h3><span>Soma dos lançamentos de hoje (entrada nova - anterior) - (saída nova - anterior)</span></div><div className="result-number"><strong>{money(projectTotal)}</strong><span>{projectTotal >= 0 ? <><ArrowUpRight size={16} /> Positivo</> : <><ArrowDownRight size={16} /> Negativo</>}</span></div><div className="breakdown"><div>Resultado dividido por 2<strong>{money(projectResult)}</strong></div></div></section>
  <section className="history"><div className="section-head"><div><small>CONSULTA DE LANÇAMENTOS</small><h3>{showAllHistory ? 'Todas as entradas do projeto' : 'Histórico da operação'}</h3></div><div className="history-actions"><button className={showAllHistory ? 'history-toggle active' : 'history-toggle'} onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? 'Ver operação atual' : 'Ver todas as entradas'}</button><span>{displayedHistory.length} registros</span></div></div>{displayedHistory.length ? <div className="table"><div className="row header"><span>Data</span>{showAllHistory && <span>Operação</span>}<span>Entrada acumulada</span><span>Saída acumulada</span><span>Movimento líquido</span><span /></div>{displayedHistory.map((item, i) => <div className={`row ${showAllHistory ? 'with-operation' : ''}`} key={item.id}><span><CalendarDays size={13} /> {date(item.recorded_at)}</span>{showAllHistory && <span>{operations.find((operation) => operation.id === item.operation_id)?.name ?? 'Operação'}</span>}<span>{money(item.entry_total)}</span><span>{money(item.exit_total)}</span><strong style={displayedHistoryNet[i] < 0 ? { color: '#dc2626' } : undefined}>{money(displayedHistoryNet[i])}</strong><button className="row-delete" aria-label="Excluir lançamento" title="Excluir lançamento" disabled={saving} onClick={() => void deleteMovement(item.id)}><Trash2 size={14} /></button></div>)}</div> : <p className="empty table-empty">Nenhum histórico disponível para a consulta selecionada.</p>}</section></main></div>;

  const reportsView = <div className="reports-view"><div className="reports-header"><div><small>RELATÓRIOS</small><h2>Visão geral de todos os projetos</h2></div><BarChart3 size={22} className="reports-icon" /></div><div className="reports-grid">{projects.map((project) => {const entry = projectTotals[project.id]?.entry ?? 0; const exit = projectTotals[project.id]?.exit ?? 0; const total = entry - exit; const half = total / 2; return <section className={`report-card ${total < 0 ? 'negative' : ''}`} key={project.id}><div className="report-card-head"><div><h3>{project.name}</h3><span>{project.status}</span></div></div><div className="report-totals"><div><small>Entradas</small><strong>{money(entry)}</strong></div><div><small>Saídas</small><strong>{money(exit)}</strong></div></div><div className="report-result"><div><span>Resultado total</span><strong>{money(total)}</strong></div><div><span>÷ 2</span><strong>{money(half)}</strong></div></div></section>;})}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  const settingsView = <div className="settings-view"><div className="settings-header"><div><small>CONFIGURAÇÕES</small><h2>Gerenciar projetos e operações</h2></div><Settings2 size={22} className="settings-icon" /></div><p className="settings-desc">Crie, edite ou exclua projetos, e adicione, edite ou exclua operações de cada projeto.</p><button className="add" style={{ maxWidth: 220, marginBottom: 20 }} onClick={() => void openAddProject()}><Plus size={15} /> Adicionar projeto</button><div className="settings-list">{projects.map((project) => <div className={`settings-block ${expandedProject === project.id ? 'expanded' : ''}`} key={project.id}><div className="settings-row" onClick={() => setExpandedProject(expandedProject === project.id ? '' : project.id)}><div className="settings-row-info">{editingProjectId === project.id ? <input autoFocus className="inline-edit" value={inlineProjectName} onChange={(event) => setInlineProjectName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setEditingProjectId(''); }} onBlur={() => void saveProjectName(project.id)} /> : <b onClick={(event) => { event.stopPropagation(); setEditingProjectId(project.id); setInlineProjectName(project.name); }}>{project.name}</b>}<span>{operations.filter((op) => op.project_id === project.id).length} operações</span></div><div className="settings-row-actions"><button className="ghost danger" onClick={(event) => { event.stopPropagation(); void deleteProject(project.id); }}><Trash2 size={14} /> Excluir projeto</button><button className="ghost" onClick={(event) => { event.stopPropagation(); setExpandedProject(expandedProject === project.id ? '' : project.id); }}>{expandedProject === project.id ? 'Recolher' : 'Operações'}</button></div></div>{expandedProject === project.id && <div className="settings-ops"><div className="settings-ops-head"><small>Operações de {project.name}</small><button className="add-operation" onClick={() => void openAddOperation(project.id)}><Plus size={15} /> Nova operação</button></div><div className="settings-ops-list">{operations.filter((op) => op.project_id === project.id).length ? operations.filter((op) => op.project_id === project.id).map((op) => <div className="settings-op-row" key={op.id}><div className="settings-op-info"><span className="op-num">{String(op.operation_number).padStart(2, '0')}</span><b>{op.name}</b></div><div className="settings-op-actions"><button className="ghost" onClick={() => void openEditOperation(op.id)}><Pencil size={13} /> Editar</button><button className="ghost danger" onClick={() => void deleteOperation(op.id)}><Trash2 size={13} /> Excluir</button></div></div>) : <p className="empty" style={{ padding: '12px 0' }}>Nenhuma operação cadastrada.</p>}</div></div>}</div>)}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  return <div className="app"><header className="topbar"><div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div><nav className={mobileMenuOpen ? 'mobile-open' : ''}><button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setView('dashboard'); setMobileMenuOpen(false); }}><LayoutDashboard size={16} /> Painel principal</button><button className={view === 'reports' ? 'active' : ''} onClick={() => { setView('reports'); setMobileMenuOpen(false); }}><FileText size={16} /> Relatórios</button><button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setMobileMenuOpen(false); }}><Settings2 size={16} /> Configurações</button></nav><div className="profile"><Bell size={17} /><span className="avatar">CM</span><b>Carlos Mendes</b><ChevronDown size={15} /><button className="mobile-toggle" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={19} /></button></div></header>
  <div className="page-title"><div><small>{view === 'reports' ? 'RELATÓRIOS' : view === 'settings' ? 'CONFIGURAÇÕES' : 'VISÃO GERAL'}</small><h1>{view === 'reports' ? 'Relatórios' : view === 'settings' ? 'Configurações' : 'Dashboard'}</h1></div><div className="tools"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar projeto..." /></label><button className="ghost" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</button></div></div>
  {message && view !== 'dashboard' && <div className="notice" style={{ maxWidth: 1120, margin: '0 auto', padding: '10px 40px' }}>{message}</div>}
  {view === 'dashboard' && dashboardView}
  {view === 'reports' && reportsView}
  {view === 'settings' && settingsView}
{editingProject && <div className="modal-backdrop" onClick={() => setEditingProject(false)}><section className="edit-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><small>EDITAR CADASTRO</small><h3>{currentProject?.name}</h3></div><button className="close-modal" onClick={() => setEditingProject(false)}><X size={18} /></button></div><label>Nome do projeto<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div className="modal-grid"><label>Número da operação<input inputMode="numeric" value={editOperationNumber} onChange={(event) => setEditOperationNumber(event.target.value)} /></label><label>Nome da operação<input value={editOperationName} onChange={(event) => setEditOperationName(event.target.value)} /></label></div><div className="modal-actions"><button className="ghost" onClick={() => setEditingProject(false)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void saveEditor()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar alterações'}</button></div></section></div>}{operationModal && <div className="modal-backdrop" onClick={() => setOperationModal(null)}><section className="edit-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><small>{operationModal === 'add' ? 'NOVA OPERAÇÃO' : 'EDITAR OPERAÇÃO'}</small><h3>{operationModal === 'add' ? 'Adicionar operação' : 'Editar operação'}</h3></div><button className="close-modal" onClick={() => setOperationModal(null)}><X size={18} /></button></div><div className="modal-grid"><label>Número da operação<input inputMode="numeric" value={opNumber} onChange={(event) => setOpNumber(event.target.value)} /></label><label>Nome da operação<input value={opName} onChange={(event) => setOpName(event.target.value)} /></label></div><div className="modal-actions"><button className="ghost" onClick={() => setOperationModal(null)}>Cancelar</button><button className="save modal-save" disabled={saving || !opName.trim() || !opNumber} onClick={() => void saveOperation()}><Save size={15} /> {saving ? 'Salvando...' : operationModal === 'add' ? 'Criar operação' : 'Salvar alterações'}</button></div></section></div>}{projectModal && <div className="modal-backdrop" onClick={() => setProjectModal(false)}><section className="edit-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><small>NOVO PROJETO</small><h3>Adicionar projeto</h3></div><button className="close-modal" onClick={() => setProjectModal(false)}><X size={18} /></button></div><label>Nome do projeto<input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Ex: Contrato Porto Sul" /></label><div className="modal-actions"><button className="ghost" onClick={() => setProjectModal(false)}>Cancelar</button><button className="save modal-save" disabled={saving || !newProjectName.trim()} onClick={() => void saveProject()}><Save size={15} /> {saving ? 'Salvando...' : 'Criar projeto'}</button></div></section></div>}</div>;
}
export default App;
