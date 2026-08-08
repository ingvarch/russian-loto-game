# Graph Report - russian-loto-game  (2026-08-08)

## Corpus Check
- 37 files · ~33,170 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 320 nodes · 467 edges · 20 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7e6ec80`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 21 edges
2. `GameRoom` - 17 edges
3. `render()` - 14 edges
4. `active()` - 13 edges
5. `init()` - 13 edges
6. `scripts` - 10 edges
7. `Non-negotiable principles` - 8 edges
8. `resolveLevel()` - 7 edges
9. `Env` - 7 edges
10. `persist()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `ProvidedEnv` --inherits--> `Env`  [EXTRACTED]
  tests/worker/cloudflare-test.d.ts → src/types.ts
- `handleState()` --calls--> `readOwnerToken()`  [EXTRACTED]
  src/index.ts → src/auth.ts
- `Env` --references--> `GameRoom`  [EXTRACTED]
  src/types.ts → src/game-room.ts
- `handleSessionCreate()` --calls--> `newOwnerToken()`  [EXTRACTED]
  src/index.ts → src/session-id.ts
- `handleSessionCreate()` --calls--> `newSessionId()`  [EXTRACTED]
  src/index.ts → src/session-id.ts

## Import Cycles
- None detected.

## Communities (20 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (50): active(), applyPreset(), applyRemoteState(), askUncall(), buildGrid(), calledSet(), CARDS, counterEl (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (28): Apple Human Interface Guidelines, Architecture, Assets, Auth, Clean code, Cloudflare guidance, Commit prompt, Compatibility date (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (21): readOwnerToken(), Card, DEFAULT_CARDS, RegistryEntry, CardsBodyResult, fetch(), handlePage(), handleQR() (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (27): dependencies, qrcode-svg, description, devDependencies, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, @types/bun, @types/qrcode-svg (+19 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (21): buildGrid(), CARDS, counterEl, currentBallEl, currentNumEl, formatAmount(), gridEl, init() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (25): activeCards(), calledSet(), canReopenEvent(), closeCards(), closeCardsForLevel(), closeCountsByLevel(), computeLevelPayout(), computePayouts() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (8): ENCODER, GameRoom, HEARTBEAT_FRAME, sseFrame(), Subscriber, Env, RateLimit, ProvidedEnv

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (23): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.21
Nodes (13): applyCallNumber(), applyReopenEvent(), applyResolveEvent(), applyResolveTiebreak(), applyUncallNumber(), currentStorageKey(), freshState(), loadState() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (7): errEl, helpModal, normalizeDeck(), colRange(), err(), isPositiveInt(), validateCards()

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (7): CARDS, displayUrl, qrImg, qrUrlEl, SERVER_RANGE, sessionMatch, shareModal

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (6): Architecture, How to deploy, How to host, Related, russian-loto-game, Scripts

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, exclude, extends, include

## Knowledge Gaps
- **122 isolated node(s):** `name`, `version`, `private`, `description`, `type` (+117 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameRoom` connect `Community 6` to `Community 2`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _122 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07857142857142857 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11954022988505747 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08994708994708994 - nodes in this community are weakly interconnected._