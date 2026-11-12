import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Download, FileText, History, LayoutDashboard, LogOut, Menu, Moon, Pencil, Plus, RefreshCw, Save, Search, Settings2, StickyNote, Sun, TrendingUp, X, Trash2, Users } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { friendlyError, supabase } from '@/lib/supabase';
import { emailToUsername } from '@/lib/types';
import type { Profile } from '@/lib/types';
import { Login, PendingAccess } from '@/Login';
import { UsersAdmin } from '@/UsersAdmin';
import { AuditLog } from '@/AuditLog';
import { ReportDetail } from '@/ReportDetail';
import { fetchAllPages } from '@/lib/pages';
import { applyTheme, currentTheme } from '@/lib/theme';
import type { Theme } from '@/lib/theme';
import { byDateDesc, dayResult, operationDayResults, formatAmountInput, lastDayByProject, money, movementsCsv, netById, parseAmount, todayIso, toCents, fromCents } from '@/lib/calc';
import type { Movement } from '@/lib/calc';

type Project = { id: string; name: string; status: string; total_entry: number; total_exit: number; notes: string | null };
type Operation = { id: string; project_id: string; operation_number: number; name: string };
const hour = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
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
  const [reportProjectId, setReportProjectId] = useState('');
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggleTheme = () => { const next: Theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(next); setTheme(next); };

  const lastLoad = useRef(0);
  const load = useCallback(async (silent = false) => {
    lastLoad.current = Date.now();
    if (!silent) setLoading(true);
    // Busca tudo em páginas (o Supabase entrega no máximo 1.000 linhas por vez)
    const [p, o, m] = await Promise.all([
      fetchAllPages<Project>((from, to) => supabase.from('projects').select('*').order('created_at').order('id').range(from, to)),
      fetchAllPages<Operation>((from, to) => supabase.from('operations').select('*').order('operation_number').order('id').range(from, to)),
      fetchAllPages<Movement>((from, to) => supabase.from('movements').select('*').order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
    ]);
    if (p.error || o.error || m.error) {
      // Em caso de falha, mantém os dados que já estavam na tela em vez de mostrar números pela metade
      if (!silent) setMessage('Não foi possível carregar os dados. Verifique a internet e clique em Atualizar.');
      setLoading(false);
      return;
    }
    setProjects(p.data); setOperations(o.data); setMovements(m.data);
    setProjectId((current) => (p.data.some((project) => project.id === current) ? current : '')); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Ao voltar para o app (trocou de aba, desbloqueou o celular), busca os dados novos de outras pessoas
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 20000) void load(true); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [load]);

  const currentProject = projects.find((project) => project.id === projectId);
  const currentOperations = useMemo(() => operations.filter((operation) => operation.project_id === projectId), [operations, projectId]);
  const currentOperation = currentOperations.find((operation) => operation.id === operationId) ?? currentOperations[0];
  // Movimento real de cada lançamento (diferença para o anterior da mesma operação)
  const net = useMemo(() => netById(movements), [movements]);
  const history = useMemo(() => movements.filter((item) => item.project_id === projectId && item.operation_id === currentOperation?.id).sort(byDateDesc), [movements, projectId, currentOperation?.id]);
  const allProjectHistory = useMemo(() => movements.filter((item) => item.project_id === projectId).sort(byDateDesc), [movements, projectId]);
  const displayedHistory = showAllHistory ? allProjectHistory : history;
  const previous = history[0];
  // Consulta de datas antigas pelo calendário do quadro "Lançamento anterior" (só para ver; o lançamento novo
  // continua comparando com o último)
  const [consultId, setConsultId] = useState('');
  const [datesOpen, setDatesOpen] = useState(false);
  const consulted = consultId ? history.find((item) => item.id === consultId) : undefined;
  const monthLabel = (day: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00`));
  const entryNumber = parseAmount(entry);
  const exitNumber = parseAmount(exit);
  const entryInvalid = entry.trim() !== '' && entryNumber === null;
  const exitInvalid = exit.trim() !== '' && exitNumber === null;
  const newEntry = fromCents(toCents(entryNumber) - toCents(previous?.entry_total));
  const newExit = fromCents(toCents(exitNumber) - toCents(previous?.exit_total));
  // Novo jogo: o valor salvo só vira o novo ponto de partida (não soma no resultado do dia)
  const [asBase, setAsBase] = useState(false);
  const entryProblem = entryInvalid ? 'Valor inválido. Use, por exemplo, 1.234,56' : !asBase && newEntry < 0 && entryNumber !== null ? `Não pode ser menor que o lançamento anterior (${money(Number(previous?.entry_total ?? 0))}). Se começou um novo jogo, ligue "Novo jogo".` : '';
  const exitProblem = exitInvalid ? 'Valor inválido. Use, por exemplo, 1.234,56' : !asBase && newExit < 0 && exitNumber !== null ? `Não pode ser menor que o lançamento anterior (${money(Number(previous?.exit_total ?? 0))}). Se começou um novo jogo, ligue "Novo jogo".` : '';
  const canSave = !saving && entryNumber !== null && exitNumber !== null && !entryProblem && !exitProblem;
  const [today, setToday] = useState(todayIso);
  useEffect(() => { const timer = window.setInterval(() => setToday(todayIso()), 30000); return () => window.clearInterval(timer); }, []);
  const projectTotal = useMemo(() => dayResult(movements, net, projectId, today), [movements, net, projectId, today]);
  const projectResult = projectTotal / 2;
  // Resultado do dia de cada ficha do projeto selecionado
  const fichaResults = useMemo(() => operationDayResults(movements, net, projectId, today), [movements, net, projectId, today]);
  const lastUpdateByProject = useMemo(() => lastDayByProject(movements), [movements]);
  // Para a página de seleção: resultado do dia de cada projeto (só os que têm lançamento hoje)
  const todayByProject = useMemo(() => {
    const result = new Map<string, number>();
    for (const m of movements) if (m.recorded_at === today && !result.has(m.project_id)) result.set(m.project_id, dayResult(movements, net, m.project_id, today));
    return result;
  }, [movements, net, today]);
  const openProject = (id: string) => { setProjectId(id); setOperationId(''); setShowAllHistory(false); setMobileMenuOpen(false); window.scrollTo(0, 0); };
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (currentOperations.length && !currentOperations.some((operation) => operation.id === operationId)) setOperationId(currentOperations[0].id);
  }, [currentOperations, operationId]);
  useEffect(() => {
    setConsultId(''); setDatesOpen(false); setAsBase(false);
    if (previous) { setEntry(formatAmountInput(previous.entry_total)); setExit(formatAmountInput(previous.exit_total)); }
    else { setEntry(''); setExit(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previous?.id, projectId, operationId]);

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
    if (error) setMessage(friendlyError(error, 'Não foi possível excluir a operação.'));
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
    if (error) setMessage(friendlyError(error, 'Não foi possível excluir o lançamento.'));
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
    if (error) setMessage(friendlyError(error, 'Não foi possível criar o projeto.'));
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
    if (error) setMessage(friendlyError(error, 'Não foi possível salvar as observações.'));
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
    if (error) setMessage(friendlyError(error, 'Não foi possível excluir o projeto.'));
    else { setMessage('Projeto excluído.'); if (projectId === id) setProjectId(''); await load(); }
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const saveProjectName = async (id: string) => {
    const name = inlineProjectName.trim();
    if (!name || name === projects.find((project) => project.id === id)?.name) { setEditingProjectId(''); return; }
    setSaving(true);
    const { error } = await supabase.from('projects').update({ name }).eq('id', id);
    if (error) setMessage(friendlyError(error, 'Não foi possível salvar o nome do projeto.')); else { setMessage('Projeto atualizado com sucesso.'); await load(); }
    setEditingProjectId('');
    setSaving(false);
    window.setTimeout(() => setMessage(''), 3000);
  };

  const save = async () => {
    if (!currentProject || !currentOperation || !canSave || entryNumber === null || exitNumber === null) return;
    if (asBase && !confirm('Salvar como NOVO JOGO?\n\nEste valor não vai somar no resultado do dia. Os próximos lançamentos desta ficha serão comparados com ele.')) return;
    if (!asBase && previous && previous.recorded_at === today && newEntry === 0 && newExit === 0 && !confirm('Os valores são iguais aos do último lançamento de hoje. Salvar mesmo assim?')) return;
    setSaving(true);
    // Alguém lançou nesta ficha enquanto a tela estava aberta? Então atualiza e pede para conferir.
    const latest = await supabase.from('movements').select('id').eq('operation_id', currentOperation.id).order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).order('id').limit(1);
    if (!latest.error && (latest.data?.[0]?.id ?? null) !== (previous?.id ?? null)) {
      await load(true);
      setMessage('Alguém acabou de lançar nesta ficha. Os valores foram atualizados: confira e salve de novo.');
      setSaving(false); window.setTimeout(() => setMessage(''), 6000);
      return;
    }
    // A data do lançamento é a do servidor (horário de Brasília), não a do aparelho
    const { error } = await supabase.from('movements').insert({ project_id: currentProject.id, operation_id: currentOperation.id, entry_total: entryNumber, exit_total: exitNumber, ...(asBase ? { is_base: true } : {}) });
    if (error) setMessage(asBase && error.message.includes('is_base') ? 'Para usar "Novo jogo", o banco precisa ser atualizado (arquivo 20261113120000_nova_base.sql).' : friendlyError(error, 'Não foi possível salvar este lançamento.')); else { setMessage(asBase ? 'Novo jogo salvo. Ele não soma no resultado do dia.' : 'Lançamento salvo no histórico.'); setAsBase(false); await load(); }
    setSaving(false); window.setTimeout(() => setMessage(''), 3000);
  };

  const selectionView = <div className="project-select"><div className="main-heading"><div><h2>Projetos</h2></div><div className="reference"><CalendarDays size={16} /><strong>{date(today)}</strong></div></div>{message && <div className="notice">{message}</div>}{loading ? <p className="muted">Carregando projetos...</p> : filteredProjects.length ? <div className="project-grid">{filteredProjects.map((project) => { const result = todayByProject.get(project.id); const fichas = operations.filter((operation) => operation.project_id === project.id).length; const last = lastUpdateByProject[project.id]; return <button type="button" key={project.id} className={`project-tile ${result === undefined ? 'no-result' : result < 0 ? 'negative' : ''}`} onClick={() => openProject(project.id)}><span className="tile-top"><b>{project.name}</b><ArrowRight size={16} /></span><span className="tile-sub">{fichas} {fichas === 1 ? 'ficha' : 'fichas'}</span>{result === undefined ? <><small>Resultado do dia</small><strong>Sem lançamento hoje</strong></> : <span className="tile-values"><span><small>Resultado do dia</small><strong>{money(result)}</strong></span><span className="tile-half"><small>÷ 2</small><strong>{money(result / 2)}</strong></span></span>}<span className="tile-foot">Última alteração: {last ? date(last) : 'sem registros'}</span></button>; })}</div> : <p className="empty">{projects.length ? 'Nenhum projeto encontrado com esse nome.' : isAdmin ? 'Nenhum projeto cadastrado. Crie o primeiro em Configurações.' : 'Nenhum projeto cadastrado ainda.'}</p>}</div>;

  const dashboardView = !currentProject ? selectionView : <div className="project-page"><main><button type="button" className="back-button" onClick={() => setProjectId('')}><ArrowLeft size={15} /> Todos os projetos</button>{message && <div className="notice">{message}</div>}<div className="main-heading"><div><h2 className="project-title">{currentProject.name}</h2></div><div className="reference"><CalendarDays size={16} /><strong>{date(todayIso())}</strong></div></div><div className="ficha-area"><div className="ficha-area-head"><span>Fichas</span></div>{currentOperations.length ? <div className="ficha-grid">{currentOperations.map((operation) => { const result = fichaResults.get(operation.id); const selected = operation.id === currentOperation?.id; return <button type="button" key={operation.id} className={`ficha-card ${selected ? 'selected' : ''} ${result === undefined ? 'no-result' : result < 0 ? 'negative' : ''}`} aria-pressed={selected} onClick={() => setOperationId(operation.id)}><span className="ficha-top"><span className="ficha-num">{String(operation.operation_number).padStart(2, '0')}</span><b>{operation.name}</b></span><small>Resultado do dia</small><strong>{result === undefined ? 'Sem lançamento hoje' : money(result)}</strong></button>; })}</div> : <p className="empty">Nenhuma ficha cadastrada neste projeto.</p>}</div>
  <div className="cards"><section className="card"><div className="inputs"><label>Entrada<div><b>R$</b><input inputMode="decimal" aria-invalid={!!entryProblem} value={entry} onChange={(event) => setEntry(event.target.value)} onFocus={() => { if (previous && entry === formatAmountInput(previous.entry_total)) setEntry(''); }} onBlur={() => { if (!entry.trim() && previous) setEntry(formatAmountInput(previous.entry_total)); }} placeholder={previous ? formatAmountInput(previous.entry_total) : '0,00'} /><ArrowUpRight size={16} /></div>{entryProblem && <small className="field-error">{entryProblem}</small>}</label><label>Saída<div><b>R$</b><input inputMode="decimal" aria-invalid={!!exitProblem} value={exit} onChange={(event) => setExit(event.target.value)} onFocus={() => { if (previous && exit === formatAmountInput(previous.exit_total)) setExit(''); }} onBlur={() => { if (!exit.trim() && previous) setExit(formatAmountInput(previous.exit_total)); }} placeholder={previous ? formatAmountInput(previous.exit_total) : '0,00'} /><ArrowDownRight size={16} /></div>{exitProblem && <small className="field-error">{exitProblem}</small>}</label></div><label className={`base-toggle ${asBase ? 'on' : ''}`}><input type="checkbox" checked={asBase} onChange={(event) => setAsBase(event.target.checked)} /><span className="switch" aria-hidden="true" /><span className="base-text"><b>Novo jogo</b></span></label><button className="save" disabled={!canSave || !currentOperation} onClick={() => void save()}>{saving ? 'Salvando...' : asBase ? 'Salvar novo jogo' : 'Salvar lançamento'} <ArrowUpRight size={16} /></button></section><section className="card">{previous ? (() => { const shown = consulted ?? previous; const shownNet = net.get(shown.id) ?? 0; const sameDay = history.filter((item) => item.recorded_at === shown.recorded_at).length; return <><div className="previous-date"><div><strong>{date(shown.recorded_at)}</strong><span>{shown.is_base && <em className="base-tag">novo jogo</em>}{consulted ? `Lançamento das ${hour(shown.created_at)}${sameDay > 1 ? ` (${sameDay} lançamentos neste dia)` : ''}` : 'Último lançamento'}</span></div><span className="calendar-picker"><button type="button" className={`calendar-button ${datesOpen ? 'open' : ''}`} title="Ver lançamentos de outras datas" aria-label="Ver lançamentos de outras datas" aria-expanded={datesOpen} onClick={() => setDatesOpen(!datesOpen)}><CalendarDays size={17} /></button>{datesOpen && <div className="date-list" role="dialog" aria-label="Lançamentos desta ficha"><div className="date-list-head"><b>Lançamentos desta ficha</b><button type="button" className="close-modal" aria-label="Fechar" onClick={() => setDatesOpen(false)}><X size={15} /></button></div><div className="date-list-items">{history.map((item, index) => { const newMonth = index === 0 || history[index - 1].recorded_at.slice(0, 7) !== item.recorded_at.slice(0, 7); const itemNet = net.get(item.id) ?? 0; return <div key={item.id}>{newMonth && <small className="date-month">{monthLabel(item.recorded_at)}</small>}<button type="button" className={`date-item ${item.id === shown.id ? 'active' : ''}`} onClick={() => { setConsultId(index === 0 ? '' : item.id); setDatesOpen(false); }}><span>{date(item.recorded_at)}<i>{hour(item.created_at)}</i>{index === 0 && <em>último</em>}{item.is_base && <em className="base-tag">novo jogo</em>}</span><strong className={itemNet < 0 ? 'neg' : ''}>{money(itemNet)}</strong></button></div>; })}</div></div>}</span></div><div className="previous-values"><div>Entrada<strong>{money(shown.entry_total)}</strong></div><div>Saída<strong>{money(shown.exit_total)}</strong></div><div>Resultado<strong style={shownNet < 0 ? { color: '#dc2626' } : undefined}>{money(shownNet)}</strong></div></div>{consulted ? <button type="button" className="ghost back-latest" onClick={() => setConsultId('')}><ArrowLeft size={14} /> Voltar ao último lançamento</button> : null}</>; })() : <p className="empty">Ainda não há lançamento anterior para esta operação.</p>}</section></div>
  <section className={`result ${projectTotal < 0 ? 'negative' : ''}`}><div><h3>Resultado do dia</h3></div><div className="result-values"><div className="result-value"><small>Total</small><strong>{money(projectTotal)}</strong></div><div className="result-value half"><small>÷ 2</small><strong>{money(projectResult)}</strong></div></div></section>
  <section className="history"><div className="section-head"><div><h3>{showAllHistory ? 'Histórico do projeto' : 'Histórico da ficha'}</h3></div><div className="history-actions"><button className={showAllHistory ? 'history-toggle active' : 'history-toggle'} onClick={() => setShowAllHistory(!showAllHistory)}>{showAllHistory ? 'Ver operação atual' : 'Ver todas as entradas'}</button><span>{displayedHistory.length} registros</span></div></div>{displayedHistory.length ? <div className="table"><div className={`row header ${showAllHistory ? 'with-operation' : ''}`}><span>Data</span>{showAllHistory && <span>Operação</span>}<span className="num">Entrada</span><span className="num">Saída</span><span className="num">Movimento</span><span /></div>{displayedHistory.map((item) => <div className={`row ${showAllHistory ? 'with-operation' : ''}`} key={item.id}><span><CalendarDays size={13} /> {date(item.recorded_at)}</span>{showAllHistory && <span className="op-cell">{(() => { const op = operations.find((operation) => operation.id === item.operation_id); return op ? `${String(op.operation_number).padStart(2, '0')} — ${op.name}` : 'Operação'; })()}</span>}<span className="num" data-label="Entrada">{money(item.entry_total)}</span><span className="num" data-label="Saída">{money(item.exit_total)}</span><strong className="num" data-label="Movimento" style={(net.get(item.id) ?? 0) < 0 ? { color: '#dc2626' } : undefined}>{money(net.get(item.id) ?? 0)}{item.is_base && <em className="base-tag">novo jogo</em>}</strong>{item.recorded_at === today ? <button className="row-delete" aria-label="Excluir lançamento" title="Excluir lançamento" disabled={saving} onClick={() => void deleteMovement(item.id)}><Trash2 size={14} /></button> : <span />}</div>)}</div> : <p className="empty table-empty">Nenhum histórico disponível para a consulta selecionada.</p>}</section></main></div>;

  const reportProject = projects.find((project) => project.id === reportProjectId);
  const reportsView = reportProject ? <div className="reports-view"><ReportDetail project={reportProject} operations={operations} movements={movements} net={net} onBack={() => setReportProjectId('')} /></div> : <div className="reports-view"><div className="reports-grid">{filteredProjects.map((project) => {const lastDay = lastUpdateByProject[project.id]; const total = lastDay ? dayResult(movements, net, project.id, lastDay) : 0; const half = total / 2; return <section className={`report-card ${total < 0 ? 'negative' : ''}`} key={project.id}><div className="report-card-head"><div><h3>{project.name}</h3><span>{project.status}</span></div><button className={`notes-button ${project.notes ? 'has-notes' : ''}`} title={project.notes ?? 'Adicionar observações'} onClick={() => openNotes(project)}><StickyNote size={14} /> {project.notes ? 'Ver observações' : 'Observações'}</button></div>{project.notes && <p className="report-notes">{project.notes}</p>}<div className="report-result single"><div><span>Último resultado ÷ 2{lastDay ? ` · ${date(lastDay)}` : ''}</span><strong>{money(half)}</strong></div></div><button type="button" className="ghost report-open" onClick={() => { setReportProjectId(project.id); window.scrollTo(0, 0); }}><History size={14} /> Ver histórico</button></section>;})}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  const settingsView = <div className="settings-view"><div className="settings-top-actions"><button className="add" style={{ maxWidth: 220 }} onClick={() => void openAddProject()}><Plus size={15} /> Adicionar projeto</button><button className="ghost" title="Baixa uma planilha com todos os lançamentos, para guardar como cópia de segurança" onClick={downloadBackup}><Download size={14} /> Baixar planilha de lançamentos</button></div><div className="settings-list">{filteredProjects.map((project) => <div className={`settings-block ${expandedProject === project.id ? 'expanded' : ''}`} key={project.id}><div className="settings-row" onClick={() => setExpandedProject(expandedProject === project.id ? '' : project.id)}><div className="settings-row-info">{editingProjectId === project.id ? <input autoFocus className="inline-edit" maxLength={200} value={inlineProjectName} onChange={(event) => setInlineProjectName(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setEditingProjectId(''); }} onBlur={() => void saveProjectName(project.id)} /> : <b onClick={(event) => { event.stopPropagation(); setEditingProjectId(project.id); setInlineProjectName(project.name); }}>{project.name}</b>}<span>{operations.filter((op) => op.project_id === project.id).length} operações</span></div><div className="settings-row-actions"><button className="ghost danger" onClick={(event) => { event.stopPropagation(); void deleteProject(project.id); }}><Trash2 size={14} /> Excluir projeto</button><button className="ghost" onClick={(event) => { event.stopPropagation(); setExpandedProject(expandedProject === project.id ? '' : project.id); }}>{expandedProject === project.id ? 'Recolher' : 'Operações'}</button></div></div>{expandedProject === project.id && <div className="settings-ops"><div className="settings-ops-head"><small>Operações de {project.name}</small><button className="add-operation" onClick={() => void openAddOperation(project.id)}><Plus size={15} /> Nova operação</button></div><div className="settings-ops-list">{operations.filter((op) => op.project_id === project.id).length ? operations.filter((op) => op.project_id === project.id).map((op) => <div className="settings-op-row" key={op.id}><div className="settings-op-info"><span className="op-num">{String(op.operation_number).padStart(2, '0')}</span><b>{op.name}</b></div><div className="settings-op-actions"><button className="ghost" onClick={() => void openEditOperation(op.id)}><Pencil size={13} /> Editar</button><button className="ghost danger" onClick={() => void deleteOperation(op.id)}><Trash2 size={13} /> Excluir</button></div></div>) : <p className="empty" style={{ padding: '12px 0' }}>Nenhuma operação cadastrada.</p>}</div></div>}</div>)}</div>{projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}</div>;

  const auditView = <div className="settings-view"><AuditLog projects={projects} operations={operations} /></div>;

  const usersView = <div className="settings-view"><UsersAdmin currentUserId={profile.id} notify={notify} /></div>;

  return <div className="app"><header className="topbar"><div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div><nav className={mobileMenuOpen ? 'mobile-open' : ''}><button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setView('dashboard'); setMobileMenuOpen(false); }}><LayoutDashboard size={16} /> Painel principal</button><button className={view === 'reports' ? 'active' : ''} onClick={() => { setView('reports'); setMobileMenuOpen(false); }}><FileText size={16} /> Relatórios</button>{isAdmin && <button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); setMobileMenuOpen(false); }}><Settings2 size={16} /> Configurações</button>}{isAdmin && <button className={view === 'users' ? 'active' : ''} onClick={() => { setView('users'); setMobileMenuOpen(false); }}><Users size={16} /> Usuários</button>}{isAdmin && <button className={view === 'audit' ? 'active' : ''} onClick={() => { setView('audit'); setMobileMenuOpen(false); }}><History size={16} /> Registro</button>}</nav><div className="profile"><span className="user-chip"><b>{profile.name}</b><small>{isAdmin ? 'Administrador' : 'Operador'}</small></span><button className="ghost theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button><button className="ghost logout" onClick={onSignOut}><LogOut size={14} /> Sair</button><button className="mobile-toggle" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={19} /></button></div></header>
  <div className="page-title"><div><h1>{view === 'reports' ? 'Relatórios' : view === 'settings' ? 'Configurações' : view === 'users' ? 'Usuários' : view === 'audit' ? 'Registro de alterações' : 'PONTOS'}</h1></div><div className="tools">{view !== 'users' && view !== 'audit' && <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar projeto..." /></label>}<button className="ghost" onClick={() => void load()}><RefreshCw size={14} /> Atualizar</button></div></div>
  {message && view !== 'dashboard' && <div className="notice" style={{ maxWidth: 1120, margin: '0 auto', padding: '10px 40px' }}>{message}</div>}
  {view === 'dashboard' && dashboardView}
  {view === 'reports' && reportsView}
  {view === 'settings' && isAdmin && settingsView}
  {view === 'users' && isAdmin && usersView}
  {view === 'audit' && isAdmin && auditView}
{operationModal && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>{operationModal === 'add' ? 'NOVA OPERAÇÃO' : 'EDITAR OPERAÇÃO'}</small><h3>{operationModal === 'add' ? 'Adicionar operação' : 'Editar operação'}</h3></div><button className="close-modal" onClick={() => setOperationModal(null)}><X size={18} /></button></div><div className="modal-grid"><label>Número da operação<input inputMode="numeric" value={opNumber} onChange={(event) => setOpNumber(event.target.value)} /></label><label>Nome da operação<input maxLength={200} value={opName} onChange={(event) => setOpName(event.target.value)} /></label></div><div className="modal-actions"><button className="ghost" onClick={() => setOperationModal(null)}>Cancelar</button><button className="save modal-save" disabled={saving || !opName.trim() || !opNumber} onClick={() => void saveOperation()}><Save size={15} /> {saving ? 'Salvando...' : operationModal === 'add' ? 'Criar operação' : 'Salvar alterações'}</button></div></section></div>}{projectModal && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>NOVO PROJETO</small><h3>Adicionar projeto</h3></div><button className="close-modal" onClick={() => setProjectModal(false)}><X size={18} /></button></div><label>Nome do projeto<input maxLength={200} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Ex: Contrato Porto Sul" /></label><div className="modal-actions"><button className="ghost" onClick={() => setProjectModal(false)}>Cancelar</button><button className="save modal-save" disabled={saving || !newProjectName.trim()} onClick={() => void saveProject()}><Save size={15} /> {saving ? 'Salvando...' : 'Criar projeto'}</button></div></section></div>}{notesProjectId && <div className="modal-backdrop"><section className="edit-modal"><div className="modal-heading"><div><small>OBSERVAÇÕES</small><h3>{projects.find((project) => project.id === notesProjectId)?.name}</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setNotesProjectId('')}><X size={18} /></button></div><label htmlFor="project-notes">Anotações sobre o projeto<textarea id="project-notes" autoFocus rows={7} maxLength={10000} value={notesText} onChange={(event) => setNotesText(event.target.value)} placeholder="Escreva aqui" /></label><div className="modal-actions"><button className="ghost" onClick={() => setNotesProjectId('')}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void saveNotes()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar observações'}</button></div></section></div>}</div>;
}
function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileFailed, setProfileFailed] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const loadProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) { setProfileFailed(true); return; } // sem internet: não muda nada, só avisa
    setProfileFailed(false);
    setProfile((data as Profile | null) ?? null);
  }, [userId]);
  useEffect(() => { setProfile(undefined); void loadProfile(); }, [loadProfile]);
  // Ao voltar para o app, confere de novo se o acesso continua ativo
  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') void loadProfile(); };
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [loadProfile]);

  const signOut = () => { void supabase.auth.signOut(); };

  if (session && profile === undefined && profileFailed) return <div className="auth-screen"><section className="auth-card"><div className="auth-heading"><small>SEM CONEXÃO</small><h1>Não foi possível conectar</h1><p>Confira a internet do aparelho e tente de novo.</p></div><button className="save auth-submit" type="button" onClick={() => void loadProfile()}>Tentar de novo</button><button className="auth-switch" type="button" onClick={signOut}>Sair</button></section></div>;
  if (session === undefined || (session && profile === undefined)) return <div className="auth-screen"><p className="muted">Carregando...</p></div>;
  if (!session) return <Login />;
  if (!profile || !profile.active) return <PendingAccess username={profile?.username ?? emailToUsername(session.user.email ?? '')} onRetry={() => void loadProfile()} onSignOut={signOut} />;
  return <Workspace key={profile.id} profile={profile} onSignOut={signOut} />;
}

export default App;
