// Simulador de balanceamento: joga a run inteira com bots usando as regras reais
// (src/rules/run.ts) e um MODELO DE COMBATE simplificado, sem física nem tela.
// Serve para comparar builds e achar quebras. Os números absolutos dependem das
// premissas abaixo, então leia como "mais forte / mais fraco", não como verdade.
import { IMPLANTS } from '../data/implants';
import type { Stats } from '../types';
import { Rng } from '../rules/rng';
import {
  Run,
  SPAWN_INTERVAL_MS,
  START,
  TOTAL_WAVES,
  WAVE_TIME,
  enemySpeed,
  enemyStats,
  ghostStats,
  powerScoreOf,
} from '../rules/run';

// ---- premissas do modelo (ajuste aqui se o jogo real divergir) ----
const DT = 0.1; // passo da simulação (s)
const SPAWN_DIST = 350; // distância média borda -> jogador (px)
const CONTACT_DIST = 20;
const IFRAME = 0.5; // s, igual ao jogo
const TELEGRAPH = 0.45; // s sem dano depois de nascer, igual ao jogo
const GHOST_DELAY = 3.5; // s depois do início da wave, igual ao jogo
const OVERTIME_CAP = 90; // s extras no máximo para derrubar o boss

type Bot = {
  name: string;
  accuracy: number; // fração dos tiros que acertam
  dodge: number; // chance de evitar um golpe de contato (kite)
  humanityFloor: number | null; // não compra se a humanidade ficar abaixo disto (null = ignora)
  pick: 'value' | 'expensive';
};

// Habilidade dos bots é PREMISSA, não medida: inimigos andam a ~65-105 px/s e a bala a 520 px/s,
// então um humano acerta a maioria dos tiros e foge da maior parte dos golpes.
const BOTS: Bot[] = [
  { name: 'fraco', accuracy: 0.65, dodge: 0.25, humanityFloor: 20, pick: 'value' },
  { name: 'médio', accuracy: 0.8, dodge: 0.5, humanityFloor: 15, pick: 'value' },
  { name: 'bom', accuracy: 0.9, dodge: 0.7, humanityFloor: 15, pick: 'value' },
  { name: 'descuidado', accuracy: 0.8, dodge: 0.5, humanityFloor: null, pick: 'expensive' },
];

type SimEnemy = { hp: number; dmg: number; mul: number; reward: number; dist: number; born: number; ghost: boolean };
type WaveOutcome = 'ok' | 'dead' | 'timeout';

function fightWave(run: Run, bot: Bot, rng: Rng): WaveOutcome {
  const enemies: SimEnemy[] = [];
  let t = 0;
  let spawnAcc = 0;
  let shotAcc = 0;
  let iframeUntil = -1;
  let ghostSpawned = false;

  for (;;) {
    const status = run.waveStatus(WAVE_TIME - t);
    if (status === 'done') return 'ok';
    if (t > WAVE_TIME + OVERTIME_CAP) return 'timeout';

    spawnAcc += DT * 1000;
    while (spawnAcc >= SPAWN_INTERVAL_MS) {
      spawnAcc -= SPAWN_INTERVAL_MS;
      const type = run.pickEnemyType();
      const s = enemyStats(type, run.wave);
      enemies.push({ hp: s.hp, dmg: s.dmg, mul: s.mul, reward: s.reward, dist: SPAWN_DIST, born: t, ghost: false });
    }
    if (!ghostSpawned && run.ghostWave === run.wave && t >= GHOST_DELAY) {
      ghostSpawned = true;
      const g = ghostStats(run.ghost, run.ghostRole, run.wave);
      enemies.push({ hp: g.hp, dmg: g.dmg, mul: g.mul, reward: g.reward, dist: SPAWN_DIST, born: t + 0.35, ghost: true });
    }

    // movimento
    const base = enemySpeed(run.wave, run.stats.enemySlow);
    for (const e of enemies) e.dist = Math.max(CONTACT_DIST, e.dist - base * e.mul * DT);

    // tiros: cada um acerta o inimigo mais próximo
    shotAcc += (1000 / run.stats.fireDelay) * bot.accuracy * DT;
    while (shotAcc >= 1 && enemies.length > 0) {
      shotAcc -= 1;
      let ni = 0;
      for (let i = 1; i < enemies.length; i++) if (enemies[i].dist < enemies[ni].dist) ni = i;
      const target = enemies[ni];
      target.hp -= run.stats.damage;
      if (target.hp <= 0) {
        run.stats.edinhos += target.reward;
        if (target.ghost) run.ghostDefeated = true;
        enemies.splice(ni, 1);
      }
    }
    if (enemies.length === 0) shotAcc = Math.min(shotAcc, 1); // sem alvo, não acumula tiros

    // contato: no máximo um golpe por janela de invulnerabilidade
    if (t >= iframeUntil) {
      const hitter = enemies.find((e) => e.dist <= CONTACT_DIST && t - e.born >= TELEGRAPH);
      if (hitter) {
        iframeUntil = t + IFRAME;
        // mais velocidade de movimento = mais fácil fugir (200 px/s é a base)
        const dodge = 1 - (1 - bot.dodge) * (START.speed / run.stats.speed);
        if (!rng.chance(dodge) && run.hurt(hitter.dmg)) return 'dead';
      }
    }
    t += DT;
  }
}

/**
 * Valor de combate estimado de uma build: tiros/s x dano útil (dano acima da vida média do inimigo
 * é desperdício) x raiz da vida x folga de movimento x lentidão dos inimigos.
 */
