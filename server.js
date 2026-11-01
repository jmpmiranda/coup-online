const express = require('express'), http = require('http'), { Server } = require('socket.io');
const app = express(); app.use(express.static(__dirname + '/public'));
const srv = http.createServer(app), io = new Server(srv);

const CH = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
const N = { duke: 'Duque', assassin: 'Assassino', captain: 'Capitão', ambassador: 'Embaixador', contessa: 'Condessa' };
const AN = { income: 'Renda', aid: 'Ajuda externa', coup: 'Golpe', tax: 'Taxar', assassinate: 'Assassinar', steal: 'Roubar', exchange: 'Trocar cartas' };
const ACT = {
  income: {}, aid: { block: ['duke'] }, coup: { cost: 7, target: 1 },
  tax: { claim: 'duke' },
  assassinate: { cost: 3, claim: 'assassin', target: 1, block: ['contessa'] },
  steal: { claim: 'captain', target: 1, block: ['captain', 'ambassador'] },
  exchange: { claim: 'ambassador' }
};
const rooms = {};

// Cópias de cada personagem conforme o número de jogadores (4 jogadores = 3 cópias = 15 cartas)
const copies = n => Math.round((2 * n + 7) / 5);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const P = (r, pid) => r.players.find(p => p.pid === pid);
const live = p => p.cards.filter(c => !c.dead);
const alive = r => r.players.filter(p => p.alive);
const log = (r, t) => { r.log.push(t); if (r.log.length > 40) r.log.shift(); };

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
    log(r, `${claimer.name} estava blefando`); lose(r, claimer.pid, lost);
  }
}
function canBlock(r, p) {
  const pd = r.pending, d = ACT[pd.a];
  return !pd.block && !!d.block && (pd.a === 'aid' || pd.t === p.pid);
}
function eligible(r) {
  const pd = r.pending, d = ACT[pd.a];
  if (pd.block) return alive(r).filter(p => p.pid !== pd.block.by).map(p => p.pid);
  return alive(r).filter(p => p.pid !== pd.actor && ((d.claim && !pd.nc) || canBlock(r, p))).map(p => p.pid);
}
function act(r, p, a, t) {
  const d = ACT[a];
  r.pending = { actor: p.pid, a, t: t ? t.pid : null, pass: [], block: null, nc: false };
  p.coins -= d.cost || 0;
  log(r, `${p.name} usou ${AN[a]}${t ? ' em ' + t.name : ''}`);
  react(r);
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
    case 'steal': if (t && t.alive) { const n = Math.min(2, t.coins); t.coins -= n; p.coins += n; log(r, `${p.name} roubou ${n} de ${t.name}`); } break;
    case 'coup': case 'assassinate': return lose(r, t.pid, () => end(r));
    case 'exchange': {
      const pool = live(p).map(c => c.c).concat(r.deck.splice(-2));
      r.xchg = { pid: p.pid, pool, keep: live(p).length }; r.phase = 'exchange'; return;
    }
  }
  end(r);
}
function end(r) {
  r.pending = null; r.phase = null;
  const al = alive(r);
  if (al.length < 2) { r.phase = 'over'; r.winner = al[0] && al[0].pid; log(r, `${al[0].name} venceu!`); return; }
  do { r.turn = (r.turn + 1) % r.players.length; } while (!r.players[r.turn].alive);
  r.phase = 'action';
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
      pid: p.pid, name: p.name, coins: p.coins, alive: p.alive,
      cards: p.cards.map(c => ({ dead: c.dead, c: (c.dead || p === me) ? c.c : null }))
    }))
  };
}
function send(r) { r.t = Date.now(); r.players.forEach(p => p.sid && io.to(p.sid).emit('state', view(r, p))); }

