// Cenários do dia a dia, com um banco simulado que pode mudar no meio do teste.
const { chromium } = require('playwright');
const SP = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const uid = '00000000-0000-0000-0000-0000000000a1';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessao = () => { const exp = Math.floor(Date.now() / 1000) + 30 * 86400; return { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: uid, exp })}.x`, refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: uid, email: 'joao@acumula.local', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }; };
const resultados = [];
const ok = (nome, passou, detalhe = '') => { resultados.push(passou); console.log(`${passou ? '✅' : '❌'} ${nome}${detalhe ? ' — ' + detalhe : ''}`); };

async function abrir(browser, banco, opcoes = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('dialog', (d) => d.accept());
  if (opcoes.relogio) await page.clock.install({ time: opcoes.relogio });
  await page.route('https://teste.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname.includes('/auth/v1/token')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }) });
    const tabela = url.pathname.split('/rest/v1/')[1];
    if (banco.semInternet || (banco.semInternetEm && banco.semInternetEm === tabela)) return route.abort('internetdisconnected');
    if (req.method() === 'POST' && tabela === 'movements') {
      const corpo = req.postDataJSON();
      banco.gravados.push(corpo);
      const dia = corpo.recorded_at ?? SP(new Date(banco.horaServidor ?? Date.now()));
      if (banco.diaServidor && dia !== banco.diaServidor) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "movements"' }) });
      banco.movements.push({ id: `novo${banco.gravados.length}`, created_at: new Date().toISOString(), recorded_at: dia, is_base: false, ...corpo });
      return route.fulfill({ status: 201, body: '' });
    }
    if (tabela && banco[tabela]) {
      let linhas = banco[tabela];
      if (tabela === 'profiles' && url.searchParams.get('id')) linhas = linhas.filter((r) => `eq.${r.id}` === url.searchParams.get('id'));
      if (tabela === 'movements' && url.searchParams.get('operation_id')) linhas = linhas.filter((r) => `eq.${r.operation_id}` === url.searchParams.get('operation_id')).sort((a, b) => `${b.recorded_at}${b.created_at}`.localeCompare(`${a.recorded_at}${a.created_at}`));
      const lim = Number(url.searchParams.get('limit')); if (lim) linhas = linhas.slice(0, lim);
      const um = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(um ? linhas[0] ?? null : linhas) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  if (!opcoes.semSessao) await page.addInitScript((s) => localStorage.setItem('sb-teste-auth-token', JSON.stringify(s)), sessao());
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4173/');
  return page;
}
const novoBanco = (hoje) => ({
  gravados: [],
  profiles: [{ id: uid, username: 'joao', name: 'João', role: 'operator', active: true, created_at: '2026-01-01' }],
  projects: [{ id: 'p1', name: 'Obra Norte', status: 'Ativo', notes: null, created_at: '2026-01-01' }],
  operations: [{ id: 'o1', project_id: 'p1', operation_number: 1, name: 'Ficha' }],
  movements: [{ id: 'm1', project_id: 'p1', operation_id: 'o1', entry_total: 1000000, exit_total: 400000, recorded_at: hoje, created_at: new Date(Date.now() - 3600e3).toISOString(), is_base: false }],
  audit_log: [],
  operation_baselines: [],
});
const entrar = async (page) => { await page.waitForSelector('.project-tile', { timeout: 8000 }); await page.click('.project-tile >> text=Obra Norte'); await page.waitForSelector('.inputs input'); };

(async () => {
  const browser = await chromium.launch();
  const hoje = SP(new Date());

  // 1. Duas pessoas na mesma ficha
  { const banco = novoBanco(hoje); const page = await abrir(browser, banco); await entrar(page);
    banco.movements.push({ id: 'mB', project_id: 'p1', operation_id: 'o1', entry_total: 1200000, exit_total: 450000, recorded_at: hoje, created_at: new Date().toISOString(), is_base: false });
    await page.locator('.inputs input').first().fill('1.100.000');
    await page.click('button.save'); await page.waitForTimeout(800);
    const gravou = banco.gravados.some((g) => g.entry_total === 1100000);
    ok('Outra pessoa lançou antes: o app não grava valor menor por cima e avisa', !gravou, gravou ? 'gravou 1.100.000 abaixo dos 1.200.000 da outra pessoa' : (await page.locator('.notice').innerText().catch(() => '')));
    ok('…e mostra os valores novos da outra pessoa', (await page.locator('.inputs input').first().inputValue()) === '1.200.000,00', await page.locator('.inputs input').first().inputValue());
    await page.close(); }

  // 2. Passou da meia-noite com o app aberto
  { const t = new Date(`${hoje}T23:58:00-03:00`); const banco = novoBanco(SP(t)); const page = await abrir(browser, banco, { relogio: t }); await entrar(page);
    const antes = await page.locator('.reference strong').innerText();
    await page.clock.fastForward('05:00');
    await page.waitForTimeout(300);
    const depois = await page.locator('.reference strong').innerText();
    ok('Meia-noite: a data de hoje vira sozinha', antes !== depois, `${antes} → ${depois}`);
    const r = await page.locator('.ficha-card strong').first().innerText();
    ok('Meia-noite: o resultado do dia zera para o novo dia', r.includes('Sem lançamento'), r);
    await page.close(); }

  // 3. Internet falhou ao abrir o app
  { const banco = novoBanco(hoje); banco.semInternetEm = 'profiles'; const page = await abrir(browser, banco); await page.waitForTimeout(1500);
    const texto = await page.locator('body').innerText();
    ok('Sem internet ao abrir: não diz que o usuário está desativado', !/desativado/i.test(texto), texto.replace(/\s+/g, ' ').slice(0, 90));
    await page.close(); }

  // 4. Celular com data errada
  { const banco = novoBanco(hoje); banco.diaServidor = hoje; const errado = new Date(Date.now() + 3 * 864e5); const page = await abrir(browser, banco, { relogio: errado }); await page.waitForSelector('.project-tile', { timeout: 8000 }).catch(() => {});
    const temProjeto = await page.locator('.project-tile').count();
    if (temProjeto) { await entrar(page); await page.locator('.inputs input').first().fill('1.300.000'); await page.click('button.save'); await page.waitForTimeout(800); }
    const salvo = banco.movements.some((m) => m.entry_total === 1300000);
    ok('Celular com data errada: o lançamento entra no dia certo (o do servidor)', salvo && banco.movements.find((m) => m.entry_total === 1300000).recorded_at === hoje, salvo ? '' : (await page.locator('.notice').innerText().catch(() => 'sem aviso')));
    await page.close(); }

  // 5. Sem internet na hora de salvar
  { const banco = novoBanco(hoje); const page = await abrir(browser, banco); await entrar(page);
    await page.locator('.inputs input').first().fill('1.300.000'); banco.semInternet = true;
    await page.click('button.save'); await page.waitForTimeout(800);
    const aviso = await page.locator('.notice').innerText().catch(() => '');
    ok('Sem internet ao salvar: avisa que é a conexão', /conex|internet/i.test(aviso), aviso);
    ok('…e o valor digitado continua no campo para tentar de novo', (await page.locator('.inputs input').first().inputValue()) === '1.300.000');
    await page.close(); }

  // 6. Saiu do app no meio da digitação e voltou
  { const banco = novoBanco(hoje); const page = await abrir(browser, banco); await entrar(page);
    await page.locator('.inputs input').first().fill('1.250.000');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await page.waitForTimeout(1200);
    ok('Saiu do app e voltou: o que estava digitado não se perde', (await page.locator('.inputs input').first().inputValue()) === '1.250.000', await page.locator('.inputs input').first().inputValue());
    await page.close(); }

  // 7. Login sem internet
  { const banco = novoBanco(hoje); const page = await abrir(browser, banco, { semSessao: true }); await page.waitForSelector('#auth-username');
    banco.semInternetLogin = true;
    await page.route('**/auth/v1/token**', (r) => r.abort('internetdisconnected'));
    await page.fill('#auth-username', 'joao'); await page.fill('#auth-password', 'senha-qualquer'); await page.click('.auth-submit'); await page.waitForTimeout(800);
    const aviso = await page.locator('.auth-error').innerText().catch(() => '');
    ok('Login sem internet: não diz "usuário ou senha incorretos"', !/incorret/i.test(aviso), aviso);
    await page.close(); }

  // 8. Login com senha errada continua dizendo isso
  { const banco = novoBanco(hoje); const page = await abrir(browser, banco, { semSessao: true }); await page.waitForSelector('#auth-username');
    await page.fill('#auth-username', 'joao'); await page.fill('#auth-password', 'errada123'); await page.click('.auth-submit'); await page.waitForTimeout(800);
    ok('Login com senha errada: diz que usuário ou senha estão incorretos', /incorret/i.test(await page.locator('.auth-error').innerText().catch(() => '')));
    await page.close(); }

  // 9. Primeiro lançamento de uma ficha nova já vem como "Novo jogo"
  { const banco = novoBanco(hoje); banco.operations.push({ id: 'o2', project_id: 'p1', operation_number: 2, name: 'Ficha' });
    const page = await abrir(browser, banco); await entrar(page);
    await page.locator('.ficha-card').nth(1).click(); await page.waitForTimeout(200);
    ok('Ficha sem lançamento: "Novo jogo" já vem ligado', await page.locator('.base-toggle.on').count() === 1);
    await page.locator('.inputs input').first().fill('5.000.000'); await page.locator('.inputs input').nth(1).fill('2.000.000');
    await page.click('button.save'); await page.waitForTimeout(800);
    const g = banco.gravados.at(-1);
    ok('…e o primeiro lançamento é salvo como novo jogo (não soma no resultado do dia)', g && g.is_base === true && g.entry_total === 5000000, JSON.stringify(g));
    ok('…depois disso, o "Novo jogo" volta a vir desligado', await page.locator('.base-toggle.on').count() === 0);
    await page.locator('.ficha-card').first().click(); await page.waitForTimeout(200);
    ok('Ficha que já tem lançamento: "Novo jogo" vem desligado', await page.locator('.base-toggle.on').count() === 0);
    await page.close(); }

  // 10. Dá para desligar no primeiro lançamento, se precisar
  { const banco = novoBanco(hoje); banco.operations.push({ id: 'o2', project_id: 'p1', operation_number: 2, name: 'Ficha' });
    const page = await abrir(browser, banco); await entrar(page);
    await page.locator('.ficha-card').nth(1).click(); await page.click('.base-toggle');
    await page.locator('.inputs input').first().fill('100'); await page.locator('.inputs input').nth(1).fill('10');
    await page.click('button.save'); await page.waitForTimeout(800);
    const g = banco.gravados.at(-1);
    ok('Primeiro lançamento com "Novo jogo" desligado: salva como lançamento comum', g && !g.is_base, JSON.stringify(g));
    await page.close(); }

  // 11. Limpeza de 30 dias: ficha com todos os lançamentos apagados usa o ponto de comparação guardado
  { const banco = novoBanco(hoje); banco.operations.push({ id: 'o2', project_id: 'p1', operation_number: 2, name: 'Ficha' });
    banco.operation_baselines.push({ operation_id: 'o2', entry_total: 1260000.75, exit_total: 452000.5, recorded_at: '2026-09-01' });
    const page = await abrir(browser, banco); await entrar(page);
    await page.locator('.ficha-card').nth(1).click(); await page.waitForTimeout(200);
    ok('Ficha já limpa: o campo vem com o último valor apagado', (await page.locator('.inputs input').first().inputValue()) === '1.260.000,75', await page.locator('.inputs input').first().inputValue());
    ok('…"Novo jogo" NÃO vem ligado (ela já tem ponto de comparação)', await page.locator('.base-toggle.on').count() === 0);
    ok('…o quadro avisa que o último lançamento já foi apagado', /já apagado/.test(await page.locator('.previous-date').innerText()));
    await page.locator('.inputs input').first().fill('1.000.000');
    ok('…valor menor que o ponto de comparação é recusado', /menor/.test(await page.locator('.field-error').first().innerText().catch(() => '')));
    await page.locator('.inputs input').first().fill('1.300.000'); await page.locator('.inputs input').nth(1).fill('460.000');
    await page.click('button.save'); await page.waitForTimeout(800);
    const g = banco.gravados.at(-1);
    ok('…valor maior salva como lançamento comum', g && !g.is_base && g.entry_total === 1300000, JSON.stringify(g));
    await page.waitForTimeout(300);
    const r = await page.locator('.ficha-card').nth(1).locator('strong').innerText();
    ok('…e o resultado do dia é só a diferença para o ponto de comparação', r.replace(/\s/g, ' ') === 'R$ 31.999,75', r);
    await page.close(); }

  await browser.close();
  const falhas = resultados.filter((r) => !r).length;
  console.log(falhas ? `\n${falhas} problema(s) encontrado(s)` : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})();
