const DIRECTIONS = [
  { name: "U", row: -1, col: 0 },
  { name: "R", row: 0, col: 1 },
  { name: "D", row: 1, col: 0 },
  { name: "L", row: 0, col: -1 },
];

const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    subtitle: "A clean warm-up",
    density: 0.16,
    boulders: 1,
    minPushes: 1,
    scoreBand: [20, 52],
    accent: "mint",
  },
  {
    id: "medium",
    label: "Medium",
    subtitle: "Read the rhythm",
    density: 0.23,
    boulders: 2,
    minPushes: 1,
    scoreBand: [53, 78],
    accent: "gold",
  },
  {
    id: "hard",
    label: "Hard",
    subtitle: "Think two slides ahead",
    density: 0.3,
    boulders: 3,
    minPushes: 1,
    scoreBand: [70, 100],
    accent: "coral",
  },
];

let refreshIndex = 0;

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function cellIndex(row, col, size) {
  return row * size + col;
}

function coordinates(index, size) {
  return [Math.floor(index / size), index % size];
}

function createCandidate(random, difficulty, size) {
  const cells = Array.from({ length: size * size }, () => ".");

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const isBoundary =
        row === 0 || col === 0 || row === size - 1 || col === size - 1;
      if (isBoundary || random() < difficulty.density) {
        cells[cellIndex(row, col, size)] = "#";
      }
    }
  }

  const openPositions = () =>
    cells.reduce((positions, tile, index) => {
      if (tile === ".") positions.push(index);
      return positions;
    }, []);
  const choosePosition = (positions) =>
    positions.splice(Math.floor(random() * positions.length), 1)[0];
  const availablePositions = openPositions();
  const start = choosePosition(availablePositions);
  const goal = choosePosition(availablePositions);
  cells[start] = "S";
  cells[goal] = "G";
  const boulders = [];
  while (boulders.length < difficulty.boulders) {
    const position = choosePosition(availablePositions);
    if (position === undefined) break;
    boulders.push(position);
  }
  const stars = [];
  while (stars.length < 3) {
    const position = choosePosition(availablePositions);
    if (position === undefined) break;
    stars.push(position);
  }
  return { cells, start, goal, boulders, stars };
}

function slide(board, position, direction, size) {
  const [startRow, startCol] = coordinates(position, size);
  let row = startRow + direction.row;
  let col = startCol + direction.col;
  let next = position;

  while (
    row >= 0 &&
    row < size &&
    col >= 0 &&
    col < size &&
    board[cellIndex(row, col, size)] !== "#"
  ) {
    next = cellIndex(row, col, size);
    row += direction.row;
    col += direction.col;
  }

  return next;
}

function stateKey(state) {
  return `${state.position}|${[...state.boulders].sort((a, b) => a - b).join(",")}|${state.starsMask}`;
}

function pathBetween(from, to, direction, size) {
  const [fromRow, fromCol] = coordinates(from, size);
  const path = [];
  let row = fromRow + direction.row;
  let col = fromCol + direction.col;
  while (row >= 0 && row < size && col >= 0 && col < size) {
    const position = cellIndex(row, col, size);
    path.push(position);
    if (position === to) break;
    row += direction.row;
    col += direction.col;
  }
  return path;
}

function collectAlongPath(stars, starsMask, from, to, direction, size) {
  let mask = starsMask;
  for (const position of pathBetween(from, to, direction, size)) {
    const starIndex = stars.indexOf(position);
    if (starIndex >= 0) mask |= 1 << starIndex;
  }
  return mask;
}