io.on('connection', s => {
  const R = () => rooms[s.data.code];

  s.on('join', ({ code, name, pid, create }) => {
    if (!pid) return;
    name = String(name || '').trim().slice(0, 14) || 'Jogador';
    let r;
    if (create) {
      code = Math.random().toString(36).slice(2, 6).toUpperCase();
      r = rooms[code] = { code, players: [], host: pid, phase: 'lobby', log: [], deck: [], t: Date.now() };
    } else { code = String(code || '').toUpperCase(); r = rooms[code]; }
    if (!r) return s.emit('err', 'Sala não encontrada.');
    let p = P(r, pid);
    if (!p) {
      if (r.phase !== 'lobby') return s.emit('err', 'O jogo dessa sala já começou.');
      if (r.players.length >= 10) return s.emit('err', 'Sala cheia (máximo de 10).');
      p = { pid, name, coins: 0, cards: [], alive: true }; r.players.push(p);
    }
    p.sid = s.id; s.data = { code, pid }; send(r);
  });

  s.on('start', () => {
    const r = R();
    if (!r || r.phase !== 'lobby' || r.host !== s.data.pid || r.players.length < 2) return;
    const n = r.players.length; r.copies = copies(n);
    r.deck = shuffle(CH.flatMap(c => Array(r.copies).fill(c)));
    r.players.forEach(p => { p.coins = 2; p.alive = true; p.cards = [{ c: r.deck.pop(), dead: false }, { c: r.deck.pop(), dead: false }]; });
    r.turn = Math.floor(Math.random() * n); r.phase = 'action'; r.winner = null; r.log = [];
    log(r, `O jogo começou com ${n * 2 + r.deck.length} cartas (${r.copies} de cada)`); send(r);
  });

  s.on('again', () => {
    const r = R();
    if (!r || r.phase !== 'over' || r.host !== s.data.pid) return;
    r.phase = 'lobby'; r.log = []; r.pending = null; r.winner = null; send(r);
  });

  s.on('move', m => {
    const r = R(); if (!r || !m) return;
    const p = P(r, s.data.pid); if (!p || !p.alive) return;
    const pd = r.pending;
    if (m.t === 'act' && r.phase === 'action' && r.players[r.turn] === p) {
      const d = ACT[m.a]; if (!d) return;
      if (p.coins >= 10 && m.a !== 'coup') return;
      if (p.coins < (d.cost || 0)) return;
      let t = null;
      if (d.target) { t = P(r, m.target); if (!t || !t.alive || t === p) return; }
      act(r, p, m.a, t);
    } else if (r.phase === 'react' && pd) {
      if (!eligible(r).includes(p.pid) || pd.pass.includes(p.pid)) return;
      if (m.t === 'pass') {
        pd.pass.push(p.pid);
        if (eligible(r).every(x => pd.pass.includes(x))) done(r);
      } else if (m.t === 'chal') {
        if (pd.block) {
          const b = P(r, pd.block.by);
          challenge(r, b, pd.block.char, p, () => end(r), () => { pd.block = null; pd.nc = true; resolve(r); });
        } else if (ACT[pd.a].claim && !pd.nc) {
          const a = P(r, pd.actor);
          challenge(r, a, ACT[pd.a].claim, p,
            () => { pd.nc = true; pd.pass = []; react(r); },
            () => { a.coins += ACT[pd.a].cost || 0; end(r); });
        }
      } else if (m.t === 'block' && canBlock(r, p) && ACT[pd.a].block.includes(m.ch)) {
        pd.block = { by: p.pid, char: m.ch }; pd.pass = [];
        log(r, `${p.name} bloqueia com ${N[m.ch]}`); r.phase = 'react';
      }
    } else if (r.phase === 'lose' && r.lose === p.pid && m.t === 'lose') {
      const c = p.cards[m.i]; if (!c || c.dead) return;
      const nx = r.next; r.lose = null; kill(r, p, m.i, nx);
    } else if (r.phase === 'exchange' && r.xchg && r.xchg.pid === p.pid && m.t === 'xchg') {
      const x = r.xchg, k = m.k;
      if (!Array.isArray(k) || k.length !== x.keep || new Set(k).size !== k.length || k.some(i => !(i >= 0 && i < x.pool.length))) return;
      const kept = k.map(i => x.pool[i]);
      x.pool.forEach((c, i) => { if (!k.includes(i)) r.deck.push(c); }); shuffle(r.deck);
      let j = 0; p.cards.forEach(c => { if (!c.dead) c.c = kept[j++]; });
      r.xchg = null; log(r, `${p.name} trocou cartas`); end(r);
    } else return;
    send(r);
  });
});

setInterval(() => { for (const k in rooms) if (Date.now() - rooms[k].t > 6 * 3600e3) delete rooms[k]; }, 600e3);
srv.listen(process.env.PORT || 3000, () => console.log('Coup online rodando'));
