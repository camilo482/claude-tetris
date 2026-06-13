'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#42A5F5', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // Nut - metallic grey
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayBests = document.getElementById('overlay-bests');
const playerNameInput = document.getElementById('player-name');
const highscoresSection = document.getElementById('highscores-section');
const restartBtn = document.getElementById('restart-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const themeToggle = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let comboRun, maxCombo;
let firstGame = true;
let cancelNameSave = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    comboRun++;
    if (comboRun > maxCombo) maxCombo = comboRun;
    updateHUD();
  } else {
    comboRun = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Highscores helpers ----

function loadHighscores() {
  try {
    return JSON.parse(localStorage.getItem('tetris-highscores') || '[]');
  } catch (_) {
    return [];
  }
}

function saveHighscores(list) {
  localStorage.setItem('tetris-highscores', JSON.stringify(list));
}

function renderHighscores(highlightIndex) {
  const list = loadHighscores();
  if (list.length === 0) {
    highscoresSection.innerHTML = '<p class="hs-empty">Sin records aún</p>';
    return;
  }
  let html = '<table class="hs-table"><thead><tr><th>#</th><th>Nombre</th><th>Score</th><th>Líneas</th><th>Combo</th></tr></thead><tbody>';
  list.forEach((entry, i) => {
    const cls = i === highlightIndex ? ' class="hs-highlight"' : '';
    html += `<tr${cls}><td>${i + 1}</td><td>${escapeHtml(entry.name)}</td><td>${entry.score.toLocaleString()}</td><td>${entry.lines}</td><td>${entry.combo}</td></tr>`;
  });
  html += '</tbody></table>';
  highscoresSection.innerHTML = html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function qualifiesForTop5(currentScore) {
  const list = loadHighscores();
  return list.length < 5 || currentScore >= list[list.length - 1].score;
}

function saveAndRenderScores(currentScore, currentLines, currentMaxCombo) {
  // Update all-time bests
  const bestCombo = Math.max(parseInt(localStorage.getItem('tetris-best-combo') || '0', 10), currentMaxCombo);
  const bestLines = Math.max(parseInt(localStorage.getItem('tetris-best-lines') || '0', 10), currentLines);
  localStorage.setItem('tetris-best-combo', bestCombo);
  localStorage.setItem('tetris-best-lines', bestLines);

  overlayBests.textContent = `Mejor combo: ${bestCombo} | Máx líneas: ${bestLines}`;

  if (qualifiesForTop5(currentScore)) {
    playerNameInput.classList.remove('hidden');
    playerNameInput.value = '';
    playerNameInput.focus();

    let saved = false;
    cancelNameSave = () => { saved = true; cancelNameSave = null; };

    function doSave() {
      if (saved) return;
      saved = true;
      cancelNameSave = null;
      const name = playerNameInput.value.trim() || 'Anónimo';
      playerNameInput.classList.add('hidden');
      const list = loadHighscores();
      const id = Date.now();
      list.push({ id, name, score: currentScore, lines: currentLines, combo: currentMaxCombo, date: new Date().toISOString().slice(0, 10) });
      list.sort((a, b) => b.score - a.score);
      const trimmed = list.slice(0, 5);
      saveHighscores(trimmed);
      const idx = trimmed.findIndex(e => e.id === id);
      renderHighscores(idx);
      resetRecordsBtn.classList.remove('hidden');
    }

    const blurHandler = function() {
      playerNameInput.removeEventListener('blur', blurHandler);
      doSave();
    };
    playerNameInput.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') {
        playerNameInput.removeEventListener('keydown', handler);
        playerNameInput.removeEventListener('blur', blurHandler);
        doSave();
      }
    });
    playerNameInput.addEventListener('blur', blurHandler);

    renderHighscores(-1);
  } else {
    renderHighscores(-1);
    resetRecordsBtn.classList.remove('hidden');
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  resetRecordsBtn.classList.add('hidden');
  saveAndRenderScores(score, lines, maxCombo);
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayBests.textContent = '';
    highscoresSection.innerHTML = '';
    resetRecordsBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  comboRun = 0;
  maxCombo = 0;
  firstGame = false;
  if (cancelNameSave) { cancelNameSave(); }
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  playerNameInput.classList.add('hidden');
  highscoresSection.innerHTML = '';
  overlayBests.textContent = '';
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  overlayTitle.textContent = 'TOP 5';
  overlayScore.textContent = '';
  overlayBests.textContent = '';
  playerNameInput.classList.add('hidden');
  const list = loadHighscores();
  if (list.length > 0) {
    resetRecordsBtn.classList.remove('hidden');
  } else {
    resetRecordsBtn.classList.add('hidden');
  }
  renderHighscores(-1);
  restartBtn.textContent = 'Jugar';
  overlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (firstGame) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  restartBtn.textContent = 'Reiniciar';
  init();
});

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem('tetris-highscores');
  renderHighscores(-1);
  resetRecordsBtn.classList.add('hidden');
});

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tetris-theme', theme);
});

(function initTheme() {
  const saved = localStorage.getItem('tetris-theme') || 'dark';
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggle.checked = true;
  }
})();

showStartScreen();