function moveState(board, state, direction, size, stars) {
  const boulderSet = new Set(state.boulders);
  const [startRow, startCol] = coordinates(state.position, size);
  let row = startRow + direction.row;
  let col = startCol + direction.col;
  let playerPosition = state.position;

  while (row >= 0 && row < size && col >= 0 && col < size) {
    const next = cellIndex(row, col, size);
    if (board[next] === "#")
      return playerPosition === state.position
        ? null
        : {
            position: playerPosition,
            path: pathBetween(state.position, playerPosition, direction, size),
            boulders: state.boulders,
            starsMask: collectAlongPath(
              stars,
              state.starsMask,
              state.position,
              playerPosition,
              direction,
              size,
            ),
            pushed: false,
          };
    if (boulderSet.has(next)) {
      const chain = [];
      let chainRow = row;
      let chainCol = col;
      while (
        chainRow >= 0 &&
        chainRow < size &&
        chainCol >= 0 &&
        chainCol < size
      ) {
        const chainPosition = cellIndex(chainRow, chainCol, size);
        if (board[chainPosition] === "#") break;
        if (boulderSet.has(chainPosition)) chain.push(chainPosition);
        chainRow += direction.row;
        chainCol += direction.col;
      }

      const occupied = new Set(state.boulders);
      const movedBoulders = new Map();
      for (
        let chainIndex = chain.length - 1;
        chainIndex >= 0;
        chainIndex -= 1
      ) {
        const originalPosition = chain[chainIndex];
        const [boulderStartRow, boulderStartCol] = coordinates(
          originalPosition,
          size,
        );
        occupied.delete(originalPosition);
        let boulderRow = boulderStartRow + direction.row;
        let boulderCol = boulderStartCol + direction.col;
        let boulderPosition = originalPosition;
        while (
          boulderRow >= 0 &&
          boulderRow < size &&
          boulderCol >= 0 &&
          boulderCol < size
        ) {
          const nextBoulderPosition = cellIndex(boulderRow, boulderCol, size);
          if (
            board[nextBoulderPosition] === "#" ||
            occupied.has(nextBoulderPosition)
          )
            break;
          boulderPosition = nextBoulderPosition;
          boulderRow += direction.row;
          boulderCol += direction.col;
        }
        if (boulderPosition === originalPosition) {
          return playerPosition === state.position
            ? null
            : {
                position: playerPosition,
                path: pathBetween(
                  state.position,
                  playerPosition,
                  direction,
                  size,
                ),
                boulders: state.boulders,
                starsMask: collectAlongPath(
                  stars,
                  state.starsMask,
                  state.position,
                  playerPosition,
                  direction,
                  size,
                ),
                pushed: false,
              };
        }
        occupied.add(boulderPosition);
        movedBoulders.set(originalPosition, boulderPosition);
      }

      if (chain.length === 0) {
        return playerPosition === state.position
          ? null
          : {
              position: playerPosition,
              path: pathBetween(
                state.position,
                playerPosition,
                direction,
                size,
              ),
              boulders: state.boulders,
              starsMask: collectAlongPath(
                stars,
                state.starsMask,
                state.position,
                playerPosition,
                direction,
                size,
              ),
              pushed: false,
            };
      }
      const boulders = state.boulders.map(
        (boulder) => movedBoulders.get(boulder) || boulder,
      );
      const movedBoulderSet = new Set(boulders);
      let followRow = startRow + direction.row;
      let followCol = startCol + direction.col;
      let followPosition = state.position;
      while (
        followRow >= 0 &&
        followRow < size &&
        followCol >= 0 &&
        followCol < size
      ) {
        const followNext = cellIndex(followRow, followCol, size);
        if (board[followNext] === "#" || movedBoulderSet.has(followNext)) break;
        followPosition = followNext;
        followRow += direction.row;
        followCol += direction.col;
      }
      return {
        position: followPosition,
        path: pathBetween(state.position, followPosition, direction, size),
        boulders,
        starsMask: collectAlongPath(
          stars,
          state.starsMask,
          state.position,
          followPosition,
          direction,
          size,
        ),
        pushed: true,
      };
    }
    playerPosition = next;
    row += direction.row;
    col += direction.col;
  }

  return playerPosition === state.position
    ? null
    : {
        position: playerPosition,
        path: pathBetween(state.position, playerPosition, direction, size),
        boulders: state.boulders,
        starsMask: collectAlongPath(
          stars,
          state.starsMask,
          state.position,
          playerPosition,
          direction,
          size,
        ),
        pushed: false,
      };
}

