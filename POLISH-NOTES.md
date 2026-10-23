# Existing-game polish pass

Worktree: `game-polish` · branch: `codex/game-polish` · base: `cbac08b`.

This pass refines the existing assisted controls, rescue lifecycle, sound, and presentation. The other chat's navigation/seaplane rewrite remains in the original checkout and is not included here.

## Changes

- Easy helicopters anticipate building/arch clearance and slow while climbing. A stopped helicopter can clear the previously reproducible arch obstruction without steering or releasing go.
- Pilot departure and vehicle changes resolve incoming passengers, release rescue claims, and clear old towing/avoidance state.
- Sound uses 16 intended engine/ambient loops, restores wildlife listeners, pauses correctly, cancels delayed effects across pause, ducks engines for animal responses, and remembers mute/volume. Species without recordings get a gentle existing chime acknowledgment. Horns/celebrations are softer and overlapping calls have cooldowns.
- The opening screen emphasizes holding go and keeps vehicle/manual setup in a disclosure. Pause emphasizes Keep playing. Hidden menus are inert, focus changes are deliberate, and losing focus pauses the outing.
- Compact settings, responsive mission/cargo displays, corrected vehicle-neutral wording, accessible button states, a water fill gauge, and model-based passenger portraits make existing states clearer.
- Fire particles have tapered flame silhouettes with a subtler ground glow. Camera shake respects reduced-motion preferences. Celebratory sticker bursts use simulation time and pause with the game.
- Finished rescue beams release their owned GPU resources. The soak tool now holds only forward by default. Container builds run the regression tests before bundling.
- Local serving supports `COPTER_PORT` and binds to loopback, allowing this worktree to be previewed separately.

## Verification

- `npm test`: flight-clearance and audio graph/lifecycle regressions pass.
- `npm run build`: standalone offline HTML builds successfully.
- 24/24 isolated vehicle/mission scenarios completed with only forward held, including both fire missions for all three vehicles. Each scenario had a fresh game and up to roughly ten simulated minutes. This is sampled coverage, not exhaustive proof over random layouts.
- The exact arch obstruction was separately reproduced and cleared after the fix.
- Native Chrome checks passed for ten solo/two-player HUD layouts at widths 320, 480, 768, 1024, and 1440 with eight mission slots; controls do not overlap mission or pilot labels.
- Native browser checks confirm 16 loops, pause/resume, remembered sound settings, distinct rendered portraits, and no JavaScript/shader errors in the smoke check.
- Mid-boarding departure and vehicle-change checks each delivered the passenger safely, with no incoming/cargo count or rescue claim left behind.
- Menu, HUD/portraits, pause/setup, and flame screenshots were visually inspected. Full hardware performance, subjective sound mixing, and physical-controller play still need normal playtesting.

Disposable browser harnesses/results are under the original checkout's ignored `build/polish-isolated/` directory. The simulation checks skip drawing/shader warm-up/portrait rendering; the visual and audio checks use the original bundled game in Chrome.
