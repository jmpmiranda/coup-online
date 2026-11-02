const express = require('express'), http = require('http'), fs = require('fs'), crypto = require('crypto'), { Server } = require('socket.io');
const { SK, MS, DM, PASS, XPL, EM } = require('./public/shared.js');
const app = express(); app.use(express.static(__dirname + '/public'));
const srv = http.createServer(app), io = new Server(srv);

/* ---------- Banco: Supabase (se configurado) ou arquivo local ---------- */
const SBURL = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), SBKEY = process.env.SUPABASE_KEY || '';
const sbh = { apikey: SBKEY, ...(SBKEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + SBKEY } : {}), 'Content-Type': 'application/json' };
const FILE = process.env.DATA_FILE || __dirname + '/data.json';
const OWNER = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
let db = { users: {}, emails: {}, codes: {}, sessions: {}, events: [] };

const day = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const chkDaily = u => { if (u.daily.d !== day()) u.daily = { d: day(), s: {}, cl: [] }; };
const bump = (u, k) => { chkDaily(u); u.stats[k] = (u.stats[k] || 0) + 1; u.daily.s[k] = (u.daily.s[k] || 0) + 1; };
function norm(u) {
  if (u.coins == null) u.coins = u.pts || 0; delete u.pts;
  u.gems = u.gems || 0; u.xp = u.xp || 0; u.passClaimed = u.passClaimed || []; u.items = u.items || [];
  u.stats = Object.assign({ games: 0, wins: 0, chal: 0, blk: 0, coup: 0 }, u.stats);
  u.daily = u.daily || { d: '', s: {}, cl: [] }; u.claimed = u.claimed || []; u.skins = u.skins || []; u.friends = u.friends || [];
}
async function load() {
  if (SBURL) {
    const r = await fetch(`${SBURL}/rest/v1/kv?key=eq.db&select=value`, { headers: sbh });
    if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + await r.text()); // não sobe vazio para não apagar dados
    const j = await r.json(); if (j[0]) db = j[0].value;
  } else { try { db = JSON.parse(fs.readFileSync(FILE)); } catch (e) {} }
  db.events = db.events || []; Object.values(db.users).forEach(norm);
}
async function persist() {
  if (SBURL) {
    const r = await fetch(`${SBURL}/rest/v1/kv`, { method: 'POST', headers: { ...sbh, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'db', value: db }) });
    if (!r.ok) console.error('Supabase erro', r.status, await r.text());
  } else fs.writeFileSync(FILE, JSON.stringify(db));
}
let sv; const save = () => { clearTimeout(sv); sv = setTimeout(() => persist().catch(e => console.error(e)), 800); };
process.on('SIGTERM', async () => { clearTimeout(sv); try { await persist(); } catch (e) {} process.exit(0); });

const online = {}, CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const isOwner = u => !!OWNER && u.email === OWNER;
const owned = (u, k) => isOwner(u) || (!k.owner && (!k.c || u.skins.includes(k.id)));
const avOf = u => { const k = u.skin && SK.find(x => x.id === u.skin); return k && owned(u, k) ? k.a : u.avatar; };
const profile = u => {
  chkDaily(u);
  return {
    id: u.id, email: u.email, name: u.name, code: u.code, coins: u.coins, gems: u.gems, xp: u.xp, passClaimed: u.passClaimed,
    items: isOwner(u) ? EM.map(e => e.id) : u.items, stats: u.stats, claimed: u.claimed, daily: u.daily, owner: isOwner(u),
    skins: isOwner(u) ? SK.map(k => k.id) : u.skins, avatar: u.avatar, skin: u.skin, events: db.events,
    friends: u.friends.map(c => db.users[db.codes[c]]).filter(Boolean).map(f => ({ code: f.code, name: f.name, av: avOf(f), on: !!online[f.id] }))
  };
};
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
const sess = u => { const t = crypto.randomBytes(24).toString('hex'); db.sessions[t] = u.id; save(); return t; };
function login(s, u, tk) { s.data.u = u; online[u.id] = s.id; return { token: tk || sess(u), me: profile(u) }; }

// Retorna null se o e-mail não estiver configurado
async function mail(to, subject, html) {
  if (!process.env.BREVO_KEY) return null;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Coup Online', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, htmlContent: html })
    });
    return r.ok;
  } catch (e) { return false; }
}
app.get('/verify', (q, res) => {
  const u = Object.values(db.users).find(x => x.vt && x.vt === q.query.t);
  if (!u) return res.status(400).send('Link inválido ou já usado.');
  u.ok = true; u.vt = null; save(); res.redirect('/?ok=1');
});