function solve(board, start, goal, size, initialBoulders, stars) {
  const initialState = {
    position: start,
    boulders: initialBoulders,
    starsMask: 0,
  };
  const initialKey = stateKey(initialState);
  const queue = [initialKey];
  const states = new Map([[initialKey, initialState]]);
  const previous = new Map([[initialKey, null]]);
  const moveTaken = new Map();
  const pushTaken = new Map();
  let exploredEdges = 0;
  let deadEnds = 0;
  let cursor = 0;

  while (cursor < queue.length) {
    const currentKey = queue[cursor];
    cursor += 1;
    const currentState = states.get(currentKey);
    if (
      currentState.position === goal &&
      currentState.starsMask === (1 << stars.length) - 1
    )
      break;

    let legalMoves = 0;
    for (const direction of DIRECTIONS) {
      const nextState = moveState(board, currentState, direction, size, stars);
      if (nextState) {
        legalMoves += 1;
        exploredEdges += 1;
        const nextKey = stateKey(nextState);
        if (!previous.has(nextKey)) {
          previous.set(nextKey, currentKey);
          states.set(nextKey, nextState);
          moveTaken.set(nextKey, direction.name);
          pushTaken.set(nextKey, nextState.pushed);
          queue.push(nextKey);
        }
      }
    }
    if (legalMoves === 0) deadEnds += 1;
  }

  const goalKey = queue.find(
    (key) =>
      states.get(key).position === goal &&
      states.get(key).starsMask === (1 << stars.length) - 1,
  );
  if (!goalKey) return null;

  const route = [];
  let pushes = 0;
  let currentKey = goalKey;
  while (currentKey !== initialKey) {
    route.unshift(moveTaken.get(currentKey));
    if (pushTaken.get(currentKey)) pushes += 1;
    currentKey = previous.get(currentKey);
  }

  const reachableStates = previous.size;
  const averageBranching = exploredEdges / reachableStates;
  const routeStates = route.length + 1;
  const alternateStates = Math.max(0, reachableStates - routeStates);
  return {
    route,
    pushes,
    explored: reachableStates,
    deadEnds,
    averageBranching,
    alternateStates,
  };
}

function calculateDifficulty(solution, board, size, boulders, starCount) {
  const wallCount = board.filter((tile) => tile === "#").length;
  const routeScore =
    Math.min(solution.route.length / Math.max(10, size), 1) * 35;
  const searchScore =
    Math.min(solution.explored / (size * size * 0.35 * (1 << starCount)), 1) *
    30;
  const branchScore =
    Math.min(Math.max(solution.averageBranching - 1, 0) / 1.5, 1) * 20;
  const deadEndScore =
    Math.min(solution.deadEnds / Math.max(2, solution.explored * 0.25), 1) * 10;
  const wallScore = (wallCount / board.length) * 5;
  const boulderScore = Math.min(boulders.length / 3, 1) * 15;
  const pushScore = Math.min(solution.pushes / 3, 1) * 10;
  return Math.round(
    routeScore +
      searchScore +
      branchScore +
      deadEndScore +
      wallScore +
      boulderScore +
      pushScore,
  );
}

function generatePuzzle(dateKey, difficulty, size) {
  const random = createRandom(hashSeed(`${dateKey}:${difficulty.id}`));
  let best = null;

  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const candidate = createCandidate(random, difficulty, size);
    const solution = solve(
      candidate.cells,
      candidate.start,
      candidate.goal,
      size,
      candidate.boulders,
      candidate.stars,
    );
    if (!solution) continue;
    if (solution.pushes < difficulty.minPushes) continue;

    const difficultyScore = calculateDifficulty(
      solution,
      candidate.cells,
      size,
      candidate.boulders,
      candidate.stars.length,
    );
    const isIdeal =
      difficultyScore >= difficulty.scoreBand[0] &&
      difficultyScore <= difficulty.scoreBand[1];
    const score = isIdeal
      ? 10000 + difficultyScore
      : Math.max(
          0,
          1000 - Math.abs(difficultyScore - difficulty.scoreBand[0]) * 30,
        );
    if (!best || score > best.score) {
      best = { ...candidate, solution, difficultyScore, score, attempt };
    }
    if (isIdeal && attempt > 30) break;
  }

  if (!best) throw new Error(`Could not generate ${difficulty.label} puzzle`);
  return { ...best, size };
}

