const express = require('express'), http = require('http'), fs = require('fs'), crypto = require('crypto'), { Server } = require('socket.io');
const { SK, MS } = require('./public/shared.js');
const app = express(); app.use(express.static(__dirname + '/public'));
const srv = http.createServer(app), io = new Server(srv);

/* ---------- Banco simples em arquivo (ver aviso sobre persistência no Render) ---------- */
const FILE = process.env.DATA_FILE || __dirname + '/data.json';
let db = { users: {}, emails: {}, codes: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(FILE)); } catch (e) {}
let sv; const save = () => { clearTimeout(sv); sv = setTimeout(() => fs.writeFile(FILE, JSON.stringify(db), () => {}), 500); };
const online = {}, CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const avOf = u => { const k = u.skin && SK.find(x => x.id === u.skin); return k ? k.a : u.avatar; };
const profile = u => ({
  id: u.id, email: u.email, name: u.name, code: u.code, pts: u.pts, stats: u.stats, claimed: u.claimed,
  skins: u.skins, avatar: u.avatar, skin: u.skin,
  friends: u.friends.map(c => db.users[db.codes[c]]).filter(Boolean).map(f => ({ code: f.code, name: f.name, av: avOf(f), on: !!online[f.id] }))
});
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
const sess = u => { const t = crypto.randomBytes(24).toString('hex'); db.sessions[t] = u.id; save(); return t; };
function login(s, u, tk) { s.data.u = u; online[u.id] = s.id; return { token: tk || sess(u), me: profile(u) }; }

// Retorna null se o e-mail não estiver configurado (conta é confirmada na hora)
async function mail(to, link) {
  if (!process.env.BREVO_KEY) return null;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Coup Online', email: process.env.MAIL_FROM }, to: [{ email: to }],
        subject: 'Confirme sua conta no Coup Online',
        htmlContent: `<p>Para ativar sua conta, clique no botão abaixo.</p><p><a href="${link}" style="background:#d4a94f;color:#2a1d00;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar conta</a></p>`
      })
    });
    return r.ok;
  } catch (e) { return false; }
}
app.get('/verify', (q, res) => {
  const u = Object.values(db.users).find(x => x.vt && x.vt === q.query.t);
  if (!u) return res.status(400).send('Link inválido ou já usado.');
  u.ok = true; u.vt = null; save(); res.redirect('/?ok=1');
});

