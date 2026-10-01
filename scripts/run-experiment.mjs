import fs from "node:fs";
import os from "node:os";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { createCandidate, createRandom, hashSeed, solve } from "../src/main.js";

const SIZE = 12;
const SAMPLES = Number(process.env.SAMPLES || 4);
const STATE_CAP = Number(process.env.STATE_CAP || 6000);
const MAX_CONFIGURATIONS = Number(process.env.MAX_CONFIGURATIONS || 0);
const WORKER_COUNT = Number(
  process.env.WORKERS || Math.max(1, os.cpus().length - 1),
);
const JITTER = 0.015;
const levels = (start, end) =>
  Array.from(
    { length: Math.round((end - start) / 0.05) + 1 },
    (_, index) => start + index * 0.05,
  );
const wallLevels = levels(0, 0.5);
const waterLevels = levels(0, 0.5);
const boulderLevels = levels(0.05, 0.2);
const waterBoulderLevels = levels(0.05, 0.2);
const solidLevels = levels(0.05, 0.2);

function jitter(random, target) {
  return Math.max(0, Math.min(0.5, target + (random() * 2 - 1) * JITTER));
}

function difficultyScore(solution) {
  if (!solution) return null;
  const moves = Math.min(solution.route.length / 25, 1) * 45;
  const waterTiles = Math.min(solution.waterTiles / 8, 1) * 30;
  const waterPushes = Math.min(solution.waterPushes / 3, 1) * 25;
  return Math.round(moves + waterTiles + waterPushes);
}

function runConfiguration(config) {
  const trials = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const attemptSeed = `${config.key}:${sample}`;
    const random = createRandom(hashSeed(attemptSeed));
    const difficulty = {
      density: jitter(random, config.wallTarget),
      water: jitter(random, config.waterTarget),
      solid: jitter(random, config.solidTarget),
      boulderDensity: jitter(random, config.boulderTarget),
      waterBoulderChance: jitter(random, config.waterBoulderTarget),
    };
    const candidate = createCandidate(random, difficulty, SIZE);
    const solution = solve(
      candidate.cells,
      candidate.start,
      candidate.goal,
      SIZE,
      candidate.boulders,
      candidate.stars,
      0,
      STATE_CAP,
    );
    trials.push({
      wallTarget: config.wallTarget,
      waterTarget: config.waterTarget,
      boulderTarget: config.boulderTarget,
      waterBoulderTarget: config.waterBoulderTarget,
      solidTarget: config.solidTarget,
      sample,
      wallActual:
        candidate.cells.filter((tile) => tile === "#").length / (SIZE * SIZE),
      waterActual:
        candidate.cells.filter((tile) => tile === "~").length / (SIZE * SIZE),
      boulderActual: candidate.boulders.length / (SIZE * SIZE),
      waterBoulderActual:
        candidate.boulders.filter(
          (position) => candidate.cells[position] === "~",
        ).length / Math.max(1, candidate.boulders.length),
      solidActual:
        candidate.cells.filter((tile) => tile === "O").length / (SIZE * SIZE),
      solvable: Boolean(solution),
      moves: solution?.route.length ?? null,
      waterPushes: solution?.waterPushes ?? null,
      waterTiles: solution?.waterTiles ?? null,
      explored: solution?.explored ?? null,
      difficulty: difficultyScore(solution),
      attemptSeed,
    });
  }
  const solvable = trials.filter((trial) => trial.solvable);
  return {
    key: config.key,
    trials,
    summary: {
      wallTarget: config.wallTarget,
      waterTarget: config.waterTarget,
      boulderTarget: config.boulderTarget,
      waterBoulderTarget: config.waterBoulderTarget,
      solidTarget: config.solidTarget,
      samples: trials.length,
      solvable: solvable.length,
      solvabilityPercent: (solvable.length / trials.length) * 100,
      averageMoves: solvable.length
        ? solvable.reduce((sum, trial) => sum + trial.moves, 0) /
          solvable.length
        : null,
      averageWaterPushes: solvable.length
        ? solvable.reduce((sum, trial) => sum + trial.waterPushes, 0) /
          solvable.length
        : null,
      averageWaterTiles: solvable.length
        ? solvable.reduce((sum, trial) => sum + trial.waterTiles, 0) /
          solvable.length
        : null,
      averageDifficulty: solvable.length
        ? solvable.reduce((sum, trial) => sum + trial.difficulty, 0) /
          solvable.length
        : null,
    },
  };
}