function todayKey() {
  const now = new Date();
  return now.toLocaleDateString("en-CA");
}

function tileClass(tile) {
  return tile === "#"
    ? "wall"
    : tile === "G"
      ? "goal"
      : tile === "S"
        ? "start"
        : "ice";
}

function renderBoard(
  puzzle,
  playerPosition,
  starsMask = 0,
  className = "",
  heatmap = null,
  showHeatmap = false,
) {
  const maxHeat = heatmap ? Math.max(1, ...Object.values(heatmap)) : 1;
  return `<div class="tile-board ${className}" style="--board-size: ${puzzle.size}" aria-label="${puzzle.size} by ${puzzle.size} ice puzzle">
    ${puzzle.cells
      .map((tile, index) => {
        const heat = heatmap?.[index] || 0;
        const heatStyle =
          showHeatmap && heat
            ? ` style="--heat-opacity: ${Math.max(0.12, (heat / maxHeat) * 0.82)}"`
            : "";
        return `<div class="tile ${tileClass(tile)}${showHeatmap && heat ? " heat" : ""}${puzzle.boulders.includes(index) ? " has-boulder" : ""}" data-position="${index}"${heatStyle}>${tile === "G" ? '<span class="goal-mark" aria-hidden="true"></span>' : ""}${puzzle.stars.includes(index) && !(starsMask & (1 << puzzle.stars.indexOf(index))) ? '<span class="star" aria-label="Star"></span>' : ""}${puzzle.boulders.includes(index) ? '<span class="boulder" aria-label="Boulder"></span>' : ""}${index === playerPosition ? '<span class="player" aria-label="Player"></span>' : ""}</div>`;
      })
      .join("")}
  </div>`;
}

function puzzleCard(puzzle, difficulty, puzzleId) {
  return `
    <article class="puzzle-card ${difficulty.accent}" data-puzzle-id="${puzzleId}" role="button" tabindex="0" aria-label="Play ${difficulty.label} puzzle">
      <div class="card-heading">
        <div>
          <p class="eyebrow">${difficulty.label} / ${String(puzzle.difficultyScore).padStart(2, "0")} difficulty</p>
          <h2>${difficulty.subtitle}</h2>
        </div>
        <span class="difficulty-mark" aria-hidden="true">${difficulty.label[0]}</span>
      </div>
      <div class="preview-frame">
        ${renderBoard(puzzle, puzzle.start, 0, "preview-board")}
      </div>
      <div class="metrics" aria-label="Puzzle metrics">
        <div><strong>${puzzle.difficultyScore}</strong><span>difficulty</span></div>
        <div><strong>${puzzle.solution.route.length}</strong><span>slides</span></div>
        <div><strong>${puzzle.solution.explored}</strong><span>states checked</span></div>
        <div><strong>${puzzle.stars.length}</strong><span>stars</span></div>
      </div>
    </article>
  `;
}

