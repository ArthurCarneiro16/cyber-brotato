import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = join(root, 'public', 'assets', 'characters', 'edgerunner');
const CELL_WIDTH = 32;
const CELL_HEIGHT = 48;
const DIRECTIONS = {
  idle: ['baixo', 'esquerda', 'direita', 'cima'],
  walk: ['baixo', 'baixo-esquerda', 'esquerda', 'cima-esquerda', 'cima', 'cima-direita', 'direita', 'baixo-direita'],
};
const SPECS = {
  idle: { file: 'idle.png', columns: 4, rows: 4 },
  walk: { file: 'walk.png', columns: 6, rows: 8 },
};
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

let failed = false;
const reportError = (message) => {
  failed = true;
  console.error(`ERRO: ${message}`);
};
const reportWarning = (message) => console.warn(`AVISO: ${message}`);

function readSample(row, sampleIndex, bitDepth) {
  if (bitDepth === 8) return row[sampleIndex];
  if (bitDepth === 16) return row.readUInt16BE(sampleIndex * 2);
  const bitOffset = sampleIndex * bitDepth;
  const shift = 8 - bitDepth - (bitOffset % 8);
  return (row[Math.floor(bitOffset / 8)] >> shift) & ((1 << bitDepth) - 1);
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(buffer, fileName) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${fileName}: assinatura PNG inválida ou arquivo truncado.`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  let ended = false;

  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`${fileName}: bloco PNG ${type} truncado.`);
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`${fileName}: cabeçalho IHDR inválido.`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw new Error(`${fileName}: método PNG de compressão/filtro não suportado.`);
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!ended || width === 0 || height === 0 || idat.length === 0) {
    throw new Error(`${fileName}: PNG sem IHDR/IDAT/IEND válido.`);
  }
  if (interlace !== 0) throw new Error(`${fileName}: PNG entrelaçado não é aceito pelo validador; exporte sem Adam7.`);
  const channels = CHANNELS.get(colorType);
  if (!channels) throw new Error(`${fileName}: tipo de cor PNG ${colorType} não suportado.`);
  const allowedDepths = colorType === 0 ? [1, 2, 4, 8, 16]
    : colorType === 3 ? [1, 2, 4, 8]
      : colorType === 2 ? [8, 16]
        : [8, 16];
  if (!allowedDepths.includes(bitDepth)) throw new Error(`${fileName}: profundidade ${bitDepth} incompatível com tipo de cor ${colorType}.`);
  if (colorType === 3 && (!palette || palette.length % 3 !== 0)) throw new Error(`${fileName}: PNG indexado sem paleta PLTE válida.`);

  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil(width * bitsPerPixel / 8);
  const inflated = inflateSync(Buffer.concat(idat));
  const expectedLength = height * (rowBytes + 1);
  if (inflated.length !== expectedLength) {
    throw new Error(`${fileName}: dados de pixels têm ${inflated.length} bytes; esperado ${expectedLength}.`);
  }

  const rows = [];
  let previous = Buffer.alloc(rowBytes);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[cursor++];
    const encoded = inflated.subarray(cursor, cursor + rowBytes);
    cursor += rowBytes;
    const row = Buffer.alloc(rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const above = previous[i];
      const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else throw new Error(`${fileName}: filtro PNG ${filter} inválido na linha ${y}.`);
      row[i] = (encoded[i] + predictor) & 0xff;
    }
    rows.push(row);
    previous = row;
  }

  const hasAlpha = colorType === 4 || colorType === 6 || transparency !== null;
  const maximumSample = bitDepth === 16 ? 65535 : (1 << bitDepth) - 1;
  function pixelAlpha(x, y) {
    const row = rows[y];
    const firstSample = x * channels;
    if (colorType === 6) return readSample(row, firstSample + 3, bitDepth);
    if (colorType === 4) return readSample(row, firstSample + 1, bitDepth);
    if (colorType === 3) {
      const index = readSample(row, x, bitDepth);
      return transparency && index < transparency.length ? transparency[index] : 255;
    }
    if (colorType === 0 && transparency?.length === 2) {
      return readSample(row, firstSample, bitDepth) === transparency.readUInt16BE(0) ? 0 : maximumSample;
    }
    if (colorType === 2 && transparency?.length === 6) {
      const same = readSample(row, firstSample, bitDepth) === transparency.readUInt16BE(0)
        && readSample(row, firstSample + 1, bitDepth) === transparency.readUInt16BE(2)
        && readSample(row, firstSample + 2, bitDepth) === transparency.readUInt16BE(4);
      return same ? 0 : maximumSample;
    }
    return maximumSample;
  }

  return { width, height, bitDepth, colorType, hasAlpha, rows, pixelAlpha };
}

function validateSheet(name, spec) {
  const filePath = join(assetRoot, spec.file);
  let file;
  try {
    file = readFileSync(filePath);
  } catch {
    reportError(`arquivo não encontrado: public/assets/characters/edgerunner/${spec.file}`);
    return null;
  }

  let png;
  try {
    png = decodePng(file, spec.file);
  } catch (error) {
    reportError(error instanceof Error ? error.message : `${spec.file}: erro ao decodificar PNG.`);
    return null;
  }

  const expectedWidth = spec.columns * CELL_WIDTH;
  const expectedHeight = spec.rows * CELL_HEIGHT;
  console.log(`${spec.file}: PNG ${png.width}×${png.height}, tipo de cor ${png.colorType}, ${png.bitDepth} bits.`);

  if (png.width !== expectedWidth || png.height !== expectedHeight) {
    reportError(`${spec.file}: dimensão ${png.width}×${png.height}; esperado exatamente ${expectedWidth}×${expectedHeight}.`);
  }
  if (png.width % CELL_WIDTH !== 0 || png.height % CELL_HEIGHT !== 0) {
    reportError(`${spec.file}: dimensões não divisíveis pelas células de ${CELL_WIDTH}×${CELL_HEIGHT}.`);
  }
  if (!png.hasAlpha) reportError(`${spec.file}: PNG sem canal alpha nem transparência tRNS.`);

  let transparentPixels = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.pixelAlpha(x, y) === 0) transparentPixels++;
    }
  }
  if (transparentPixels === 0) reportError(`${spec.file}: possui alpha, mas nenhum pixel totalmente transparente; verifique se o fundo foi exportado opaco.`);
  else console.log(`  Transparência: ${transparentPixels} pixels totalmente transparentes.`);

  const actualColumns = Math.floor(png.width / CELL_WIDTH);
  const actualRows = Math.floor(png.height / CELL_HEIGHT);
  console.log(`  Grade detectada: ${actualColumns} colunas × ${actualRows} linhas.`);
  for (let row = 0; row < Math.min(actualRows, spec.rows); row++) {
    for (let column = 0; column < Math.min(actualColumns, spec.columns); column++) {
      let hasVisiblePixel = false;
      let touchesEdge = false;
      const x0 = column * CELL_WIDTH;
      const y0 = row * CELL_HEIGHT;
      for (let y = 0; y < CELL_HEIGHT; y++) {
        for (let x = 0; x < CELL_WIDTH; x++) {
          if (png.pixelAlpha(x0 + x, y0 + y) > 0) {
            hasVisiblePixel = true;
            if (x === 0 || y === 0 || x === CELL_WIDTH - 1 || y === CELL_HEIGHT - 1) touchesEdge = true;
          }
        }
      }
      const direction = DIRECTIONS[name][row];
      const frameLabel = `${name}/${direction ?? `linha-${row + 1}`}/quadro-${column + 1}`;
      if (!hasVisiblePixel) reportError(`${spec.file}: quadro completamente vazio (${frameLabel}).`);
      if (touchesEdge) reportWarning(`${spec.file}: pixels encostam na borda da célula (${frameLabel}); verifique possível recorte.`);
    }
  }

  console.log(`  Grade esperada: ${spec.columns} colunas × ${spec.rows} linhas = ${spec.columns * spec.rows} quadros de ${CELL_WIDTH}×${CELL_HEIGHT}.`);
  return { columns: actualColumns, rows: actualRows };
}

async function validateSockets() {
  const path = join(assetRoot, 'sockets.json');
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log('sockets.json: ainda não fornecido (opcional até a arte/integração da arma).');
      return;
    }
    reportError(`sockets.json: JSON inválido (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    reportError('sockets.json: a raiz deve ser um objeto JSON.');
    return;
  }
  if (parsed.version !== 1 || parsed.frame?.width !== CELL_WIDTH || parsed.frame?.height !== CELL_HEIGHT || parsed.frame?.origin !== 'top-left') {
    reportError('sockets.json: esperado version 1 e frame 32×48 com origin "top-left".');
  }
  if (!parsed.animations || typeof parsed.animations !== 'object') {
    reportError('sockets.json: campo animations ausente ou inválido.');
    return;
  }

  for (const [animation, spec] of Object.entries(SPECS)) {
    const directions = parsed.animations[animation];
    if (!directions) {
      reportError(`sockets.json: animação "${animation}" ausente.`);
      continue;
    }
    for (const direction of DIRECTIONS[animation]) {
      const points = directions[direction];
      if (!Array.isArray(points) || points.length !== spec.columns) {
        reportError(`sockets.json: ${animation}/${direction} deve conter ${spec.columns} sockets na ordem dos quadros.`);
        continue;
      }
      points.forEach((point, index) => {
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > CELL_WIDTH || point.y < 0 || point.y > CELL_HEIGHT) {
          reportError(`sockets.json: socket inválido fora de 32×48 em ${animation}/${direction}/quadro-${index + 1}.`);
        }
      });
    }
  }
  console.log('sockets.json: estrutura e contagem de pontos verificadas.');
}

for (const [name, spec] of Object.entries(SPECS)) validateSheet(name, spec);
await validateSockets();
if (failed) {
  console.error('Validação reprovada. Corrija os erros acima antes de integrar as spritesheets.');
  process.exitCode = 1;
} else {
  console.log('Validação concluída sem erros.');
}
