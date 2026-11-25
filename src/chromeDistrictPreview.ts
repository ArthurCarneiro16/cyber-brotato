export {};

type Character = 'neon' | 'current';
type Direction = 'baixo' | 'baixo-direita' | 'direita' | 'cima-direita' | 'cima' | 'cima-esquerda' | 'esquerda' | 'baixo-esquerda';

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento do preview não encontrado: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>('#preview');
const statusLabel = requiredElement<HTMLElement>('#status');
const errorLabel = requiredElement<HTMLElement>('#error');
const neonButton = requiredElement<HTMLButtonElement>('#neon-button');
const currentButton = requiredElement<HTMLButtonElement>('#current-button');
const canvasContext = canvas.getContext('2d');
if (!canvasContext) throw new Error('O navegador não disponibilizou Canvas 2D.');
const context: CanvasRenderingContext2D = canvasContext;

context.imageSmoothingEnabled = false;

const neonJack = new Image();
const currentEdgerunner = new Image();
neonJack.src = '/assets/preview/chrome-district/VX-0001_ortho_sheet.png';
currentEdgerunner.src = '/assets/characters/edgerunner/player-base.png';

const keys = new Set<string>();
let selected: Character = 'neon';
let x = canvas.width / 2;
let y = canvas.height / 2;
let facing = 0;
let frame = 0;
let animationTime = 0;
let previousTime = 0;
const footRows: number[][] = [];
let currentFootRow = 0;

const directionNames: Direction[] = [
  'baixo', 'baixo-direita', 'direita', 'cima-direita',
  'cima', 'cima-esquerda', 'esquerda', 'baixo-esquerda',
];

function selectCharacter(character: Character): void {
  selected = character;
  neonButton.setAttribute('aria-pressed', String(character === 'neon'));
  currentButton.setAttribute('aria-pressed', String(character === 'current'));
}

neonButton.addEventListener('click', () => selectCharacter('neon'));
currentButton.addEventListener('click', () => selectCharacter('current'));

window.addEventListener('keydown', (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd'].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
});
window.addEventListener('keyup', (event: KeyboardEvent) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

function drawArena(): void {
  context.fillStyle = '#0b111a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#17232d';
  context.lineWidth = 1;
  for (let gridX = 40; gridX < canvas.width; gridX += 40) {
    context.beginPath(); context.moveTo(gridX + 0.5, 0); context.lineTo(gridX + 0.5, canvas.height); context.stroke();
  }
  for (let gridY = 40; gridY < canvas.height; gridY += 40) {
    context.beginPath(); context.moveTo(0, gridY + 0.5); context.lineTo(canvas.width, gridY + 0.5); context.stroke();
  }
  context.strokeStyle = '#35515c';
  context.strokeRect(24.5, 24.5, canvas.width - 49, canvas.height - 49);
  context.fillStyle = '#1a3036';
  context.fillRect(x - 15, y + 2, 30, 5);
}

function drawCharacter(): void {
  const image = selected === 'neon' ? neonJack : currentEdgerunner;
  if (!image.complete || image.naturalWidth === 0) return;

  if (selected === 'neon') {
    const frameWidth = 56;
    const frameHeight = 84;
    const scale = 0.5;
    context.drawImage(
      image,
      frame * frameWidth, facing * frameHeight, frameWidth, frameHeight,
      Math.round(x - frameWidth * scale / 2), Math.round(y - (footRows[facing]?.[frame] ?? frameHeight - 1) * scale),
      frameWidth * scale, frameHeight * scale,
    );
  } else {
    const scale = 0.75;
    context.drawImage(
      image,
      Math.round(x - image.width * scale / 2), Math.round(y - currentFootRow * scale),
      image.width * scale, image.height * scale,
    );
  }
}

function findFootRow(image: HTMLImageElement, sourceX: number, sourceY: number, width: number, height: number): number {
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
  if (!scratchContext) return height;
  scratchContext.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
  const pixels = scratchContext.getImageData(0, 0, width, height).data;
  for (let row = height - 1; row >= 0; row--) {
    for (let column = 0; column < width; column++) {
      if (pixels[(row * width + column) * 4 + 3] > 0) return row + 1;
    }
  }
  return height;
}

function update(time: number): void {
  const elapsed = Math.min((time - previousTime) / 1000 || 0, 0.05);
  previousTime = time;

  let dx = Number(keys.has('d')) - Number(keys.has('a'));
  let dy = Number(keys.has('s')) - Number(keys.has('w'));
  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    x = Math.max(40, Math.min(canvas.width - 40, x + dx * 125 * elapsed));
    y = Math.max(45, Math.min(canvas.height - 25, y + dy * 125 * elapsed));
    facing = ((Math.round((Math.atan2(dx, dy) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
    animationTime += elapsed;
    if (animationTime >= 1 / 10) {
      frame = (frame + Math.floor(animationTime * 10)) % 6;
      animationTime %= 1 / 10;
    }
  } else {
    frame = 0;
  }

  drawArena();
  drawCharacter();
  const characterName = selected === 'neon' ? 'Neon Jack' : 'Edgerunner atual';
  const direction = moving ? directionNames[facing] : `${directionNames[facing]} (parado)`;
  statusLabel.textContent = `${characterName} · ${direction}`;
  requestAnimationFrame(update);
}

Promise.all([neonJack.decode(), currentEdgerunner.decode()])
  .then(() => {
    if (neonJack.naturalWidth !== 336 || neonJack.naturalHeight !== 672) {
      throw new Error(`Dimensão inesperada da sheet: ${neonJack.naturalWidth}×${neonJack.naturalHeight}.`);
    }
    for (let direction = 0; direction < 8; direction++) {
      footRows[direction] = [];
      for (let walkFrame = 0; walkFrame < 6; walkFrame++) {
        footRows[direction][walkFrame] = findFootRow(neonJack, walkFrame * 56, direction * 84, 56, 84);
      }
    }
    currentFootRow = findFootRow(currentEdgerunner, 0, 0, currentEdgerunner.width, currentEdgerunner.height);
    errorLabel.textContent = '';
    requestAnimationFrame(update);
  })
  .catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : 'Falha ao carregar as imagens do preview.';
    errorLabel.textContent = `Erro: ${message}`;
    statusLabel.textContent = 'Falha ao carregar';
  });