function combatValue(s: Stats, wave: number): number {
  const avgEnemyHp = 1 + Math.floor(wave / 2) + 0.5;
  const dps = (1000 / s.fireDelay) * Math.min(s.damage, avgEnemyHp);
  return dps * Math.sqrt(s.maxHp) * Math.sqrt(s.speed / START.speed) * (1 / s.enemySlow);
}

/** escolhe o índice da loja a comprar, ou null */
function choosePurchase(run: Run, bot: Bot): number | null {
  let best: { i: number; score: number } | null = null;
  run.shopItems.forEach((imp, i) => {
    if (!imp) return;
    const price = run.priceOf(imp);
    if (run.stats.edinhos < price) return;
    if (bot.humanityFloor !== null && run.stats.humanity - imp.humanity < bot.humanityFloor) return;
    const after = { ...run.stats };
    imp.apply(after);
    const gain = combatValue(after, run.wave) - combatValue(run.stats, run.wave);
    const score = bot.pick === 'value' ? gain / imp.humanity : price; // descuidado: o mais caro
    if (!best || score > best.score) best = { i, score };
  });
  return best ? (best as { i: number }).i : null;
}

type RunResult = {
  outcome: 'win' | 'dead' | 'psycho' | 'timeout';
  wave: number;
  implants: string[];
  power: number;
  ghostRole: string;
};

function simulate(seed: number, bot: Bot): RunResult {
  const run = new Run(seed, []);
  const rng = new Rng(seed ^ 0x1234abcd); // sorteios do bot (esquiva)
  const done = (outcome: RunResult['outcome']): RunResult => ({
    outcome,
    wave: run.wave,
    implants: run.implants,
    power: run.powerScore(),
    ghostRole: run.ghostRole,
  });

  for (let w = 1; w <= TOTAL_WAVES; w++) {
    run.wave = w;
    const out = fightWave(run, bot, rng);
    if (out === 'dead') return done('dead');
    if (out === 'timeout') return done('timeout');
    if (w === TOTAL_WAVES) return done('win');
    run.openShop();
    for (;;) {
      const i = choosePurchase(run, bot);
      if (i === null) break;
      const res = run.buy(i);
      if (res.ok && res.psycho) return done('psycho');
    }
  }
  return done('win');
}

// ---------- relatório ----------
const N = Number(process.argv[2]) || 400;
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`.padStart(4);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`Simulação: ${N} runs por bot (seeds 1..${N}), modelo de combate simplificado\n`);
console.log('bot         vitória  morte  ciberpsic  timeout | onda média  implantes  poder final');
const byBot = new Map<string, RunResult[]>();
for (const bot of BOTS) {
  const rs = Array.from({ length: N }, (_, i) => simulate(i + 1, bot));
  byBot.set(bot.name, rs);
  const c = (o: RunResult['outcome']) => rs.filter((r) => r.outcome === o).length;
  console.log(
    `${bot.name.padEnd(11)} ${pct(c('win'), N)}    ${pct(c('dead'), N)}   ${pct(c('psycho'), N)}      ${pct(c('timeout'), N)}   |` +
      `   ${avg(rs.map((r) => r.wave)).toFixed(1).padStart(4)}      ${avg(rs.map((r) => r.implants.length)).toFixed(1).padStart(4)}       ` +
      `${avg(rs.map((r) => r.power)).toFixed(0).padStart(5)}`,
  );
}

console.log('\nOnde cada bot morre (contagem por wave, só mortes por HP):');
for (const bot of BOTS) {
  const rs = byBot.get(bot.name)!.filter((r) => r.outcome === 'dead' || r.outcome === 'timeout');
  const row = Array.from({ length: TOTAL_WAVES }, (_, i) => rs.filter((r) => r.wave === i + 1).length);
  console.log(`  ${bot.name.padEnd(11)} ${row.map((n, i) => `W${i + 1}:${String(n).padStart(3)}`).join('  ')}`);
}

// o fantasma só nasce de ciberpsicose: que poder ele teria?
const psychos = [...byBot.values()].flat().filter((r) => r.outcome === 'psycho');
if (psychos.length > 0) {
  const p = psychos.map((r) => r.power).sort((a, b) => a - b);
  const q = (f: number) => p[Math.min(p.length - 1, Math.floor(f * p.length))];
  const low = p.filter((x) => x < 650).length;
  const mid = p.filter((x) => x >= 650 && x < 950).length;
  const high = p.filter((x) => x >= 950).length;
  console.log(`\nFantasmas gerados (${psychos.length} ciberpsicoses): poder mín ${p[0]}  mediana ${q(0.5)}  máx ${p[p.length - 1]}`);
  console.log(`  faixas de papel: <650 (15% boss): ${low}   650-949 (40% boss): ${mid}   >=950 (75% boss): ${high}`);
} else {
  console.log('\nNenhuma ciberpsicose na simulação: nenhum fantasma novo seria gerado.');
}

// quais implantes aparecem nas runs vencedoras do bot médio
const medio = byBot.get('médio')!;
console.log('\nImplantes (bot médio): runs que compraram / taxa de vitória dessas runs (vitória geral ' + pct(medio.filter((r) => r.outcome === 'win').length, N).trim() + ')');
for (const imp of IMPLANTS) {
  const owners = medio.filter((r) => r.implants.includes(imp.name));
  const wins = owners.filter((r) => r.outcome === 'win').length;
  console.log(`  ${imp.name.padEnd(20)} ${String(owners.length).padStart(4)} runs   ${owners.length ? pct(wins, owners.length) : '  - '}`);
}
