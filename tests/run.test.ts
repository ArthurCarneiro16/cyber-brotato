import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Rng } from '../src/rules/rng';
import { Run, START, TOTAL_WAVES, enemyStats, ghostStats, pickGhostRole, powerScoreOf } from '../src/rules/run';
import { IMPLANTS } from '../src/data/implants';
import { WEAPON_LIST, WEAPONS } from '../src/data/weapons';
import { CLASS_LIST, CLASSES, applyClassToWeapon } from '../src/data/classes';
import type { Stats } from '../src/types';

const newRun = (seed = 1) => new Run(seed, []);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

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

// ---------- armas e classes ----------

test('Armas: ids únicos, preços positivos e campos coerentes com o tipo', () => {
  assert.equal(WEAPON_LIST.length, 6);
  assert.equal(new Set(WEAPON_LIST.map((w) => w.id)).size, WEAPON_LIST.length);
  for (const w of WEAPON_LIST) {
    assert.equal(WEAPONS[w.id], w, w.id);
    assert.ok(w.price > 0 && w.damage > 0 && w.delay > 0, w.id);
    if (w.kind === 'melee') {
      assert.ok(w.range > 0 && w.arc > 0, `${w.id} corpo a corpo precisa de alcance e arco`);
      assert.equal(w.pellets, 0, w.id);
    } else {
      assert.ok(w.projSpeed > 0 && w.life > 0 && w.pellets >= 1, `${w.id} tiro precisa de projétil`);
      assert.equal(w.pushMs, 0, w.id);
    }
    if (w.kind === 'smart') assert.ok(w.acquire > 0, w.id);
  }
});

test('Armas: a escopeta tem 5 projéteis e recebe só metade do bônus de dano', () => {
  assert.equal(WEAPONS.shotgun.pellets, 5);
  assert.equal(WEAPONS.shotgun.bonusMul, 0.5);
});

test('Classes: cada classe aponta para uma arma que existe e o HP bate com o GDD', () => {
  assert.equal(CLASS_LIST.length, 3);
  for (const c of CLASS_LIST) {
    assert.ok(WEAPONS[c.weapon], `${c.id} arma inicial inexistente`);
    assert.equal(CLASSES[c.id], c);
  }
  assert.equal(CLASSES.solo.hp, 120);
  assert.equal(CLASSES.netrunner.hp, 90);
  assert.equal(CLASSES.techie.hp, 100);
});

test('Classe: setClass define HP e arma inicial sem mexer nos outros stats nem nos implantes', () => {
  for (const c of CLASS_LIST) {
    const r = newRun();
    r.setClass(c.id);
    assert.equal(r.classId, c.id);
    assert.equal(r.stats.maxHp, c.hp);
    assert.equal(r.stats.hp, c.hp);
    assert.deepEqual(r.weapons, [c.weapon]);
    assert.equal(r.equipped, 0);
    assert.equal(r.weaponId, c.weapon);
    // nenhum bônus geral: o resto dos stats continua igual ao START
    const { hp: _h, maxHp: _m, ...rest } = r.stats;
    const { hp: _sh, maxHp: _sm, ...startRest } = START;
    assert.deepEqual(rest, startRest);
  }
});

test('Classe: sem setClass a run usa os stats base (simulador e testes antigos seguem iguais)', () => {
  const r = newRun();
  assert.equal(r.classId, null);
  assert.equal(r.stats.maxHp, START.maxHp);
  assert.equal(r.stats.hp, START.hp);
  assert.deepEqual(r.weapons, []);
  assert.equal(r.weaponId, 'pistol'); // fallback
});

test('Bônus de classe: Solo só melhora arma corpo a corpo (+1 dano)', () => {
  assert.equal(applyClassToWeapon('solo', WEAPONS.katana).damage, WEAPONS.katana.damage + 1);
  assert.equal(applyClassToWeapon('solo', WEAPONS.gorilla).damage, WEAPONS.gorilla.damage + 1);
  assert.equal(applyClassToWeapon('solo', WEAPONS.pistol).damage, WEAPONS.pistol.damage);
  assert.equal(applyClassToWeapon('solo', WEAPONS.smart).damage, WEAPONS.smart.damage);
});

test('Bônus de classe: Netrunner só acelera armas de fogo em 10%', () => {
  assert.ok(near(applyClassToWeapon('netrunner', WEAPONS.pistol).delay, WEAPONS.pistol.delay * 0.9));
  assert.ok(near(applyClassToWeapon('netrunner', WEAPONS.smg).delay, WEAPONS.smg.delay * 0.9));
  assert.ok(near(applyClassToWeapon('netrunner', WEAPONS.shotgun).delay, WEAPONS.shotgun.delay * 0.9));
  assert.equal(applyClassToWeapon('netrunner', WEAPONS.katana).delay, WEAPONS.katana.delay);
  assert.equal(applyClassToWeapon('netrunner', WEAPONS.smart).delay, WEAPONS.smart.delay);
});