/* ---------- Sorteio do passe ---------- */
const RAF = {
  1: [{ w: 35, g: 3 }, { w: 25, c: 100 }, { w: 15, g: 8 }, { w: 12, r: 'raro' }, { w: 8.5, r: 'épico' }, { w: 3.5, r: 'lendário' }, { w: 1, r: 'mítico' }],
  2: [{ w: 20, g: 10 }, { w: 15, g: 25 }, { w: 25, r: 'raro' }, { w: 22, r: 'épico' }, { w: 12, r: 'lendário' }, { w: 6, r: 'mítico' }]
};
const DUP = { raro: 20, épico: 50, lendário: 120, mítico: 300 };
function raffle(u, tier) {
  const L = RAF[tier] || RAF[1]; let x = Math.random() * 100, o = L[L.length - 1];
  for (const e of L) { if ((x -= e.w) < 0) { o = e; break; } }
  if (o.g) { u.gems += o.g; return `Sorteio: você ganhou ${o.g} gemas!`; }
  if (o.c) { u.coins += o.c; return `Sorteio: você ganhou ${o.c} moedas!`; }
  const pool = SK.filter(k => k.r === o.r && !k.owner && !u.skins.includes(k.id));
  if (!pool.length) { u.gems += DUP[o.r]; return `Sorteio: personagem ${o.r} repetido, virou ${DUP[o.r]} gemas.`; }
  const k = pool[Math.floor(Math.random() * pool.length)]; u.skins.push(k.id);
  return `Sorteio: você ganhou o personagem ${k.n} (${k.r})!`;
}

