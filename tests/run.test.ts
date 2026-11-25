import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Rng } from '../src/rules/rng';
import { Run, START, TOTAL_WAVES, enemyStats, ghostStats, pickGhostRole, powerScoreOf } from '../src/rules/run';
import { IMPLANTS } from '../src/data/implants';
import type { Stats } from '../src/types';

const newRun = (seed = 1) => new Run(seed, []);

test('Rng: mesma seed repete a sequência e seeds diferentes divergem', () => {
  const a = new Rng(123);
  const b = new Rng(123);
  const c = new Rng(124);
  const sa = Array.from({ length: 20 }, () => a.next());
  const sb = Array.from({ length: 20 }, () => b.next());
  const sc = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('Rng: restaurar o estado reproduz o mesmo futuro (base de save e replay)', () => {
  const r = new Rng(7);
  for (let i = 0; i < 10; i++) r.next();
  const saved = r.state;
  const futureA = [r.next(), r.next(), r.next()];
  r.state = saved;
  assert.deepEqual([r.next(), r.next(), r.next()], futureA);
});

test('Rng: int respeita os limites inclusivos', () => {
  const r = new Rng(5);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(0, 3);
    assert.ok(v >= 0 && v <= 3);
    seen.add(v);
  }
  assert.equal(seen.size, 4); // todos os valores aparecem
});

test('Loja: a mesma seed oferece os mesmos itens, não importa quantos spawns aconteceram', () => {
  const a = newRun(42);
  const b = newRun(42);
  for (let i = 0; i < 1000; i++) b.pickEnemyType(); // o jogador "demorou" mais na wave
  a.openShop();
  b.openShop();
  assert.deepEqual(
    a.shopItems.map((i) => i?.name),
    b.shopItems.map((i) => i?.name),
  );
});

test('Loja: 3 itens distintos por rolagem', () => {
  const r = newRun(9);
  r.openShop();
  assert.equal(r.shopItems.length, 3);
  assert.equal(new Set(r.shopItems.map((i) => i?.name)).size, 3);
});

test('Preço: cada implante instalado encarece os próximos em 25%', () => {
  const r = newRun();
  const imp = IMPLANTS[0];
  assert.equal(r.priceOf(imp), imp.edinhos);
  r.implants = ['a', 'b', 'c', 'd'];
  assert.equal(r.priceOf(imp), Math.round(imp.edinhos * 2));
});

test('Reroll: custo sobe 25 a cada uso e zera ao abrir a loja de novo', () => {
  const r = newRun();
  r.openShop();
  r.stats.edinhos = 1000;
  assert.equal(r.rerollCost(), 40);
  assert.ok(r.reroll());
  assert.equal(r.rerollCost(), 65);
  assert.ok(r.reroll());
  assert.equal(r.rerollCost(), 90);
  r.openShop();
  assert.equal(r.rerollCost(), 40);
});

test('Reroll sem edinhos suficientes não muda nada', () => {
  const r = newRun();
  r.openShop();
  const before = r.shopItems.map((i) => i?.name);
  r.stats.edinhos = 10;
  assert.equal(r.reroll(), false);
  assert.equal(r.stats.edinhos, 10);
  assert.deepEqual(r.shopItems.map((i) => i?.name), before);
});

test('Compra sem edinhos falha e deixa o estado intacto', () => {
  const r = newRun();
  r.openShop();
  const before = JSON.stringify(r.stats);
  const res = r.buy(0);
  assert.deepEqual(res, { ok: false, reason: 'poor' });
  assert.equal(JSON.stringify(r.stats), before);
  assert.equal(r.implants.length, 0);
});

test('Compra: desconta edinhos e humanidade, aplica o efeito e esvazia o slot', () => {
  const r = newRun();
  r.openShop();
  r.stats.edinhos = 5000;
  const imp = r.shopItems[0]!;
  const price = r.priceOf(imp);
  const res = r.buy(0);
  assert.ok(res.ok);
  assert.equal(r.stats.edinhos, 5000 - price);
  assert.equal(r.stats.humanity, START.humanity - imp.humanity);
  assert.deepEqual(r.implants, [imp.name]);
  assert.equal(r.shopItems[0], null);
  assert.deepEqual(r.buy(0), { ok: false, reason: 'empty' }); // não compra o mesmo slot duas vezes
});

test('Ciberpsicose: humanidade <= 0 depois da compra sinaliza psycho', () => {
  const r = newRun();
  r.openShop();
  r.stats.edinhos = 5000;
  r.stats.humanity = 5; // todo implante custa mais que isso
  const res = r.buy(0);
  assert.ok(res.ok && res.psycho);
});

test('Implantes: nomes únicos, custos positivos e todos mudam algum stat', () => {
  assert.equal(new Set(IMPLANTS.map((i) => i.name)).size, IMPLANTS.length);
  for (const imp of IMPLANTS) {
    assert.ok(imp.humanity > 0 && imp.edinhos > 0, imp.name);
    const s: Stats = { ...START, hp: 50 };
    const before = JSON.stringify(s);
    imp.apply(s);
    assert.notEqual(JSON.stringify(s), before, `${imp.name} não muda nada`);
  }
});

test('Implantes empilhados nunca passam dos pisos (cadência 80ms, lentidão 0.35x)', () => {
  const s: Stats = { ...START };
  for (let i = 0; i < 40; i++) for (const imp of IMPLANTS) imp.apply(s);
  assert.ok(s.fireDelay >= 80);
  assert.ok(s.enemySlow >= 0.35);
  assert.ok(s.hp <= s.maxHp);
});

test('Fantasma: papel por pontuação segue os pesos 75/40/15% de boss', () => {
  const share = (score: number) => {
    const rng = new Rng(2026);
    let boss = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (pickGhostRole(score, rng) === 'boss') boss++;
    return boss / n;
  };
  // tolerância de 2 pontos percentuais para 20 mil sorteios
  assert.ok(Math.abs(share(1000) - 0.75) < 0.02);
  assert.ok(Math.abs(share(700) - 0.4) < 0.02);
  assert.ok(Math.abs(share(400) - 0.15) < 0.02);
});

test('Fantasma: stats escalam pela pontuação com limites 0.8x e 1.4x', () => {
  const g = (score: number) => ({ score, wave: 3, implants: [] as string[] });
  const low = ghostStats(g(100), 'boss', 5).hp;
  const high = ghostStats(g(5000), 'boss', 5).hp;
  assert.equal(low, Math.round((36 + 5 * 14) * 0.8));
  assert.equal(high, Math.round((36 + 5 * 14) * 1.4));
  // implante temático aumenta o vetor certo
  const tank = ghostStats({ score: 800, wave: 1, implants: ['Subdermal Armor'] }, 'boss', 5);
  const plain = ghostStats(g(800), 'boss', 5);
  assert.ok(tank.hp > plain.hp);
});

test('Fantasma: o registro salvo guarda seed e pontuação da run', () => {
  const r = newRun(777);
  r.implants = ['Mantis Blades'];
  const rec = r.ghostRecord();
  assert.equal(rec.seed, 777);
  assert.equal(rec.score, r.powerScore());
  assert.deepEqual(rec.implants, ['Mantis Blades']);
});

test('Fantasma: a mesma seed sorteia o mesmo fantasma e o mesmo papel', () => {
  const pool = [
    { score: 500, wave: 2, implants: [] },
    { score: 900, wave: 4, implants: ['Gorilla Arms'] },
    { score: 1100, wave: 5, implants: ['Kerenzikov'] },
  ];
  const a = new Run(31337, pool);
  const b = new Run(31337, pool);
  assert.deepEqual(a.ghost, b.ghost);
  assert.equal(a.ghostRole, b.ghostRole);
});

test('Wave do boss: o tempo acabar só termina a wave depois do fantasma cair', () => {
  let boss: Run | undefined;
  let mini: Run | undefined;
  for (let seed = 1; seed < 500 && !(boss && mini); seed++) {
    const r = newRun(seed);
    if (r.ghostRole === 'boss') boss ??= r;
    else mini ??= r;
  }
  assert.ok(boss && mini, 'achou uma seed de cada papel');
  boss.wave = boss.ghostWave;
  assert.equal(boss.waveStatus(10), 'running');
  assert.equal(boss.waveStatus(0), 'overtime');
  boss.ghostDefeated = true;
  assert.equal(boss.waveStatus(0), 'done');
  assert.equal(boss.ghostWave, TOTAL_WAVES);
  // mini-boss nunca segura a wave
  mini.wave = mini.ghostWave;
  assert.equal(mini.waveStatus(0), 'done');
});

test('Inimigos: números por tipo e wave', () => {
  assert.deepEqual(enemyStats('normal', 1), { hp: 1, mul: 1, dmg: 7, reward: 5 });
  assert.deepEqual(enemyStats('tank', 3), { hp: 6, mul: 0.6, dmg: 18, reward: 12 });
  assert.equal(enemyStats('fast', 1).hp, 1); // nunca abaixo de 1
});

test('Spawn: só aparecem tipos liberados pela wave', () => {
  const r = newRun(3);
  for (let i = 0; i < 500; i++) assert.equal(r.pickEnemyType(), 'normal'); // wave 1
  r.wave = 2;
  const types = new Set(Array.from({ length: 500 }, () => r.pickEnemyType()));
  assert.ok(!types.has('tank'));
  assert.ok(types.has('fast'));
});

test('Pontuação de poder sobe com cada melhoria', () => {
  const base = powerScoreOf(START, 0, 1);
  assert.ok(powerScoreOf({ ...START, damage: 2 }, 0, 1) > base);
  assert.ok(powerScoreOf({ ...START, fireDelay: 200 }, 0, 1) > base);
  assert.ok(powerScoreOf({ ...START, enemySlow: 0.7 }, 0, 1) > base);
  assert.ok(powerScoreOf(START, 1, 1) > base);
  assert.ok(powerScoreOf(START, 0, 2) > base);
});