test('Bônus de classe: Techie só melhora a pistola inteligente (360 px, 460 px/s)', () => {
  const smart = applyClassToWeapon('techie', WEAPONS.smart);
  assert.equal(smart.acquire, 360);
  assert.equal(smart.projSpeed, 460);
  assert.deepEqual(applyClassToWeapon('techie', WEAPONS.pistol), WEAPONS.pistol);
  assert.deepEqual(applyClassToWeapon('techie', WEAPONS.katana), WEAPONS.katana);
});

test('Bônus de classe: sem classe a arma não muda e o original nunca é alterado', () => {
  const before = JSON.stringify(WEAPONS.katana);
  assert.deepEqual(applyClassToWeapon(null, WEAPONS.katana), WEAPONS.katana);
  applyClassToWeapon('solo', WEAPONS.katana);
  assert.equal(JSON.stringify(WEAPONS.katana), before);
});

test('Loja de armas: 2 slots, armas distintas e nunca uma que o jogador já tem', () => {
  const r = newRun(11);
  r.setClass('solo');
  r.openShop();
  assert.equal(r.shopWeapons.length, 2);
  const [a, b] = r.shopWeapons;
  assert.ok(a && b);
  assert.notEqual(a.id, b.id);
  assert.ok(!r.weapons.includes(a.id));
  assert.ok(!r.weapons.includes(b.id));
});

test('Loja de armas: quando o jogador já tem todas, os slots ficam vazios', () => {
  const r = newRun();
  r.weapons = WEAPON_LIST.map((w) => w.id);
  r.openShop();
  assert.deepEqual(r.shopWeapons, [null, null]);
  assert.deepEqual(r.buyWeapon(0), { ok: false, reason: 'empty' });
});

test('Loja de armas: a mesma seed oferece as mesmas armas', () => {
  const a = newRun(42);
  const b = newRun(42);
  for (let i = 0; i < 1000; i++) b.pickEnemyType();
  a.openShop();
  b.openShop();
  assert.deepEqual(
    a.shopWeapons.map((w) => w?.id),
    b.shopWeapons.map((w) => w?.id),
  );
});

test('Loja de armas: o que o jogador possui nunca muda os implantes oferecidos', () => {
  const a = newRun(77);
  const b = newRun(77);
  b.weapons = ['pistol', 'smg', 'katana']; // b já tem armas, então o sorteio de armas consome menos
  for (let i = 0; i < 4; i++) {
    a.openShop();
    b.openShop();
    assert.deepEqual(
      a.shopItems.map((x) => x?.name),
      b.shopItems.map((x) => x?.name),
    );
  }
});

test('Compra de arma sem edinhos falha e deixa o estado intacto', () => {
  const r = newRun();
  r.setClass('netrunner');
  r.openShop();
  const before = JSON.stringify({ s: r.stats, w: r.weapons, e: r.equipped });
  assert.deepEqual(r.buyWeapon(0), { ok: false, reason: 'poor' });
  assert.equal(JSON.stringify({ s: r.stats, w: r.weapons, e: r.equipped }), before);
});

test('Compra de arma: só edinhos, sem humanidade, sem inflação, e já sai equipada', () => {
  const r = newRun(5);
  r.setClass('solo');
  r.openShop();
  r.stats.edinhos = 5000;
  r.implants = ['a', 'b', 'c', 'd']; // implantes encarecem implantes, nunca armas
  const w = r.shopWeapons[0]!;
  const res = r.buyWeapon(0);
  assert.ok(res.ok);
  assert.equal(r.stats.edinhos, 5000 - w.price);
  assert.equal(r.stats.humanity, START.humanity); // nenhum custo de humanidade
  assert.deepEqual(r.weapons, ['katana', w.id]);
  assert.equal(r.weaponId, w.id);
  assert.equal(r.shopWeapons[0], null);
  assert.deepEqual(r.buyWeapon(0), { ok: false, reason: 'empty' }); // não compra o mesmo slot duas vezes
});

test('Troca de arma: não troca com uma só e percorre todas em ciclo', () => {
  const r = newRun();
  r.setClass('techie');
  assert.equal(r.cycleWeapon(), false);
  assert.equal(r.weaponId, 'smart');
  r.weapons.push('pistol', 'smg');
  assert.ok(r.cycleWeapon());
  assert.equal(r.weaponId, 'pistol');
  assert.ok(r.cycleWeapon());
  assert.equal(r.weaponId, 'smg');
  assert.ok(r.cycleWeapon());
  assert.equal(r.weaponId, 'smart'); // volta ao início
});