async function api(s, m) {
  const u = s.data.u;
  const em = String(m.email || '').trim().toLowerCase();
  if (m.t === 'reg') {
    const name = String(m.name || '').trim().slice(0, 14), pass = String(m.pass || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error('E-mail inválido.');
    if (name.length < 2) throw new Error('Digite um nome com 2 letras ou mais.');
    if (pass.length < 6) throw new Error('A senha precisa de 6 caracteres ou mais.');
    if (db.emails[em]) throw new Error('Esse e-mail já tem conta.');
    const id = crypto.randomBytes(8).toString('hex'), salt = crypto.randomBytes(8).toString('hex');
    let code; do { code = Array.from({ length: 6 }, () => CODE[Math.floor(Math.random() * CODE.length)]).join(''); } while (db.codes[code]);
    const nu = { id, email: em, name, salt, hash: hash(pass, salt), ok: false, vt: crypto.randomBytes(16).toString('hex'), code, skin: null,
      avatar: { h: 1, hc: '#3b2a1a', oc: '#2574a9', skin: '#f5cfa7', e: '#4a6a8a', b: 0, cl: 0, x: '' } };
    norm(nu);
    const link = `${process.env.BASE_URL || s.handshake.headers.origin || ''}/verify?t=${nu.vt}`;
    const sent = await mail(em, 'Confirme sua conta no Coup Online', `<p>Para ativar sua conta, clique no botão abaixo.</p><p><a href="${link}" style="background:#d4a94f;color:#2a1d00;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar conta</a></p>`);
    if (sent === false) throw new Error('Não consegui enviar o e-mail. Confira o endereço e tente de novo.');
    db.users[id] = nu; db.emails[em] = id; db.codes[code] = id;
    if (sent === null) { nu.ok = true; nu.vt = null; save(); return login(s, nu); }
    save(); return { verify: true };
  }
  if (m.t === 'login') {
    const x = db.users[db.emails[em]];
    if (!x || !crypto.timingSafeEqual(Buffer.from(hash(String(m.pass || ''), x.salt)), Buffer.from(x.hash))) throw new Error('E-mail ou senha incorretos.');
    if (!x.ok) throw new Error('Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).');
    return login(s, x);
  }
  if (m.t === 'forgot') {
    if (!process.env.BREVO_KEY) throw new Error('O envio de e-mail ainda não foi configurado no servidor.');
    const x = db.users[db.emails[em]];
    if (x && x.ok) {
      const code = String(crypto.randomInt(100000, 1000000));
      x.rc = { h: hash(code, x.salt), exp: Date.now() + 15 * 60e3, n: 0 }; save();
      await mail(x.email, 'Código para redefinir sua senha', `<p>Seu código é <b style="font-size:22px;letter-spacing:4px">${code}</b></p><p>Ele vale por 15 minutos. Se não foi você, ignore este e-mail.</p>`);
    }
    return { sent: true }; // resposta igual exista a conta ou não
  }
  if (m.t === 'reset') {
    const x = db.users[db.emails[em]], pass = String(m.pass || '');
    if (!x || !x.rc || x.rc.exp < Date.now() || x.rc.n >= 5) throw new Error('Código inválido ou expirado. Peça um novo.');
    if (pass.length < 6) throw new Error('A senha precisa de 6 caracteres ou mais.');
    x.rc.n++;
    if (!crypto.timingSafeEqual(Buffer.from(hash(String(m.code || '').trim(), x.salt)), Buffer.from(x.rc.h))) { save(); throw new Error('Código incorreto.'); }
    x.salt = crypto.randomBytes(8).toString('hex'); x.hash = hash(pass, x.salt); x.rc = null;
    for (const t in db.sessions) if (db.sessions[t] === x.id) delete db.sessions[t];
    save(); return { reset: true };
  }
  if (m.t === 'tok') { const x = db.users[db.sessions[m.tk]]; if (!x) throw new Error('Sessão expirada.'); return login(s, x, m.tk); }
  if (!u) throw new Error('Entre na sua conta.');
  chkDaily(u);
  switch (m.t) {
    case 'me': return { me: profile(u) };
    case 'name': { const n = String(m.name || '').trim().slice(0, 14); if (n.length < 2) throw new Error('Nome muito curto.'); u.name = n; break; }
    case 'friend': {
      const f = db.users[db.codes[String(m.code || '').trim().toUpperCase()]];
      if (!f) throw new Error('Código não encontrado.'); if (f === u) throw new Error('Esse é o seu próprio código.');
      if (!u.friends.includes(f.code)) { u.friends.push(f.code); f.friends.push(u.code); } break;
    }
    case 'avatar': {
      const a = m.a || {}, hex = c => /^#[0-9a-f]{6}$/i.test(c), I = (v, n, d) => Number.isInteger(v) && v >= 0 && v < n ? v : d;
      u.avatar = { h: I(a.h, 6, 1), b: I(a.b, 4, 0), cl: I(a.cl, 4, 0), hc: hex(a.hc) ? a.hc : '#3b2a1a', oc: hex(a.oc) ? a.oc : '#2574a9',
        skin: hex(a.skin) ? a.skin : '#f5cfa7', e: hex(a.e) ? a.e : '#4a6a8a', x: ['', 'glasses', 'monocle', 'tophat', 'cap', 'shades'].includes(a.x) ? a.x : '' };
      u.skin = null; break;
    }
    case 'skin': {
      if (m.id) { const k = SK.find(x => x.id === m.id); if (!k || !owned(u, k)) throw new Error('Personagem bloqueado.'); }
      u.skin = m.id || null; break;
    }
    case 'buy': {
      const k = SK.find(x => x.id === m.id);
      if (k) { if (k.owner || u.skins.includes(k.id) || u.gems < k.c) throw new Error('Gemas insuficientes.'); u.gems -= k.c; u.skins.push(k.id); break; }
      const e = EM.find(x => x.id === m.id);
      if (!e || u.items.includes(e.id) || u.coins < e.c) throw new Error('Moedas insuficientes.');
      u.coins -= e.c; u.items.push(e.id); break;
    }
    case 'claim': {
      const k = (m.daily ? DM : MS).find(x => x.id === m.id), cl = m.daily ? u.daily.cl : u.claimed, st = m.daily ? u.daily.s : u.stats;
      if (!k || cl.includes(k.id) || (st[k.k] || 0) < k.n) throw new Error('Missão incompleta.');
      cl.push(k.id); u.xp += k.p; break;
    }
    case 'pass': {
      const l = m.l | 0, lv = Math.min(PASS.length, Math.floor(u.xp / XPL)), r = PASS[l - 1];
      if (!r || l > lv || u.passClaimed.includes(l)) throw new Error('Nível ainda bloqueado.');
      u.passClaimed.push(l); let got;
      if (r.t === 'coins') { u.coins += r.n; got = `+${r.n} moedas`; }
      else if (r.t === 'gems') { u.gems += r.n; got = `+${r.n} gemas`; }
      else got = raffle(u, r.n);
      save(); return { me: profile(u), got };
    }
    case 'chpass': {
      const pass = String(m.pass || '');
      if (!crypto.timingSafeEqual(Buffer.from(hash(String(m.old || ''), u.salt)), Buffer.from(u.hash))) throw new Error('A senha atual está incorreta.');
      if (pass.length < 6) throw new Error('A nova senha precisa de 6 caracteres ou mais.');
      u.salt = crypto.randomBytes(8).toString('hex'); u.hash = hash(pass, u.salt);
      for (const t in db.sessions) if (db.sessions[t] === u.id) delete db.sessions[t];
      save(); return login(s, u);
    }
    case 'evadd': {
      if (!isOwner(u)) throw new Error('Só o dono do app pode criar eventos.');
      const t = String(m.title || '').trim().slice(0, 60), x = String(m.text || '').trim().slice(0, 400);
      if (!t) throw new Error('Digite um título.');
      db.events.unshift({ id: crypto.randomBytes(4).toString('hex'), title: t, text: x, at: day() }); db.events = db.events.slice(0, 20); break;
    }
    case 'evdel': { if (!isOwner(u)) throw new Error('Sem permissão.'); db.events = db.events.filter(e => e.id !== m.id); break; }
    case 'invite': {
      const f = db.users[db.codes[m.code]];
      if (f && u.friends.includes(f.code) && online[f.id]) io.to(online[f.id]).emit('invite', { from: u.name, room: String(m.room || '') });
      return {};
    }
    default: throw new Error('Pedido inválido.');
  }
  save(); return { me: profile(u) };
}

/* ---------- Jogo ---------- */
const CH = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
const N = { duke: 'Duque', assassin: 'Assassino', captain: 'Capitão', ambassador: 'Embaixador', contessa: 'Condessa' };
const AR = { duke: 'o Duque', assassin: 'o Assassino', captain: 'o Capitão', ambassador: 'o Embaixador', contessa: 'a Condessa' };
const CAP = {
  income: a => `${a} pegou renda`, aid: a => `${a} pediu ajuda externa`, coup: (a, t) => `${a} deu um golpe em ${t}`,
  tax: a => `${a} cobrou impostos (Duque)`, assassinate: (a, t) => `${a} tentou assassinar ${t}`,
  steal: (a, t) => `${a} extorquiu ${t}`, exchange: a => `${a} trocou cartas (Embaixador)`
};
const SAY = {
  income: () => 'Vou pegar a renda.', aid: () => 'Quero a ajuda externa.', coup: t => `Vou dar um golpe em ${t}!`,
  tax: () => 'Vou cobrar impostos!', assassinate: t => `Vou assassinar ${t}!`, steal: t => `Vou extorquir ${t}!`, exchange: () => 'Vou trocar cartas.'
};
const ACT = {
  income: {}, aid: { block: ['duke'] }, coup: { cost: 7, target: 1 }, tax: { claim: 'duke' },
  assassinate: { cost: 3, claim: 'assassin', target: 1, block: ['contessa'] },
  steal: { claim: 'captain', target: 1, block: ['captain', 'ambassador'] }, exchange: { claim: 'ambassador' }
};
const BN = ['Ana', 'Beto', 'Cacá', 'Duda', 'Edu', 'Fê', 'Gui', 'Lia', 'Nando'];
const rooms = {};
const rnd = a => a[Math.floor(Math.random() * a.length)];
const copies = n => Math.round((2 * n + 7) / 5);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const P = (r, pid) => r.players.find(p => p.pid === pid);
const live = p => p.cards.filter(c => !c.dead);
const alive = r => r.players.filter(p => p.alive);
const log = (r, t) => { r.log.push(t); if (r.log.length > 40) r.log.shift(); };
// pausa o jogo por alguns segundos para dar tempo de ler o que aconteceu
const wait = (r, ms, fn) => { r.phase = 'wait'; setTimeout(() => { fn(); send(r); }, ms); };

function addBot(r) {
  const used = r.players.map(p => p.name), nm = BN.find(n => !used.includes('Bot ' + n)) || 'X';
  r.players.push({ pid: 'bot' + Math.random().toString(36).slice(2, 7), name: 'Bot ' + nm, bot: true, lv: r.lv || 'medio', av: rnd(SK.filter(k => !k.owner)).a, coins: 0, cards: [], alive: true });
}
function kill(r, p, i, next) {
  const c = p.cards[i]; c.dead = true; log(r, `${p.name} perdeu ${N[c.c]}`);
  if (!live(p).length) { p.alive = false; log(r, `${p.name} foi eliminado`); }
  wait(r, 2200, next);
}
function lose(r, pid, next) {
  const p = P(r, pid);
  if (!p.alive) return next();
  const l = p.cards.map((c, i) => i).filter(i => !p.cards[i].dead);
  if (l.length === 1) return kill(r, p, l[0], next);
  r.phase = 'lose'; r.lose = pid; r.next = next;
}
function swap(r, p, ch) {
  const i = p.cards.findIndex(c => !c.dead && c.c === ch);
  r.deck.push(ch); shuffle(r.deck); p.cards[i].c = r.deck.pop();
}
function challenge(r, claimer, ch, challenger, won, lost) {
  log(r, `${challenger.name} duvidou de ${claimer.name} (${N[ch]})`);
  r.say = { pid: challenger.pid, text: 'Duvido!' };
  wait(r, 2000, () => {
    const has = live(claimer).some(c => c.c === ch);
    r.reveal = { pid: claimer.pid, c: ch, ok: has };
    if (has) { log(r, `${claimer.name} tinha ${N[ch]}!`); swap(r, claimer, ch); }
    else {
      log(r, `${claimer.name} estava blefando`);
      const cu = db.users[challenger.pid]; if (cu) { bump(cu, 'chal'); save(); }
    }
    wait(r, 4000, () => { r.reveal = null; if (has) lose(r, challenger.pid, won); else lose(r, claimer.pid, lost); });
  });
}
function canBlock(r, p) { const pd = r.pending, d = ACT[pd.a]; return !pd.block && !!d.block && (pd.a === 'aid' || pd.t === p.pid); }
function eligible(r) {
  const pd = r.pending, d = ACT[pd.a];
  if (pd.block) return alive(r).filter(p => p.pid !== pd.block.by).map(p => p.pid);
  return alive(r).filter(p => p.pid !== pd.actor && ((d.claim && !pd.nc) || canBlock(r, p))).map(p => p.pid);
}
function act(r, p, a, t) {
  const d = ACT[a];
  r.pending = { actor: p.pid, a, t: t ? t.pid : null, pass: [], block: null, nc: false };
  p.coins -= d.cost || 0;
  if (a === 'coup') { const cu = db.users[p.pid]; if (cu) { bump(cu, 'coup'); save(); } }
  r.say = { pid: p.pid, text: (d.claim ? `Sou ${AR[d.claim]}. ` : '') + SAY[a](t && t.name) };
  log(r, CAP[a](p.name, t && t.name));
  wait(r, 2800, () => react(r));
}
function react(r) {
  const pd = r.pending, d = ACT[pd.a];
  if (!pd.block && !d.claim && !d.block) return resolve(r);
  if (!eligible(r).length) return done(r);
  r.phase = 'react';
}
function done(r) {
  const pd = r.pending;
  if (pd.block) { log(r, `O bloqueio de ${P(r, pd.block.by).name} funcionou`); return end(r); }
  resolve(r);
}
function resolve(r) {
  const pd = r.pending, p = P(r, pd.actor), t = pd.t && P(r, pd.t);
  r.phase = null;
  switch (pd.a) {
    case 'income': p.coins += 1; break;
    case 'aid': p.coins += 2; break;
    case 'tax': p.coins += 3; log(r, `${p.name} recebeu 3 moedas`); break;
    case 'steal': if (t && t.alive) { const n = Math.min(2, t.coins); t.coins -= n; p.coins += n; log(r, `${p.name} levou ${n} moeda(s) de ${t.name}`); } break;
    case 'coup': case 'assassinate': return lose(r, t.pid, () => end(r));
    case 'exchange': {
      const pool = live(p).map(c => c.c).concat(r.deck.splice(-2));
      r.xchg = { pid: p.pid, pool, keep: live(p).length }; r.phase = 'exchange'; return;
    }
  }
  end(r);
}
function award(r) {
  r.players.forEach(p => {
    const u = db.users[p.pid]; if (!u) return;
    bump(u, 'games'); u.coins += 10;
    if (p.pid === r.winner) { bump(u, 'wins'); u.coins += 30; }
  });
  save();
}
function end(r) {
  r.pending = null; r.say = null; r.reveal = null;
  const al = alive(r);
  if (al.length < 2) { r.phase = 'over'; r.winner = al[0].pid; log(r, `${al[0].name} venceu!`); award(r); return; }
  wait(r, 1800, () => {
    do { r.turn = (r.turn + 1) % r.players.length; } while (!r.players[r.turn].alive);
    r.phase = 'action';
  });
}

function apply(r, p, m) {
  if (!p.alive) return false;
  const pd = r.pending;
  if (m.t === 'act' && r.phase === 'action' && r.players[r.turn] === p) {
    const d = ACT[m.a]; if (!d) return false;
    if (p.coins >= 10 && m.a !== 'coup') return false;
    if (p.coins < (d.cost || 0)) return false;
    let t = null;
    if (d.target) { t = P(r, m.target); if (!t || !t.alive || t === p) return false; }
    act(r, p, m.a, t); return true;
  }
  if (r.phase === 'react' && pd) {
    if (!eligible(r).includes(p.pid) || pd.pass.includes(p.pid)) return false;
    if (m.t === 'pass') {
      pd.pass.push(p.pid); r.say = { pid: p.pid, text: 'Deixo passar.' };
      if (eligible(r).every(x => pd.pass.includes(x))) wait(r, 1500, () => done(r));
      return true;
    }
    if (m.t === 'chal') {
      if (pd.block) {
        const b = P(r, pd.block.by);
        challenge(r, b, pd.block.char, p, () => end(r), () => { pd.block = null; pd.nc = true; resolve(r); });
        return true;
      }
      if (ACT[pd.a].claim && !pd.nc) {
        const a = P(r, pd.actor);
        challenge(r, a, ACT[pd.a].claim, p,
          () => { pd.nc = true; pd.pass = []; react(r); },
          () => { a.coins += ACT[pd.a].cost || 0; end(r); });
        return true;
      }
      return false;
    }
    if (m.t === 'block' && canBlock(r, p) && ACT[pd.a].block.includes(m.ch)) {
      pd.block = { by: p.pid, char: m.ch };
      pd.pass = [];
      const bu = db.users[p.pid]; if (bu) { bump(bu, 'blk'); save(); }
      r.say = { pid: p.pid, text: `Eu bloqueio! Sou ${AR[m.ch]}.` };
      log(r, `${p.name} bloqueia com ${N[m.ch]}`);
      wait(r, 2600, () => { r.phase = 'react'; }); return true;
    }
    return false;
  }
  if (r.phase === 'lose' && r.lose === p.pid && m.t === 'lose') {
    const c = p.cards[m.i]; if (!c || c.dead) return false;
    const nx = r.next; r.lose = null; kill(r, p, m.i, nx); return true;
  }
  if (r.phase === 'exchange' && r.xchg && r.xchg.pid === p.pid && m.t === 'xchg') {
    const x = r.xchg, k = m.k;
    if (!Array.isArray(k) || k.length !== x.keep || new Set(k).size !== k.length || k.some(i => !(i >= 0 && i < x.pool.length))) return false;
    const kept = k.map(i => x.pool[i]);
    x.pool.forEach((c, i) => { if (!k.includes(i)) r.deck.push(c); }); shuffle(r.deck);
    let j = 0; p.cards.forEach(c => { if (!c.dead) c.c = kept[j++]; });
    r.xchg = null; log(r, `${p.name} trocou cartas`); end(r); return true;
  }
  return false;
}

/* ---------- Bots (fácil, médio, difícil) ---------- */
const PRI = { assassin: 5, duke: 4, captain: 3, contessa: 2, ambassador: 1 };
function unknownLeft(r, b, ch) {
  let seen = live(b).filter(c => c.c === ch).length;
  r.players.forEach(p => p.cards.forEach(c => { if (c.dead && c.c === ch) seen++; }));
  return Math.max(0, r.copies - seen);
}
function botAction(r, cur) {
  const lv = cur.lv || 'medio', others = alive(r).filter(p => p !== cur), any = rnd(others);
  const rich = [...others].sort((a, b) => b.coins - a.coins)[0];
  const weak = [...others].sort((a, b) => live(a).length - live(b).length || b.coins - a.coins)[0];
  const has = ch => live(cur).some(c => c.c === ch);
  if (cur.coins >= 10) return { a: 'coup', target: (lv === 'dificil' ? weak : any).pid };
  if (lv === 'facil') {
    if (cur.coins >= 7 && Math.random() < .3) return { a: 'coup', target: any.pid };
    return { a: rnd(['income', 'aid', 'tax', 'steal', 'exchange']), target: any.pid };
  }
  if (lv === 'medio') {
    const opts = ['income', 'aid', 'tax', 'steal', 'exchange']; if (cur.coins >= 3) opts.push('assassinate', 'assassinate');
    return { a: (cur.coins >= 7 && Math.random() < .6) ? 'coup' : rnd(opts), target: any.pid };
  }
  if (cur.coins >= 7) return { a: 'coup', target: weak.pid };
  const opts = ['income'];
  if (has('duke')) opts.push('tax', 'tax', 'tax');
  if (has('assassin') && cur.coins >= 3) opts.push('assassinate', 'assassinate', 'assassinate');
  if (has('captain') && others.some(o => o.coins > 0)) opts.push('steal', 'steal');
  if (has('ambassador')) opts.push('exchange');
  if (Math.random() < .22) opts.push(rnd(['tax', 'steal', cur.coins >= 3 ? 'assassinate' : 'aid'])); // blefe ocasional
  const a = rnd(opts);
  const t = a === 'steal' ? ([...others].filter(o => o.coins > 0).sort((x, y) => y.coins - x.coins)[0] || rich) : a === 'assassinate' ? weak : any;
  return { a, target: t.pid };
}
function reactChoice(r, b) {
  const lv = b.lv || 'medio', pd = r.pending, d = ACT[pd.a], has = ch => live(b).some(x => x.c === ch), R = Math.random;
  if (pd.block) {
    if (lv === 'facil') return { t: 'pass' };
    if (lv === 'medio') return R() < .2 ? { t: 'chal' } : { t: 'pass' };
    const left = unknownLeft(r, b, pd.block.char);
    return R() < (left === 0 ? 1 : pd.actor === b.pid ? .45 : .1) ? { t: 'chal' } : { t: 'pass' };
  }
  if (canBlock(r, b)) {
    const ok = d.block.find(has);
    if (lv === 'facil') { if (ok && R() < .5) return { t: 'block', ch: ok }; }
    else if (lv === 'medio') {
      if (ok && R() < .85) return { t: 'block', ch: ok };
      if (!ok && R() < .25) return { t: 'block', ch: d.block[0] };
    } else {
      if (ok) return { t: 'block', ch: ok };
      if (R() < (pd.a === 'assassinate' ? .65 : .3)) return { t: 'block', ch: d.block[0] };
    }
  }
  if (d.claim && !pd.nc) {
    let p;
    if (lv === 'facil') p = .05; else if (lv === 'medio') p = .12;
    else {
      const left = unknownLeft(r, b, d.claim);
      p = left === 0 ? 1 : Math.max(.04, .3 - .1 * left);
      if (pd.t === b.pid) p = Math.min(.9, p + .2);
    }
    if (R() < p) return { t: 'chal' };
  }
  return { t: 'pass' };
}
function botLose(b) {
  const idx = b.cards.map((c, i) => i).filter(i => !b.cards[i].dead);
  if (b.lv === 'dificil') return idx.sort((x, y) => PRI[b.cards[x].c] - PRI[b.cards[y].c])[0];
  return rnd(idx);
}
function botTick(r) {
  r.bt = false;
  if (!r.phase || r.phase === 'lobby' || r.phase === 'over' || r.phase === 'wait') return;
  let did = false;
  const pd = r.pending, cur = r.players[r.turn];
  if (r.phase === 'action' && cur.bot && cur.alive) {
    const m = botAction(r, cur); did = apply(r, cur, { t: 'act', a: m.a, target: m.target });
  } else if (r.phase === 'react' && pd) {
    const b = alive(r).find(p => p.bot && eligible(r).includes(p.pid) && !pd.pass.includes(p.pid));
    if (b) did = apply(r, b, reactChoice(r, b));
  } else if (r.phase === 'lose') {
    const b = P(r, r.lose);
    if (b && b.bot) did = apply(r, b, { t: 'lose', i: botLose(b) });
  } else if (r.phase === 'exchange' && r.xchg) {
    const b = P(r, r.xchg.pid);
    if (b && b.bot) {
      const pool = r.xchg.pool.map((c, i) => i), keep = r.xchg.keep;
      const k = b.lv === 'dificil' ? pool.sort((x, y) => PRI[r.xchg.pool[y]] - PRI[r.xchg.pool[x]]).slice(0, keep) : shuffle(pool).slice(0, keep);
      did = apply(r, b, { t: 'xchg', k });
    }
  }
  if (did) send(r);
}

function view(r, me) {
  const pd = r.pending;
  const el = r.phase === 'react' ? eligible(r).filter(x => !pd.pass.includes(x)) : [];
  const can = r.phase === 'react' && el.includes(me.pid)
    ? { chal: pd.block ? true : !!(ACT[pd.a].claim && !pd.nc), block: canBlock(r, me) ? ACT[pd.a].block : [] } : null;
  return {
    code: r.code, host: r.host, phase: r.phase, me: me.pid, copies: r.copies, deck: r.deck.length, lv: r.lv || 'medio',
    winner: r.winner, log: r.log, turn: r.players[r.turn] && r.players[r.turn].pid, say: r.say || null, reveal: r.reveal || null, fx: r.fx || null,
    pd: pd && { actor: pd.actor, a: pd.a, t: pd.t, block: pd.block, wait: el }, can, lose: r.lose,
    xchg: r.xchg && r.xchg.pid === me.pid ? r.xchg : null,
    players: r.players.map(p => ({
      pid: p.pid, name: p.name, bot: !!p.bot, av: p.av, coins: p.coins, alive: p.alive,
      cards: p.cards.map(c => ({ dead: c.dead, c: (c.dead || p === me) ? c.c : null }))
    }))
  };
}
function send(r) {
  r.t = Date.now();
  r.players.forEach(p => p.sid && io.to(p.sid).emit('state', view(r, p)));
  if (!r.bt && r.players.some(p => p.bot)) { r.bt = true; setTimeout(() => botTick(r), 2000 + Math.random() * 1500); }
}

io.on('connection', s => {
  s.data = {};
  const R = () => rooms[s.data.code];
  s.on('api', async (m, cb) => { try { cb(await api(s, m || {})); } catch (e) { cb({ err: e.message }); } });
  s.on('disconnect', () => { const u = s.data.u; if (u && online[u.id] === s.id) delete online[u.id]; });

  s.on('join', ({ code, create, bots, lv, friends } = {}) => {
    const u = s.data.u; if (!u) return;
    let r;
    if (create) {
      do { code = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[code]);
      r = rooms[code] = { code, players: [], host: u.id, phase: 'lobby', log: [], deck: [], t: Date.now(), lv: ['facil', 'medio', 'dificil'].includes(lv) ? lv : 'medio' };
      if (friends) u.friends.forEach(c => { const f = db.users[db.codes[c]]; if (f && online[f.id]) io.to(online[f.id]).emit('invite', { from: u.name, room: code }); });
    } else { code = String(code || '').trim().toUpperCase(); r = rooms[code]; }
    if (!r) return s.emit('err', 'Sala não encontrada.');
    let p = P(r, u.id);
    if (!p) {
      if (r.phase !== 'lobby') return s.emit('err', 'O jogo dessa sala já começou.');
      if (r.players.length >= 10) return s.emit('err', 'Sala cheia (máximo de 10).');
      p = { pid: u.id, coins: 0, cards: [], alive: true }; r.players.push(p);
    }
    p.name = u.name; p.av = avOf(u); p.sid = s.id; s.data.code = code;
    if (create) for (let i = 0; i < Math.min(bots | 0, 5); i++) addBot(r);
    send(r);
  });

  s.on('bot', d => {
    const r = R(); if (!r || r.phase !== 'lobby' || r.host !== s.data.u.id) return;
    if (d > 0 && r.players.length < 10) addBot(r);
    if (d < 0) { const i = r.players.map(p => !!p.bot).lastIndexOf(true); if (i >= 0) r.players.splice(i, 1); }
    send(r);
  });

  s.on('blevel', l => {
    const r = R(); if (!r || r.phase !== 'lobby' || r.host !== s.data.u.id || !['facil', 'medio', 'dificil'].includes(l)) return;
    r.lv = l; r.players.forEach(p => { if (p.bot) p.lv = l; }); send(r);
  });

  s.on('start', () => {
    const r = R();
    if (!r || r.phase !== 'lobby' || r.host !== s.data.u.id || r.players.length < 2) return;
    const n = r.players.length; r.copies = copies(n);
    r.deck = shuffle(CH.flatMap(c => Array(r.copies).fill(c)));
    r.players.forEach(p => { p.coins = 2; p.alive = true; p.cards = [{ c: r.deck.pop(), dead: false }, { c: r.deck.pop(), dead: false }]; });
    r.turn = Math.floor(Math.random() * n); r.phase = 'action'; r.winner = null; r.log = []; r.say = null; r.reveal = null; r.fx = null;
    log(r, `O jogo começou com ${n * 2 + r.deck.length} cartas (${r.copies} de cada)`); send(r);
  });

  s.on('again', () => {
    const r = R();
    if (!r || r.phase !== 'over' || r.host !== s.data.u.id) return;
    r.phase = 'lobby'; r.log = []; r.pending = null; r.winner = null; r.say = null; r.reveal = null; r.fx = null; send(r);
  });

  s.on('emote', ({ id } = {}) => {
    const r = R(), u = s.data.u; if (!r || !u || r.phase === 'lobby') return;
    const p = P(r, u.id), e = EM.find(x => x.id === id);
    if (!p || !e || !(e.c === 0 || isOwner(u) || u.items.includes(e.id))) return;
    if (Date.now() - (p.fxt || 0) < 2500) return; p.fxt = Date.now();
    r.fxk = (r.fxk || 0) + 1; r.fx = { pid: p.pid, id: e.id, k: r.fxk }; send(r);
  });

  s.on('move', m => {
    const r = R(); if (!r || !m || !s.data.u) return;
    const p = P(r, s.data.u.id);
    if (p && apply(r, p, m)) send(r);
  });
});

setInterval(() => { for (const k in rooms) if (Date.now() - rooms[k].t > 6 * 3600e3) delete rooms[k]; }, 600e3);
load().then(() => srv.listen(process.env.PORT || 3000, () => console.log('Coup online rodando' + (SBURL ? ' (Supabase)' : ' (arquivo local)'))))
  .catch(e => { console.error('Falha ao carregar o banco:', e.message); process.exit(1); });