function modalMarkup() {
  return `<div class="modal-backdrop" hidden>
    <section class="game-modal" role="dialog" aria-modal="true" aria-labelledby="game-title">
      <button class="close-game" type="button" aria-label="Close puzzle">×</button>
      <div class="game-topline"><span class="eyebrow" id="game-difficulty"></span><span class="key-hint">ARROW KEYS TO SLIDE / PUSH</span></div>
      <h2 id="game-title"></h2>
      <div class="perfect-banner" id="perfect-banner" hidden>PERFECT</div>
      <div class="game-layout">
        <div class="game-board-wrap" id="game-board"></div>
        <aside class="game-info">
          <div class="game-status" id="game-status">Find the goal.</div>
          <div class="star-progress"><strong id="star-count">0 / 3</strong><span>stars collected</span></div>
          <div class="move-count"><strong id="move-count">0</strong><span>moves</span></div>
          <div class="reset-count"><strong id="reset-count">0</strong><span>resets</span></div>
          <div class="elapsed-time"><strong id="elapsed-time">00:00</strong><span>time</span></div>
          <button class="end-game" id="end-game" type="button" disabled>End puzzle</button>
          <button class="copy-heatmap" id="copy-heatmap" type="button" aria-label="Copy movement heatmap as image" title="Copy movement heatmap as image" hidden>⧉</button>
          <div class="goal-copy"><span class="legend-dot star-legend"></span><span>Collect all three stars.</span></div>
          <div class="goal-copy"><span class="legend-dot goal-legend"></span><span>Reach the glowing goal.</span></div>
          <div class="goal-copy"><span class="legend-dot wall-legend"></span><span>Walls stop your slide.</span></div>
          <div class="goal-copy"><span class="legend-dot boulder-legend"></span><span>Boulders slide when pushed.</span></div>
          <button class="reset-game" type="button">Reset position</button>
        </aside>
      </div>
    </section>
  </div>`;
}