async function api(s, m) {
  const u = s.data.u;
  if (m.t === 'reg') {
    const email = String(m.email || '').trim().toLowerCase(), name = String(m.name || '').trim().slice(0, 14), pass = String(m.pass || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if (name.length < 2) throw new Error('Digite um nome com 2 letras ou mais.');
    if (pass.length < 6) throw new Error('A senha precisa de 6 caracteres ou mais.');
    if (db.emails[email]) throw new Error('Esse e-mail já tem conta.');
    const id = crypto.randomBytes(8).toString('hex'), salt = crypto.randomBytes(8).toString('hex');
    let code; do { code = Array.from({ length: 6 }, () => CODE[Math.floor(Math.random() * CODE.length)]).join(''); } while (db.codes[code]);
    const nu = { id, email, name, salt, hash: hash(pass, salt), ok: false, vt: crypto.randomBytes(16).toString('hex'), code, friends: [], pts: 0,
      stats: { games: 0, wins: 0, chal: 0 }, claimed: [], skins: [], skin: null, avatar: { h: 1, hc: '#3b2a1a', oc: '#2574a9', skin: '#f1c27d' } };
    const sent = await mail(email, `${process.env.BASE_URL || s.handshake.headers.origin || ''}/verify?t=${nu.vt}`);
    if (sent === false) throw new Error('Não consegui enviar o e-mail. Confira o endereço e tente de novo.');
    db.users[id] = nu; db.emails[email] = id; db.codes[code] = id;
    if (sent === null) { nu.ok = true; nu.vt = null; save(); return login(s, nu); }
    save(); return { verify: true };
  }
  if (m.t === 'login') {
    const x = db.users[db.emails[String(m.email || '').trim().toLowerCase()]];
    if (!x || !crypto.timingSafeEqual(Buffer.from(hash(String(m.pass || ''), x.salt)), Buffer.from(x.hash))) throw new Error('E-mail ou senha incorretos.');
    if (!x.ok) throw new Error('Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).');
    return login(s, x);
  }
  if (m.t === 'tok') { const x = db.users[db.sessions[m.tk]]; if (!x) throw new Error('Sessão expirada.'); return login(s, x, m.tk); }
  if (!u) throw new Error('Entre na sua conta.');
  switch (m.t) {
    case 'me': return { me: profile(u) };
    case 'name': { const n = String(m.name || '').trim().slice(0, 14); if (n.length < 2) throw new Error('Nome muito curto.'); u.name = n; break; }
    case 'friend': {
      const f = db.users[db.codes[String(m.code || '').trim().toUpperCase()]];
      if (!f) throw new Error('Código não encontrado.'); if (f === u) throw new Error('Esse é o seu próprio código.');
      if (!u.friends.includes(f.code)) { u.friends.push(f.code); f.friends.push(u.code); } break;
    }
    case 'avatar': {
      const a = m.a || {}, ok = c => /^#[0-9a-f]{6}$/i.test(c);
      u.avatar = { h: [0, 1, 2, 3].includes(a.h) ? a.h : 1, hc: ok(a.hc) ? a.hc : '#3b2a1a', oc: ok(a.oc) ? a.oc : '#2574a9', skin: ok(a.skin) ? a.skin : '#f1c27d' };
      u.skin = null; break;
    }
    case 'skin': {
      if (m.id) { const k = SK.find(x => x.id === m.id); if (!k || (k.c && !u.skins.includes(k.id))) throw new Error('Skin bloqueada.'); }
      u.skin = m.id || null; break;
    }
    case 'buy': { const k = SK.find(x => x.id === m.id); if (!k || u.skins.includes(k.id) || u.pts < k.c) throw new Error('Pontos insuficientes.'); u.pts -= k.c; u.skins.push(k.id); break; }
    case 'claim': { const k = MS.find(x => x.id === m.id); if (!k || u.claimed.includes(k.id) || u.stats[k.k] < k.n) throw new Error('Missão incompleta.'); u.claimed.push(k.id); u.pts += k.p; break; }
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
const CAP = {
  income: a => `${a} pegou renda`, aid: a => `${a} pediu ajuda externa`, coup: (a, t) => `${a} deu um golpe em ${t}`,
  tax: a => `${a} cobrou impostos (Duque)`, assassinate: (a, t) => `${a} tentou assassinar ${t}`,
  steal: (a, t) => `${a} extorquiu ${t}`, exchange: a => `${a} trocou cartas (Embaixador)`
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

function addBot(r) {
  const used = r.players.map(p => p.name), nm = BN.find(n => !used.includes('Bot ' + n)) || 'X';
  r.players.push({ pid: 'bot' + Math.random().toString(36).slice(2, 7), name: 'Bot ' + nm, bot: true, av: rnd(SK).a, coins: 0, cards: [], alive: true });
}
function kill(r, p, i, next) {
  const c = p.cards[i]; c.dead = true; log(r, `${p.name} perdeu ${N[c.c]}`);
  if (!live(p).length) { p.alive = false; log(r, `${p.name} foi eliminado`); }
  r.phase = null; next();
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
  log(r, `${challenger.name} desafiou ${claimer.name} (${N[ch]})`);
  if (live(claimer).some(c => c.c === ch)) {
    log(r, `${claimer.name} tinha ${N[ch]}!`); swap(r, claimer, ch); lose(r, challenger.pid, won);
  } else {
    log(r, `${claimer.name} estava blefando`);
    const cu = db.users[challenger.pid]; if (cu) { cu.stats.chal++; save(); }
    lose(r, claimer.pid, lost);
  }
}
function canBlock(r, p) { const pd = r.pending, d = ACT[pd.a]; return !pd.block && !!d.block && (pd.a === 'aid' || pd.t === p.pid); }
function eligible(r) {
  const pd = r.pending, d = ACT[pd.a];
  if (pd.block) return alive(r).filter(p => p.pid !== pd.block.by).map(p => p.pid);
  return alive(r).filter(p => p.pid !== pd.actor && ((d.claim && !pd.nc) || canBlock(r, p))).map(p => p.pid);
}
function act(r, p, a, t) {
  r.pending = { actor: p.pid, a, t: t ? t.pid : null, pass: [], block: null, nc: false };
  p.coins -= ACT[a].cost || 0;
  log(r, CAP[a](p.name, t && t.name)); react(r);
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
    case 'tax': p.coins += 3; break;
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
    u.stats.games++; u.pts += 10;
    if (p.pid === r.winner) { u.stats.wins++; u.pts += 30; }
  });
  save();
}
function end(r) {
  r.pending = null; r.phase = null;
  const al = alive(r);
  if (al.length < 2) { r.phase = 'over'; r.winner = al[0].pid; log(r, `${al[0].name} venceu!`); award(r); return; }
  do { r.turn = (r.turn + 1) % r.players.length; } while (!r.players[r.turn].alive);
  r.phase = 'action';
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
      pd.pass.push(p.pid);
      if (eligible(r).every(x => pd.pass.includes(x))) done(r);
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
      pd.block = { by: p.pid, char: m.ch }; pd.pass = [];
      log(r, `${p.name} bloqueia com ${N[m.ch]}`); r.phase = 'react'; return true;
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

/* ---------- Bots ---------- */
function reactChoice(r, b) {
  const pd = r.pending, d = ACT[pd.a], has = ch => live(b).some(x => x.c === ch);
  if (pd.block) return Math.random() < .2 ? { t: 'chal' } : { t: 'pass' };
  if (canBlock(r, b)) {
    const ok = d.block.find(has);
    if (ok && Math.random() < .85) return { t: 'block', ch: ok };
    if (!ok && Math.random() < .25) return { t: 'block', ch: d.block[0] };
  }
  if (d.claim && !pd.nc && Math.random() < .12) return { t: 'chal' };
  return { t: 'pass' };
}
function botTick(r) {
  r.bt = false;
  if (!r.phase || r.phase === 'lobby' || r.phase === 'over') return;
  let did = false;
  const pd = r.pending, cur = r.players[r.turn];
  if (r.phase === 'action' && cur.bot && cur.alive) {
    const others = alive(r).filter(p => p !== cur), t = rnd(others);
    const opts = ['income', 'aid', 'tax', 'steal', 'exchange']; if (cur.coins >= 3) opts.push('assassinate', 'assassinate');
    const a = (cur.coins >= 10 || (cur.coins >= 7 && Math.random() < .6)) ? 'coup' : rnd(opts);
    did = apply(r, cur, { t: 'act', a, target: t.pid });
  } else if (r.phase === 'react' && pd) {
    const b = alive(r).find(p => p.bot && eligible(r).includes(p.pid) && !pd.pass.includes(p.pid));
    if (b) did = apply(r, b, reactChoice(r, b));
  } else if (r.phase === 'lose') {
    const b = P(r, r.lose);
    if (b && b.bot) did = apply(r, b, { t: 'lose', i: rnd(b.cards.map((c, i) => i).filter(i => !b.cards[i].dead)) });
  } else if (r.phase === 'exchange' && r.xchg) {
    const b = P(r, r.xchg.pid);
    if (b && b.bot) did = apply(r, b, { t: 'xchg', k: shuffle(r.xchg.pool.map((c, i) => i)).slice(0, r.xchg.keep) });
  }
  if (did) send(r);
}

function view(r, me) {
  const pd = r.pending;
  const el = r.phase === 'react' ? eligible(r).filter(x => !pd.pass.includes(x)) : [];
  const can = r.phase === 'react' && el.includes(me.pid)
    ? { chal: pd.block ? true : !!(ACT[pd.a].claim && !pd.nc), block: canBlock(r, me) ? ACT[pd.a].block : [] } : null;
  return {
    code: r.code, host: r.host, phase: r.phase, me: me.pid, copies: r.copies, deck: r.deck.length,
    winner: r.winner, log: r.log, turn: r.players[r.turn] && r.players[r.turn].pid,
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
  if (!r.bt && r.players.some(p => p.bot)) { r.bt = true; setTimeout(() => botTick(r), 1300); }
}

io.on('connection', s => {
  s.data = {};
  const R = () => rooms[s.data.code];
  s.on('api', async (m, cb) => { try { cb(await api(s, m || {})); } catch (e) { cb({ err: e.message }); } });
  s.on('disconnect', () => { const u = s.data.u; if (u && online[u.id] === s.id) delete online[u.id]; });

  s.on('join', ({ code, create, bots } = {}) => {
    const u = s.data.u; if (!u) return;
    let r;
    if (create) {
      do { code = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms[code]);
      r = rooms[code] = { code, players: [], host: u.id, phase: 'lobby', log: [], deck: [], t: Date.now() };
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

  s.on('start', () => {
    const r = R();
    if (!r || r.phase !== 'lobby' || r.host !== s.data.u.id || r.players.length < 2) return;
    const n = r.players.length; r.copies = copies(n);
    r.deck = shuffle(CH.flatMap(c => Array(r.copies).fill(c)));
    r.players.forEach(p => { p.coins = 2; p.alive = true; p.cards = [{ c: r.deck.pop(), dead: false }, { c: r.deck.pop(), dead: false }]; });
    r.turn = Math.floor(Math.random() * n); r.phase = 'action'; r.winner = null; r.log = []; r.awarded = false;
    log(r, `O jogo começou com ${n * 2 + r.deck.length} cartas (${r.copies} de cada)`); send(r);
  });

  s.on('again', () => {
    const r = R();
    if (!r || r.phase !== 'over' || r.host !== s.data.u.id) return;
    r.phase = 'lobby'; r.log = []; r.pending = null; r.winner = null; send(r);
  });

  s.on('move', m => {
    const r = R(); if (!r || !m || !s.data.u) return;
    const p = P(r, s.data.u.id);
    if (p && apply(r, p, m)) send(r);
  });
});

setInterval(() => { for (const k in rooms) if (Date.now() - rooms[k].t > 6 * 3600e3) delete rooms[k]; }, 600e3);
srv.listen(process.env.PORT || 3000, () => console.log('Coup online rodando'));
