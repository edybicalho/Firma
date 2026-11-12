import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, Download, FileText, History, LayoutDashboard, LogOut, Menu, Pencil, Plus, RefreshCw, Save, Search, Settings2, StickyNote, TrendingUp, X, BarChart3, Trash2, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { emailToUsername } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Login, PendingAccess } from '@/Login';
import { UsersAdmin } from '@/UsersAdmin';
import { AuditLog } from '@/AuditLog';
import { fetchAllPages } from '@/lib/pages';
import { byDateDesc, dayResult, formatAmountInput, lastDayByProject, money, movementsCsv, netById, parseAmount, todayIso } from '@/lib/calc';
import type { Movement } from '@/lib/calc';

type Project = { id: string; name: string; status: string; total_entry: number; total_exit: number; notes: string | null };
type Operation = { id: string; project_id: string; operation_number: number; name: string };
const date = (value: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
const DUPLICATE = '23505';
const operationError = (error: { code?: string }, fallback: string) => (error.code === DUPLICATE ? 'Já existe uma operação com esse número neste projeto.' : fallback);

function Workspace({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const isAdmin = profile.role === 'admin';
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
  const [view, setView] = useState<'dashboard' | 'reports' | 'settings' | 'users' | 'audit'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [notesProjectId, setNotesProjectId] = useState('');
  const notify = useCallback((text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 3000); }, []);
  const [notesText, setNotesText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    // Busca tudo em páginas (o Supabase entrega no máximo 1.000 linhas por vez)
    const [p, o, m] = await Promise.all([
      fetchAllPages<Project>((from, to) => supabase.from('projects').select('*').order('created_at').order('id').range(from, to)),
      fetchAllPages<Operation>((from, to) => supabase.from('operations').select('*').order('operation_number').order('id').range(from, to)),
      fetchAllPages<Movement>((from, to) => supabase.from('movements').select('*').order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
    ]);
    if (p.error || o.error || m.error) {
      // Em caso de falha, mantém os dados que já estavam na tela em vez de mostrar números pela metade
      setMessage('Não foi possível carregar os dados. Verifique a internet e clique em Atualizar.');
      setLoading(false);
      return;
    }
    setProjects(p.data); setOperations(o.data); setMovements(m.data);
    setProjectId((current) => (p.data.some((project) => project.id === current) ? current : p.data[0]?.id || '')); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const currentProject = projects.find((project) => project.id === projectId);
  const currentOperations = useMemo(() => operations.filter((operation) => operation.project_id === projectId), [operations, projectId]);
  const currentOperation = currentOperations.find((operation) => operation.id === operationId) ?? currentOperations[0];
  // Movimento real de cada lançamento (diferença para o anterior da mesma operação)
  const net = useMemo(() => netById(movements), [movements]);
  const history = useMemo(() => movements.filter((item) => item.project_id === projectId && item.operation_id === currentOperation?.id).sort(byDateDesc), [movements, projectId, currentOperation?.id]);
  const allProjectHistory = useMemo(() => movements.filter((item) => item.project_id === projectId).sort(byDateDesc), [movements, projectId]);
  const displayedHistory = showAllHistory ? allProjectHistory : history;
  const previous = history[0];
  const previousResult = previous ? net.get(previous.id) ?? 0 : 0;
  const entryNumber = parseAmount(entry);
  const exitNumber = parseAmount(exit);
  const entryInvalid = entry.trim() !== '' && entryNumber === null;
  const exitInvalid = exit.trim() !== '' && exitNumber === null;
  const newEntry = (entryNumber ?? 0) - Number(previous?.entry_total ?? 0);
  const newExit = (exitNumber ?? 0) - Number(previous?.exit_total ?? 0);
  const entryProblem = entryInvalid ? 'Valor inválido. Use, por exemplo, 1.234,56' : newEntry < 0 && entryNumber !== null ? `Não pode ser menor que o lançamento anterior (${money(Number(previous?.entry_total ?? 0))}).` : '';
  const exitProblem = exitInvalid ? 'Valor inválido. Use, por exemplo, 1.234,56' : newExit < 0 && exitNumber !== null ? `Não pode ser menor que o lançamento anterior (${money(Number(previous?.exit_total ?? 0))}).` : '';
  const canSave = !saving && entryNumber !== null && exitNumber !== null && !entryProblem && !exitProblem;
  const today = todayIso();
  const projectTotal = useMemo(() => dayResult(movements, net, projectId, today), [movements, net, projectId, today]);
  const projectResult = projectTotal / 2;
  const lastUpdateByProject = useMemo(() => lastDayByProject(movements), [movements]);
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (currentOperations.length && !currentOperations.some((operation) => operation.id === operationId)) setOperationId(currentOperations[0].id);
  }, [currentOperations, operationId]);
  useEffect(() => {
    if (previous) { setEntry(formatAmountInput(previous.entry_total)); setExit(formatAmountInput(previous.exit_total)); }
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
    if (projectUpdate.error || operationUpdate.error) setMessage(operationUpdate.error ? operationError(operationUpdate.error, 'Não foi possível salvar as alterações.') : 'Não foi possível salvar as alterações.');
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
    setOpName('Ficha');
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
    const count = movements.filter((item) => item.operation_id === id).length;
    if (!confirm(`Tem certeza que deseja excluir esta operação e os ${count} lançamento(s) dela?`)) return;
    setSaving(true);
    const { error } = await supabase.from('operations').delete().eq('id', id);
    if (error) setMessage('Não foi possível excluir a operação.');
    else { setMessage('Operação excluída.'); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const deleteMovement = async (id: string) => {
    const target = movements.find((item) => item.id === id);
    if (!target || target.recorded_at !== todayIso()) { setMessage('Só é possível excluir lançamentos feitos hoje.'); window.setTimeout(() => setMessage(''), 3000); return; }
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
      if (error) setMessage(operationError(error, 'Não foi possível criar a operação.')); else { setMessage('Operação criada com sucesso.'); setOperationModal(null); await load(); }
    } else {
      const { error } = await supabase.from('operations').update({ operation_number: numberValue, name: opName.trim() }).eq('id', opEditId);
      if (error) setMessage(operationError(error, 'Não foi possível salvar a operação.')); else { setMessage('Operação atualizada com sucesso.'); setOperationModal(null); await load(); }
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

  const openNotes = (project: Project) => {
    setNotesProjectId(project.id);
    setNotesText(project.notes ?? '');
  };

  const saveNotes = async () => {
    if (!notesProjectId) return;
    setSaving(true);
    const notes = notesText.trim();
    const { error } = await supabase.from('projects').update({ notes: notes || null }).eq('id', notesProjectId);
    if (error) setMessage('Não foi possível salvar as observações.');
    else { setMessage('Observações salvas.'); setNotesProjectId(''); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const downloadBackup = () => {
    const opLabel = (id: string) => { const op = operations.find((operation) => operation.id === id); return op ? `${String(op.operation_number).padStart(2, '0')} — ${op.name}` : 'Operação excluída'; };
    const csv = movementsCsv(movements, (id) => projects.find((project) => project.id === id)?.name ?? 'Projeto excluído', opLabel);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `acumula-lancamentos-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const deleteProject = async (id: string) => {
    const name = projects.find((project) => project.id === id)?.name ?? '';
    const count = movements.filter((item) => item.project_id === id).length;
    const typed = prompt(`Excluir o projeto "${name}" apaga também as operações e ${count} lançamento(s).\n\nPara confirmar, digite o nome do projeto:`);
    if (typed === null) return;
    if (typed.trim() !== name.trim()) { setMessage('O nome digitado não confere. Nada foi excluído.'); window.setTimeout(() => setMessage(''), 3000); return; }
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
    if (!currentProject || !currentOperation || !canSave || entryNumber === null || exitNumber === null) return;
    if (previous && previous.recorded_at === today && newEntry === 0 && newExit === 0 && !confirm('Os valores são iguais aos do último lançamento de hoje. Salvar mesmo assim?')) return;
    setSaving(true);
    const { error } = await supabase.from('movements').insert({ project_id: currentProject.id, operation_id: currentOperation.id, entry_total: entryNumber, exit_total: exitNumber, recorded_at: todayIso() });
    if (error) setMessage('Não foi possível salvar este lançamento.'); else { setMessage('Lançamento salvo no histórico.'); await load(); }
    setSaving(false); window.setTimeout(() => setMessage(''), 3000);
  };

  const dashboardView = <div className="layout"><aside><div className="aside-title"><div><small>CARTEIRA</small><h2>Projetos ativos</h2></div></div>{loading ? <p className="muted">Carregando projetos...</p> : <div className="projects">{filteredProjects.map((project) => <article className={`project ${project.id === projectId ? 'selected' : ''}`} key={project.id} onClick={() => { setProjectId(project.id); setOperationId(''); }}><div className="project-name"><b>{project.name}</b></div>{isAdmin && <button className="edit-project" aria-label={`Editar ${project.name}`} onClick={(event) => { event.stopPropagation(); if (project.id === projectId) openEditor(); else { setProjectId(project.id); setOperationId(''); } }}><Pencil size={13} /></button>}<div className="totals"><div className="last-update"><span>Última alteração</span><strong>{lastUpdateByProject[project.id] ? date(lastUpdateByProject[project.id]) : 'Sem registros'}</strong></div></div></article>)}</div>}</aside>
  <main>{message && <div className="notice">{message}</div>}<div className="main-heading"><div><small>LANÇAMENTO OPERACIONAL</small><h2>{currentProject?.name ?? 'Selecione um projeto'}</h2><p>Acompanhe o realizado por etapa e registre o novo acumulado.</p></div><div className="reference"><CalendarDays size={16} /> Referência de hoje<strong>{date(todayIso())}</strong></div></div><div className="operation-picker"><span>Fichas</span><label><select value={currentOperation?.id ?? ''} onChange={(event) => setOperationId(event.target.value)}>{currentOperations.map((operation) => <option key={operation.id} value={operation.id}>{String(operation.operation_number).padStart(2, '0')} — {operation.name}</option>)}</select><ChevronDown size={15} /></label></div>
  <div className="cards"><section className="card"><div className="card-head"><div><small>NOVO LANÇAMENTO</small><h3>Informe os acumulados atuais</h3></div><em>01</em></div><div className="inputs"><label>Entrada acumulada<div><b>R$</b><input inputMode="decimal" aria-invalid={!!entryProblem} value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="0,00" /><ArrowUpRight size={16} /></div>{entryProblem ? <small className="field-error">{entryProblem}</small> : <small>Valor total realizado até agora</small>}</label><label>Saída acumulada<div><b>R$</b><input inputMode="decimal" aria-invalid={!!exitProblem} value={exit} onChange={(event) => setExit(event.target.value)} placeholder="0,00" /><ArrowDownRight size={16} /></div>{exitProblem ? <small className="field-error">{exitProblem}</small> : <small>Custos totais realizados até agora</small>}</label></div><button className="save" disabled={!canSave || !currentOperation} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar lançamento'} <ArrowUpRight size={16} /></button></section><section className="card"><div className="card-head"><div><small>BASE DE COMPARAÇÃO</small><h3>Lançamento anterior</h3></div><em className="muted-badge">02</em></div>{previous ? <><div className="previous-date"><div><strong>{date(previous.recorded_at)}</strong><span>Último registro encontrado</span></div><CalendarDays size={17} /></div><div className="previous-values"><div>Entrada<strong>{money(previous.entry_total)}</strong></div><div>Saída<strong>{money(previous.exit_total)}</strong></div><div>Resultado<strong style={previousResult < 0 ? { color: '#dc2626' } : undefined}>{money(previousResult)}</strong></div></div><p className="tip">O novo movimento será calculado automaticamente a partir deste lançamento.</p></> : <p className="empty">Ainda não há lançamento anterior para esta operação.</p>}</section></div>
  <section className={`result ${projectTotal < 0 ? 'negative' : ''}`}><div><small>RESULTADO DO DIA</small><h3>Resultado do dia</h3><span>Soma dos lançamentos de hoje (entrada nova - anterior) - (saída nova - anterior)</span></div><div className="result-number"><strong>{money(projectTotal)}</strong><span>{projectTotal >= 0 ? <><ArrowUpRight size={16} /> Positivo</> : <><ArrowDownRight size={16} /> Negativo</>}</span></div><div className="breakdown"><div>Resultado dividido por 2<strong>{money(projectResult)}</strong></div></div></section>
  <section className="history"><div className="section-head"><div><small>CONSULTA DE LANÇAMENTOS</small><h3>{showAllHistory ? 'Todas as entradas do projeto' : 'Histórico da operação'}</h3></div><div className="history-actions"><button className={showAllHistory ? 'history-toggle active' : 'history-toggle'} onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? 'Ver operação atual' : 'Ver todas as entradas'}</button><span>{displayedHistory.length} registros</span></div></div>{displayedHistory.length ? <div className="table"><div className={`row header ${showAllHistory ? 'with-operation' : ''}`}><span>Data</span>{showAllHistory && <span>Operação</span>}<span className="num">Entrada acumulada</span><span className="num">Saída acumulada</span><span className="num">Movimento líquido</span><span /></div>{displayedHistory.map((item) => <div className={`row ${showAllHistory ? 'with-operation' : ''}`} key={item.id}><span><CalendarDays size={13} /> {date(item.recorded_at)}</span>{showAllHistory && <span className="op-cell">{(() => { const op = operations.find((operation) => operation.id === item.operation_id); return op ? `${String(op.operation_number).padStart(2, '0')} — ${op.name}` : 'Operação'; })()}</span>}<span className="num" data-label="Entrada acumulada">{money(item.entry_total)}</span><span className="num" data-label="Saída acumulada">{money(item.exit_total)}</span><strong className="num" data-label="Movimento líquido" style={(net.get(item.id) ?? 0) < 0 ? { color: '#dc2626' } : undefined}>{money(net.get(item.id) ?? 0)}</strong>{item.recorded_at === today ? <button className="row-delete" aria-label="Excluir lançamento" title="Excluir lançamento" disabled={saving} onClick={() => void deleteMovement(item.id)}><Trash2 size={14} /></button> : <span />}</div>)}</div> : <p className="empty table-empty">Nenhum histórico disponível para a consulta selecionada.</p>}</section></main></div>;

  const reportsView = <div className="reports-view"><div className="reports-header"><div><small>RELATÓRIOS</small><h2>Visão geral de todos os projetos</h2></div><BarChart3 size={22} className="reports-icon" /></div><div className="reports-grid">{filteredProjects.map((project) => {const lastDay = lastUpdateByProject[project.id]; const total = lastDay ? dayResult(movements, net, project.id, lastDay) : 0; const half = total / 2; return <section className={`report-card ${total < 0 ? 'negative' : ''}`} key={project.id}><div className="report-card-head"><div><h3>{project.name}</h3><span>{project.status}</span></div><button className={`notes-button ${project.notes ? 'has-notes' : ''}`} title={project.notes ?? 'Adicionar observações'} onClick={() => openNotes(project)}><StickyNote size={14} /> {project.notes ? 'Ver observações' : 'Observações'}</button></div>{project.notes && <p className="report-notes">{project.notes}</p>}<div className="report-result single"><div><span>Último resultado ÷ 2{lastDay ? ` · ${date(lastDay)}` : ''}</span><strong>{money(half)}</strong></div></div></section>;})}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  const settingsView = <div className="settings-view"><div className="settings-header"><div><small>CONFIGURAÇÕES</small><h2>Gerenciar projetos e operações</h2></div><Settings2 size={22} className="settings-icon" /></div><p className="settings-desc">Crie, edite ou exclua projetos, e adicione, edite ou exclua operações de cada projeto.</p><div className="settings-top-actions"><button className="add" style={{ maxWidth: 220 }} onClick={() => void openAddProject()}><Plus size={15} /> Adicionar projeto</button><button className="ghost" title="Baixa uma planilha com todos os lançamentos, para guardar como cópia de segurança" onClick={downloadBackup}><Download size={14} /> Baixar planilha de lançamentos</button></div><div className="settings-list">{filteredProjects.map((project) => <div className={`settings-block ${expandedProject === project.id ? 'expanded' : ''}`} key={project.id}><div className="settings-row" onClick={() => setExpandedProject(expandedProject === project.id ? '' : project.id)}><div className="settings-row-info">{editingProjectId === project.id ? <input autoFocus className="inline-edit" value={inlineProjectName} onChange={(event) => setInlineProjectName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setEditingProjectId(''); }} onBlur={() => void saveProjectName(project.id)} /> : <b onClick={(event) => { event.stopPropagation(); setEditingProjectId(project.id); setInlineProjectName(project.name); }}>{project.name}</b>}<span>{operations.filter((op) => op.project_id === project.id).length} operações</span></div><div className="settings-row-actions"><button className="ghost danger" onClick={(event) => { event.stopPropagation(); void deleteProject(project.id); }}><Trash2 size={14} /> Excluir projeto</button><button className="ghost" onClick={(event) => { event.stopPropagation(); setExpandedProject(expandedProject === project.id ? '' : project.id); }}>{expandedProject === project.id ? 'Recolher' : 'Operações'}</button></div></div>{expandedProject === project.id && <div className="settings-ops"><div className="settings-ops-head"><small>Operações de {project.name}</small><button className="add-operation" onClick={() => void openAddOperation(project.id)}><Plus size={15} /> Nova operação</button></div><div className="settings-ops-list">{operations.filter((op) => op.project_id === project.id).length ? operations.filter((op) => op.project_id === project.id).map((op) => <div className="settings-op-row" key={op.id}><div className="settings-op-info"><span className="op-num">{String(op.operation_number).padStart(2, '0')}</span><b>{op.name}</b></div><div className="settings-op-actions"><button className="ghost" onClick={() => void openEditOperation(op.id)}><Pencil size={13} /> Editar</button><button className="ghost danger" onClick={() => void deleteOperation(op.id)}><Trash2 size={13} /> Excluir</button></div></div>) : <p className="empty" style={{ padding: '12px 0' }}>Nenhuma operação cadastrada.</p>}</div></div>}</div>)}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  const auditView = <div className="settings-view"><div className="settings-header"><div><small>REGISTRO</small><h2>Quem fez o quê e quando</h2></div><History size={22} className="settings-icon" /></div><AuditLog projects={projects} operations={operations} /></div>;

  const usersView = <div className="settings-view"><div className="settings-header"><div><small>USUÁRIOS</small><h2>Gerenciar usuários e acessos</h2></div><Users size={22} className="settings-icon" /></div><UsersAdmin currentUserId={profile.id} notify={notify} /></div>;

  return <div className="app"><header className="topbar"><div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div><nav className={mobileMenuOpen ? 'mobile-open' : ''}><button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setView('dashboard'); setMobileMenuOpen(false); }}><LayoutDashboard size={16} /> Painel principal</button><button className={view === 'reports' ? 'active' : ''} onClick={() => { setView('reports'); setMobileMenuOpen(false); }}><FileText size={16} /> Relatórios</button>{isAdmin && <button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setMobileMenuOpen(false); }}><Settings2 size={16} /> Configurações</button>}{isAdmin && <button className={view === 'users' ? 'active' : ''} onClick={() => { setView('users'); setMobileMenuOpen(false); }}><Users size={16} /> Usuários</button>}{isAdmin && <button className={view === 'audit' ? 'active' : ''} onClick={() => { setView('audit'); setMobileMenuOpen(false); }}><History size={16} /> Registro</button>}</nav><div className="profile"><span className="user-chip"><b>{profile.name}</b><small>{isAdmin ? 'Administrador' : 'Operador'}</small></span><button className="ghost logout" onClick={onSignOut}><LogOut size={14} /> Sair</button><button className="mobile-toggle" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={19} /></button></div></header>
  <div className="page-title"><div>{view !== 'dashboard' && <small>{view === 'reports' ? 'RELATÓRIOS' : view === 'users' ? 'USUÁRIOS' : view === 'audit' ? 'REGISTRO' : 'CONFIGURAÇÕES'}</small>}<h1>{view === 'reports' ? 'Relatórios' : view === 'settings' ? 'Configurações' : view === 'users' ? 'Usuários' : view === 'audit' ? 'Registro de alterações' : 'PONTOS'}</h1></div><div className="tools">{view !== 'users' && view !== 'audit' && <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar projeto..." /></label>}<button className="ghost" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</button></div></div>
  {message && view !== 'dashboard' && <div className="notice" style={{ maxWidth: 1120, margin: '0 auto', padding: '10px 40px' }}>{message}</div>}
  {view === 'dashboard' && dashboardView}
  {view === 'reports' && reportsView}
  {view === 'settings' && isAdmin && settingsView}
  {view === 'users' && isAdmin && usersView}
  {view === 'audit' && isAdmin && auditView}
{editingProject && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>EDITAR CADASTRO</small><h3>{currentProject?.name}</h3></div><button className="close-modal" onClick={() => setEditingProject(false)}><X size={18} /></button></div><label>Nome do projeto<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div className="modal-grid"><label>Número da operação<input inputMode="numeric" value={editOperationNumber} onChange={(event) => setEditOperationNumber(event.target.value)} /></label><label>Nome da operação<input value={editOperationName} onChange={(event) => setEditOperationName(event.target.value)} /></label></div><div className="modal-actions"><button className="ghost" onClick={() => setEditingProject(false)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void saveEditor()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar alterações'}</button></div></section></div>}{operationModal && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>{operationModal === 'add' ? 'NOVA OPERAÇÃO' : 'EDITAR OPERAÇÃO'}</small><h3>{operationModal === 'add' ? 'Adicionar operação' : 'Editar operação'}</h3></div><button className="close-modal" onClick={() => setOperationModal(null)}><X size={18} /></button></div><div className="modal-grid"><label>Número da operação<input inputMode="numeric" value={opNumber} onChange={(event) => setOpNumber(event.target.value)} /></label><label>Nome da operação<input value={opName} onChange={(event) => setOpName(event.target.value)} /></label></div><div className="modal-actions"><button className="ghost" onClick={() => setOperationModal(null)}>Cancelar</button><button className="save modal-save" disabled={saving || !opName.trim() || !opNumber} onClick={() => void saveOperation()}><Save size={15} /> {saving ? 'Salvando...' : operationModal === 'add' ? 'Criar operação' : 'Salvar alterações'}</button></div></section></div>}{projectModal && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>NOVO PROJETO</small><h3>Adicionar projeto</h3></div><button className="close-modal" onClick={() => setProjectModal(false)}><X size={18} /></button></div><label>Nome do projeto<input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Ex: Contrato Porto Sul" /></label><div className="modal-actions"><button className="ghost" onClick={() => setProjectModal(false)}>Cancelar</button><button className="save modal-save" disabled={saving || !newProjectName.trim()} onClick={() => void saveProject()}><Save size={15} /> {saving ? 'Salvando...' : 'Criar projeto'}</button></div></section></div>}{notesProjectId && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>OBSERVAÇÕES</small><h3>{projects.find((project) => project.id === notesProjectId)?.name}</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setNotesProjectId('')}><X size={18} /></button></div><label htmlFor="project-notes">Anotações sobre o projeto<textarea id="project-notes" autoFocus rows={7} value={notesText} onChange={(event) => setNotesText(event.target.value)} placeholder="Escreva aqui" /></label><div className="modal-actions"><button className="ghost" onClick={() => setNotesProjectId('')}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void saveNotes()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar observações'}</button></div></section></div>}</div>;
}
function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const loadProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [userId]);
  useEffect(() => { setProfile(undefined); void loadProfile(); }, [loadProfile]);

  const signOut = () => { void supabase.auth.signOut(); };

  if (session === undefined || (session && profile === undefined)) return <div className="auth-screen"><p className="muted">Carregando...</p></div>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <PendingAccess username={profile?.username ?? emailToUsername(session.user.email ?? '')} onRetry={() => void loadProfile()} onSignOut={signOut} />;
  return <Workspace key={profile.id} profile={profile} onSignOut={signOut} />;
}

export default App;