function render() {
  const dateKey = todayKey();
  const seedKey = `${dateKey}:${refreshIndex}`;
  const puzzles = DIFFICULTIES.map((difficulty) => {
    const size = 9;
    return { difficulty, puzzle: generatePuzzle(seedKey, difficulty, size) };
  });
  document.querySelector("#app").innerHTML = `
    <main class="page-shell">
      <header class="hero">
        <div class="brand-lockup"><span class="brand-dot"></span><span>FROSTLINE / DAILY</span><button class="refresh-puzzles" id="refresh-puzzles" type="button" aria-label="Generate fresh puzzles" title="Generate fresh puzzles">↻</button></div>
        <div class="date-chip"><span class="status-dot"></span> ${dateKey} <span class="live-label">LIVE SEED</span></div>
        <div class="hero-copy">
          <p class="eyebrow">Three routes. One frozen board.</p>
          <h1>Find your way<br /><em>across the ice.</em></h1>
          <p class="lede">A fresh set of 9x9 sliding puzzles, generated once each day. Every route is solvable. The shortest path is waiting in the walls.</p>
        </div>
        <div class="rule-strip"><span>01 / SLIDE</span><span>02 / STOP</span><span>03 / SOLVE</span></div>
      </header>
      <section class="puzzles" aria-labelledby="daily-heading">
        <div class="section-intro"><div><p class="eyebrow">Today's set</p><h2 id="daily-heading">Choose your temperature.</h2></div><p class="section-note">The generator uses the date as its seed, so everyone gets the same three boards.</p></div>
        <div class="puzzle-grid">${puzzles.map(({ puzzle, difficulty }, index) => puzzleCard(puzzle, difficulty, index)).join("")}</div>
      </section>
      <footer class="footer"><span>FROSTLINE ENGINE 0.1</span><span>9 × 9 / BFS VERIFIED</span><span>NEW BOARDS AT MIDNIGHT</span></footer>
    </main>
    ${modalMarkup()}
  `;

  const modal = document.querySelector(".modal-backdrop");
  const gameBoard = document.querySelector("#game-board");
  let activeGame = null;

  function formatElapsed(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  function updateTimer() {
    if (!activeGame) return;
    const elapsed = activeGame.finishedAt
      ? activeGame.finishedAt - activeGame.startedAt
      : Date.now() - activeGame.startedAt;
    document.querySelector("#elapsed-time").textContent =
      formatElapsed(elapsed);
  }

  document.querySelector("#refresh-puzzles").addEventListener("click", () => {
    refreshIndex += 1;
    render();
  });

  function updateGame() {
    const { puzzle, difficulty, position, moves, won } = activeGame;
    const collectedStars =
      activeGame.starsMask.toString(2).split("1").length - 1;
    const finished = activeGame.won || activeGame.ended;
    const atGoal = position === puzzle.goal;
    document.querySelector("#game-difficulty").textContent = difficulty.label;
    document.querySelector("#game-title").textContent = difficulty.subtitle;
    document.querySelector("#move-count").textContent = moves;
    document.querySelector("#reset-count").textContent = activeGame.resets;
    document.querySelector("#star-count").textContent =
      `${collectedStars} / ${puzzle.stars.length}`;
    updateTimer();
    document.querySelector("#game-status").textContent = activeGame.won
      ? `Solved with ${collectedStars} / ${puzzle.stars.length} stars.`
      : activeGame.ended
        ? `Ended with ${collectedStars} / ${puzzle.stars.length} stars.`
        : `${collectedStars} / ${puzzle.stars.length} stars collected.`;
    document.querySelector("#end-game").disabled =
      finished || !atGoal || collectedStars === 0;
    document.querySelector("#copy-heatmap").hidden = !finished;
    document.querySelector("#perfect-banner").hidden = !activeGame.perfect;
    document.querySelector(".game-modal").classList.toggle("won", finished);
    document.querySelector(".game-modal").classList.toggle("perfect", activeGame.perfect);
    gameBoard.innerHTML = renderBoard(
      { ...puzzle, boulders: activeGame.boulders },
      position,
      activeGame.starsMask,
      "play-board",
      activeGame.heatmap,
      finished,
    );
  }

  function openGame(index) {
    const selected = puzzles[index];
    activeGame = {
      ...selected,
      boulders: [...selected.puzzle.boulders],
      starsMask: 0,
      heatmap: { [selected.puzzle.start]: 1 },
      position: selected.puzzle.start,
      moves: 0,
      resets: 0,
      won: false,
      ended: false,
      perfect: false,
      startedAt: Date.now(),
      finishedAt: null,
      timerId: null,
    };
    activeGame.timerId = window.setInterval(updateTimer, 1000);
    updateGame();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.querySelector(".close-game").focus();
  }

  function closeGame() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (activeGame?.timerId) window.clearInterval(activeGame.timerId);
    activeGame = null;
  }

  function handleMove(directionName) {
    if (!activeGame || activeGame.won || activeGame.ended) return;
    const direction = DIRECTIONS.find(({ name }) => name === directionName);
    const next = moveState(
      activeGame.puzzle.cells,
      {
        position: activeGame.position,
        boulders: activeGame.boulders,
        starsMask: activeGame.starsMask,
      },
      direction,
      activeGame.puzzle.size,
      activeGame.puzzle.stars,
    );
    if (!next) return;
    activeGame.position = next.position;
    activeGame.boulders = next.boulders;
    activeGame.starsMask = next.starsMask;
    next.path.forEach((position) => {
      activeGame.heatmap[position] = (activeGame.heatmap[position] || 0) + 1;
    });
    activeGame.moves += 1;
    activeGame.won =
      next.position === activeGame.puzzle.goal &&
      next.starsMask === (1 << activeGame.puzzle.stars.length) - 1;
    if (activeGame.won) {
      activeGame.perfect = activeGame.moves <= activeGame.puzzle.solution.route.length;
      activeGame.finishedAt = Date.now();
      window.clearInterval(activeGame.timerId);
      activeGame.timerId = null;
    }
    updateGame();
  }

  async function copyHeatmap() {
    const { puzzle, heatmap } = activeGame;
    const cellSize = 48;
    const headerHeight = 88;
    const footerHeight = 48;
    const canvas = document.createElement("canvas");
    canvas.width = puzzle.size * cellSize;
    canvas.height = headerHeight + puzzle.size * cellSize + footerHeight;
    const context = canvas.getContext("2d");
    const maxHeat = Math.max(1, ...Object.values(heatmap));
    context.fillStyle = "#07121d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const elapsed = activeGame.finishedAt
      ? activeGame.finishedAt - activeGame.startedAt
      : Date.now() - activeGame.startedAt;
    const collectedStars = activeGame.starsMask.toString(2).split("1").length - 1;
    context.fillStyle = "#e7f1f2";
    context.font = "600 22px sans-serif";
    context.fillText(activeGame.won ? "FROSTLINE / SOLVED" : "FROSTLINE / ENDED EARLY", 18, 30);
    context.fillStyle = "#8ca3a8";
    context.font = "500 13px monospace";
    context.fillText(`STARS ${collectedStars}/${puzzle.stars.length}   MOVES ${activeGame.moves}   RESETS ${activeGame.resets}   TIME ${formatElapsed(elapsed)}`, 18, 58);
    puzzle.cells.forEach((tile, index) => {
      const row = Math.floor(index / puzzle.size);
      const col = index % puzzle.size;
      const x = col * cellSize;
      const y = headerHeight + row * cellSize;
      context.fillStyle =
        tile === "#" ? "#20384b" : tile === "G" ? "#f0bd73" : "#8bd9d2";
      context.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      if (heatmap[index]) {
        context.fillStyle = `rgba(241, 136, 120, ${Math.max(0.12, (heatmap[index] / maxHeat) * 0.82)})`;
        context.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
      context.strokeStyle = "rgba(7, 18, 29, .35)";
      context.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    });
    if (activeGame.perfect) {
      const centerX = canvas.width / 2;
      const centerY = headerHeight + (puzzle.size * cellSize) / 2;
      context.textAlign = "center";
      context.font = `900 ${Math.min(72, canvas.width / 5)}px sans-serif`;
      context.lineWidth = 8;
      context.strokeStyle = "rgba(7, 18, 29, .88)";
      context.strokeText("PERFECT", centerX, centerY);
      context.fillStyle = "#fff3ad";
      context.fillText("PERFECT", centerX, centerY);
      context.textAlign = "start";
    }
    context.fillStyle = "#8ca3a8";
    context.font = "500 12px monospace";
    context.fillText("MOVEMENT HEATMAP", 18, canvas.height - 18);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || !navigator.clipboard?.write || !window.ClipboardItem)
      throw new Error("Image clipboard is unavailable");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    document.querySelector("#game-status").textContent =
      "Heatmap copied as an image.";
  }

  document.querySelectorAll(".puzzle-card").forEach((card) => {
    const open = () => openGame(Number(card.dataset.puzzleId));
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
  document.querySelector(".close-game").addEventListener("click", closeGame);
  document.querySelector("#end-game").addEventListener("click", () => {
    if (!activeGame || activeGame.won || activeGame.ended) return;
    const collectedStars = activeGame.starsMask.toString(2).split("1").length - 1;
    if (activeGame.position !== activeGame.puzzle.goal || collectedStars === 0) return;
    activeGame.ended = true;
    activeGame.finishedAt = Date.now();
    window.clearInterval(activeGame.timerId);
    activeGame.timerId = null;
    updateGame();
  });
  document
    .querySelector("#copy-heatmap")
    .addEventListener("click", async () => {
      try {
        await copyHeatmap();
      } catch {
        document.querySelector("#game-status").textContent =
          "Copying images is not available here.";
      }
    });
  document.querySelector(".reset-game").addEventListener("click", () => {
    if (!activeGame) return;
    activeGame.position = activeGame.puzzle.start;
    activeGame.boulders = [...activeGame.puzzle.boulders];
    activeGame.starsMask = 0;
    activeGame.won = false;
    activeGame.ended = false;
    activeGame.perfect = false;
    activeGame.resets += 1;
    activeGame.heatmap[activeGame.puzzle.start] =
      (activeGame.heatmap[activeGame.puzzle.start] || 0) + 1;
    activeGame.finishedAt = null;
    if (!activeGame.timerId)
      activeGame.timerId = window.setInterval(updateTimer, 1000);
    updateGame();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeGame();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeGame) closeGame();
    if (
      !activeGame ||
      !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)
    )
      return;
    event.preventDefault();
    handleMove(
      event.key
        .replace("ArrowUp", "U")
        .replace("ArrowRight", "R")
        .replace("ArrowDown", "D")
        .replace("ArrowLeft", "L"),
    );
  });
}

render();