if (!isMainThread) {
  parentPort.on("message", (config) => {
    try {
      parentPort.postMessage(runConfiguration(config));
    } catch (error) {
      parentPort.postMessage({ error: String(error), key: config.key });
    }
  });
} else {
  const startedAt = Date.now();
  const outputDirectory = new URL("../experiment-output/", import.meta.url);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const trialPath = new URL("trials.csv", outputDirectory);
  const summaryPath = new URL("summary.json", outputDirectory);
  const trialStream = fs.createWriteStream(trialPath);
  trialStream.write(
    "wall_target,water_target,boulder_target,water_boulder_target,solid_target,sample,wall_actual,water_actual,boulder_actual,water_boulder_actual,solid_actual,solvable,moves,water_pushes,water_tiles,explored,difficulty,attempt_seed\n",
  );

  const configurations = [];
  for (const wallTarget of wallLevels) {
    for (const waterTarget of waterLevels) {
      for (const boulderTarget of boulderLevels) {
        for (const waterBoulderTarget of waterBoulderLevels) {
          for (const solidTarget of solidLevels) {
            if (
              MAX_CONFIGURATIONS &&
              configurations.length >= MAX_CONFIGURATIONS
            )
              break;
            configurations.push({
              wallTarget,
              waterTarget,
              boulderTarget,
              waterBoulderTarget,
              solidTarget,
              key: [
                wallTarget,
                waterTarget,
                boulderTarget,
                waterBoulderTarget,
                solidTarget,
              ]
                .map((value) => value.toFixed(2))
                .join("|"),
            });
          }
          if (MAX_CONFIGURATIONS && configurations.length >= MAX_CONFIGURATIONS)
            break;
        }
        if (MAX_CONFIGURATIONS && configurations.length >= MAX_CONFIGURATIONS)
          break;
      }
      if (MAX_CONFIGURATIONS && configurations.length >= MAX_CONFIGURATIONS)
        break;
    }
    if (MAX_CONFIGURATIONS && configurations.length >= MAX_CONFIGURATIONS)
      break;
  }

  const summaries = [];
  let nextIndex = 0;
  let completed = 0;
  const workers = Array.from(
    { length: Math.min(WORKER_COUNT, configurations.length) },
    () => new Worker(new URL(import.meta.url)),
  );
  const assign = (worker) => {
    if (nextIndex >= configurations.length) return;
    worker.postMessage(configurations[nextIndex]);
    nextIndex += 1;
  };

  await new Promise((resolve, reject) => {
    for (const worker of workers) {
      worker.on("message", (result) => {
        if (result.error) {
          reject(new Error(`${result.key}: ${result.error}`));
          return;
        }
        for (const trial of result.trials) {
          trialStream.write(
            [
              trial.wallTarget.toFixed(2),
              trial.waterTarget.toFixed(2),
              trial.boulderTarget.toFixed(2),
              trial.waterBoulderTarget.toFixed(2),
              trial.solidTarget.toFixed(2),
              trial.sample,
              trial.wallActual.toFixed(4),
              trial.waterActual.toFixed(4),
              trial.boulderActual.toFixed(4),
              trial.waterBoulderActual.toFixed(4),
              trial.solidActual.toFixed(4),
              trial.solvable,
              trial.moves ?? "",
              trial.waterPushes ?? "",
              trial.waterTiles ?? "",
              trial.explored ?? "",
              trial.difficulty ?? "",
              trial.attemptSeed,
            ].join(",") + "\n",
          );
        }
        summaries.push(result.summary);
        completed += 1;
        if (completed % 100 === 0 || completed === configurations.length)
          console.log(
            `configurations=${completed}/${configurations.length} trials=${completed * SAMPLES} elapsed_ms=${Date.now() - startedAt}`,
          );
        if (completed === configurations.length) resolve();
        else assign(worker);
      });
      worker.on("error", reject);
      assign(worker);
    }
  });
  await Promise.all(workers.map((worker) => worker.terminate()));
  await new Promise((resolve) => trialStream.end(resolve));
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        size: SIZE,
        samplesPerConfiguration: SAMPLES,
        workerCount: workers.length,
        jitter: JITTER,
        configurationCount: configurations.length,
        trialCount: configurations.length * SAMPLES,
        elapsedMs: Date.now() - startedAt,
        metrics: {
          difficultyFormula:
            "45 * min(shortest_moves / 25, 1) + 30 * min(water_tiles / 8, 1) + 25 * min(water_pushes / 3, 1)",
          interpretation:
            "Solvability is BFS solvability; each trial is generated and solved independently.",
        },
        configurations: summaries,
      },
      null,
      2,
    ),
  );
  console.log(
    `completed configurations=${configurations.length} trials=${configurations.length * SAMPLES} elapsed_ms=${Date.now() - startedAt}`,
  );
  console.log(`trials=${trialPath.pathname}`);
  console.log(`summary=${summaryPath.pathname}`);
}
