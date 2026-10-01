# Frostline Daily: Software Design Description

## 1. Purpose

Frostline Daily is a small browser game that generates three deterministic ice-sliding puzzles every day. Every puzzle uses a fixed 9x9 board rendered as colored cells.

## 2. Product scope

### In scope

- One daily set with Easy, Medium, and Hard puzzles.
- Fixed 9x9 boards, including a solid wall boundary.
- Ice-floor movement: a piece slides in a cardinal direction until the next tile is blocked.
- Deterministic generation from the calendar date and difficulty.
- Breadth-first solving for shortest route length, explored-state count, branching, and dead ends.
- A one-page browser view showing all three boards and their metrics.
- A header refresh control that generates a new session-seeded set of three puzzles.
- A solved-state movement heatmap with a PNG image-copy action.
- A `PERFECT` result for a full solve completed in no more moves than the BFS-calculated shortest route.
- A per-puzzle elapsed timer that starts on open and stops on completion.
- An optional early-finish action available at the goal after collecting at least one star.
- Colored tile boards that open into a playable full-size modal.
- Arrow-key movement for a circular player marker, reset, close, and solved states.

### Out of scope for this slice

- Accounts, persistence, leaderboards, multiplayer, and sharing.
- Animated player movement or touch controls.
- Switches and other stateful mechanics beyond boulders and stars.

## 3. Rules

- `#` is a blocking wall.
- `.` is an ice tile.
- `S` is the start tile.
- `G` is the goal tile.
- `B` represents a boulder.
- `*` represents a collectible star.
- The player starts on `S` and wins on `G`.
- Entering a star tile collects that star; collected stars remain collected for the rest of the puzzle.
- The puzzle is complete only when all three stars have been collected and the player reaches `G`.
- A player at `G` with one or two stars may end the attempt early; this records a partial result and does not count as a full solve.
- Every traversed player tile increments a movement heat value; the solved board visualizes those values.
- A move chooses up, right, down, or left. The player slides across ice and stops immediately before a wall, board edge, or boulder.
- When the player reaches a boulder, the boulder is pushed in the attempted direction and slides until the next wall, board edge, or boulder.
- If multiple boulders share the push direction before the next wall, the push propagates through the chain from the player to the nearest boulder and onward to the farthest boulder.
- After a successful push, the player follows the same slide and stops immediately before the boulder's new stopping tile.
- A push is invalid when the boulder cannot move at least one tile; the player still slides up to the boulder if there is open ice behind it.
- Boulders cannot pass through or occupy the same tile as another boulder.
- A move that would not change position is invalid.
- The solution is the shortest sequence of slide directions found by BFS over the combined player and boulder positions.

## 4. Generation

1. Build a deterministic 9x9 board with a wall boundary.
2. Seed a small deterministic pseudo-random number generator with `YYYY-MM-DD` plus the difficulty name.
3. Place interior walls at a difficulty-specific density.
4. Reserve a random start and goal position on open tiles.
5. Place a tier-specific number of boulders on open tiles.
6. Place three stars on remaining open tiles.
7. Solve the candidate with BFS over player position, boulder positions, and collected-star mask.
8. Calculate a composite difficulty score for the candidate, including boulder count.
9. Keep a candidate when its score fits the tier band and it is not trivial.
10. Use the best valid candidate found after bounded attempts, keeping generation fast and deterministic.

Difficulty targets are approximate rather than absolute:

| Tier | Wall density | Boulders | Target score |
| --- | ---: | ---: | ---: |
| Easy | 16% | 1 | 20-52 |
| Medium | 23% | 2 | 53-78 |
| Hard | 30% | 3 | 70-100 |

The composite score is weighted across shortest route length, explored states, average legal branching, dead-end states, and wall density. The UI reports the score alongside route length and explored states.

## 5. Technical design

- `src/main.js` contains the pure generator, movement rules, BFS solver, and DOM rendering for this first slice.
- The board is represented as an array of tile strings internally and rendered as a CSS grid of colored cells.
- The solver stores player and boulder positions as integer cell indexes plus a bitmask for collected stars, and uses a compound state key for BFS deduplication.
- Date formatting uses the browser's local calendar date. A date badge makes the seed visible to players.
- The playable modal keeps transient player position and move count in memory; closing it returns to the daily set without changing the puzzle.
- Resetting the position restores the puzzle state but preserves accumulated moves, heatmap visits, reset count, and elapsed time.

## 6. Acceptance criteria

- Opening the app shows exactly three puzzle cards.
- Every board is exactly 9 columns by 9 rows.
- The three cards are labeled Easy, Medium, and Hard.
- Overview cards show the board layout while withholding the solution route.
- Reopening on the same calendar date produces the same boards.
- The refresh control regenerates all three puzzles together without changing the daily seed on a fresh page load.
- Each board reports a valid shortest route and explored-state count.
- A production build completes with `npm run build`.
- The page remains usable on narrow screens without horizontal page overflow.
- Clicking or activating a puzzle opens its full-size playable board.
- Arrow keys slide the player until stopped, and reaching `G` shows a solved state.
- Each puzzle has exactly three visible stars, and reaching `G` before collecting them does not complete the puzzle.
- After completion, the movement heatmap can be copied as a PNG image when image clipboard support is available.
- The early-finish action is disabled until the player is on `G` and has collected at least one star.
- The timer displays elapsed `MM:SS` from puzzle open until completion, including time spent across resets.
- The modal and copied heatmap summary display stars gathered, moves used, resets needed, and total elapsed time.
- An optimal full solve displays `PERFECT` over the board and stamps it onto the copied image; partial finishes cannot receive it.

## 7. Future increments

- Add keyboard and touch play modes.
- Add a daily completion state and shareable result string.
- Add generated boulders and stopping tiles behind a feature flag.
- Add a generator test harness that measures route distributions over many dates.
