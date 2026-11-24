# Figure Suite 1.1 plan: links, plot, seq, timeline, sets

Goal: cover the high-priority gaps found by surveying textbooks beyond CLRS:

- pointers between different blocks (data structures, operating systems);
- function plots and bar charts (asymptotics, probability);
- sequence and space-time diagrams (networking, distributed systems, protocols);
- timelines and Gantt charts (interval scheduling, CPU scheduling);
- Venn and Euler diagrams (discrete math, complexity classes).

Every feature follows the existing conventions:

- a block header at column 0, an indented body, and `word:` directives;
- labels are TeX;
- colours are the same colour words as elsewhere;
- mistakes are reported against their line instead of breaking the figure.

## 1. Cross-block links

```
array P
  1 2 3
list L.head
  9 16 4
graph G
  u -> v
link P[1] -> L.head[1]                   // array cell → list node
link P[3] -> G.v "next" dashed bend=20   // label, style, curve
link                                     // or a block of links
  T[2,1] -> T[3,2]
  B.leaf1 -> B.leaf2 route=hv
```

### References

| Reference | Meaning |
|---|---|
| `Name` | the whole block |
| `A[i]` | array cell `i` |
| `c[r,c]` | table cell |
| `L[i]` | list node `i` (1-based) |
| `T[k]` | chains slot `k` |
| `T[k,j]` | `j`-th node in the chain of slot `k` |
| `G.u` or `G[u]` | graph node `u` |
| `Tr.17` | tree node labelled 17 |
| `S.A` | a set (sets block) |
| `Q.Alice` | an actor (seq block) |
| `R.P1` | the first bar of row P1 (timeline block) |

- **How a block gets its name**: from `id=…`, which every block accepts, or else from the name already written in the header (`array A`, `list L.head`, `graph G`).
- **Arrow types**: `->`, `<-`, `<->` and `--`.
- **Options**:
  - `"label"`;
  - `bend=deg`;
  - `route=hv|vh` (elbow);
  - `dashed`, `dotted`, `thick` and a colour;
  - `from=center|edge`. By default, a cell or record starts at its centre with a dot (CLRS pointer style), and a node or block starts at its edge.
- **Where the line ends**: on the target's boundary (rectangle or ellipse intersection).
- **Canvas size**: grows when a curved link leaves the panel area.

### Implementation

- `Rec.anchor(key, shape)` stores anchors in block-local coordinates.
- `done()` exposes them, and `draw()` records the shift, so links resolve in figure coordinates.
- `link` lines are parsed into `fig.links`. They don't create panels and don't count as blocks.
- An unknown block or key is a warning on that line, and the link is skipped.

## 2. `plot`

```
plot x=1..10 y=0..100 xlabel=n ylabel="T(n)"
  n^2                         // curve; label defaults to the expression as TeX
  n \lg n "n \lg n" dashed    // quoted text overrides the label
  2^n red
  vline: 3 n_0 dashed
  points: (1,1) (2,4) (3,9) line
  bars: 3 1 4 1 5
  xticks: 1 3:n_0 10
```

- **Header**:
  - `x=a..b`, `y=c..d` (auto when omitted);
  - `w=`, `h=`;
  - `xlabel=`, `ylabel=`;
  - `ticks=on|none`, `grid`, `size=`.
- **Expressions**: numbers; `n`, `x`, `t`, `k` (all the variable); `+ - * / ^`; `!`; parentheses and `{}`; implicit multiplication (`2n`, `n lg n`); functions with or without parentheses (`sqrt lg ln log log2 log10 exp abs floor ceil sin cos min max`); TeX spellings `\lg \log \ln \sqrt \cdot \times \frac{a}{b}`; constants `e`, `pi`.
  - `lg` is log₂, `ln` is the natural logarithm, and `log` is log₂ as in CS textbooks.
  - A bad expression is reported on its line.
- **Curves**:
  - sampled at 240 points and clipped to the plot area;
  - each label sits at the curve's right end or where it leaves the top;
  - labels are nudged apart when they collide.
- **Axes**: L-shaped with arrowheads; nice ticks (1-2-5); `xlabel` at the right end and `ylabel` at the top.
- **Directives**: `points:`, `bars:` (several give grouped bars), `xticks:`, `yticks:`, `hline:`, `vline:`.

## 3. `seq`

```
seq                           // dir=down: actors across, time flows down
  C "Client"
  S "Server"
  C -> S "SYN"  delay=1       // slanted: arrives one step later
  S -> C "SYN+ACK" delay=1
  C -> S "ACK" delay=1
  S --> C "reply"             // dashed reply
  C -> C "retry"              // self message
  S * "crash"                 // event dot on a lifeline
```

- **Header**:
  - `dir=down|right` (right: processes as horizontal lines, the space-time diagram);
  - `step=`, `gap=`, `delay=`;
  - flags `dots`, `time` and `boxes`.
- **Data lines**:
  - `id "label"` declares an actor; actors are also created when first used;
  - `a -> b`, `-->`, `<-` and `<--` are messages, with options `"label"`, `delay=k`, `at=k`, `same` (same step as the previous line), `lost`, `dashed` and a colour;
  - `a * "label"` is an event.
- **Steps**:
  - each line advances the clock by one step, unless it has `same` or `at=`;
  - `delay` defaults to 0 for `down` (UML-style horizontal arrows) and 1 for `right` (slanted space-time messages).

## 4. `timeline`

```
timeline from=0 to=12            // one row per name
  a 0..3 "1"
  b 2..6
  a 7..9                         // same row as a
  mark: 5 t dashed

timeline gantt                   // single row, boundary ticks (CPU scheduling)
  P1 0..24
  P2 24..27
  P3 27..30
```

- **Header**: `from=`, `to=`, `unit=` (px per time unit), `h=`, `ticks=step|bounds|none`, `gantt`, `labels=left|none`.
- **Data lines**: `name a..b ["text"] [colour]` is a bar; `name t ["text"]` is a point event.
- **Directives**: `mark: t [label] [dashed]` draws a vertical line across all rows.

## 5. `sets`

```
sets universe                    // venn layout for 1–3 sets
  A
  B
  shade: A&~B lightblue          // & ∩, | ∪, - minus, ~ complement, ( )
  in: A&B x y                    // element labels placed inside a region

sets nested                      // each set inside the previous one
  EXP
  PSPACE
  NP
  P

sets layout=manual unit=40
  NP (-0.6,0) rx=1.3 ry=0.9
  coNP (0.6,0) rx=1.3 ry=0.9
  P (0,-0.2) r=0.45
```

- **Header**:
  - `layout=venn|nested|manual` (`venn` and `nested` are also flags);
  - `unit=`;
  - `universe` or `universe="\Sigma^*"`.
- **Set line**: `id ["label"] [(x,y)] [r=] [rx=] [ry=] [colour]`.
- **Shading**: each region is split into atoms (inside or outside every set), so any formula works for any layout. Each atom is drawn with nested `clip-path`s for the sets it is inside and a `mask` for the sets it is outside.
- **Element labels**: placed at the deepest point of the region, found by sampling a grid plus a distance transform.

## Tests (tests/test-engine.js)

- **Links**:
  - links make no panels and leave `fig.blocks` unchanged;
  - every reference type resolves;
  - the end point lies on the target boundary (rectangle and circle);
  - unknown names and keys warn;
  - a bent link enlarges the canvas.
- **Plot**:
  - the evaluator (`n lg n` at 8 = 24, `2^n`, `-n^2`, `\frac{n}{2}`, `2n`, `n!`, precedence);
  - automatic ranges;
  - a bad expression gives a warning;
  - bars, points and vline produce SVG.
- **Seq**:
  - actor order (declared, then first use);
  - a slanted message's end y is later than its start y;
  - self messages;
  - `dir=right` swaps the axes.
- **Timeline**:
  - rows merge by name;
  - Gantt boundary ticks;
  - a reversed range warns;
  - the extent follows `from`/`to`.
- **Sets**:
  - Venn centres for 2 and 3 sets;
  - `shade:` emits clip paths and masks;
  - an `in:` point lies in the right region;
  - an unknown set in a formula warns;
  - nested sets contain each other.
- **Templates and help**: every new template and help example renders without errors (existing loop).

## Reference figures to reproduce (visual check)

- **CLRS Fig. 3.1**: Θ, O and Ω pictures with n₀ (plot with `vline:`, `ticks=none`).
- **Growth of functions**: lg n, n, n lg n, n² and 2ⁿ.
- **Kurose**: TCP three-way handshake (seq, slanted).
- **Lamport (1978)**: space-time diagram (seq dir=right, events).
- **Kleinberg–Tardos Fig. 4.1-style**: interval scheduling (timeline).
- **Silberschatz**: FCFS Gantt chart (timeline gantt).
- **Rosen**: A − B shaded, and three-set Venn with elements.
- **Sipser/Arora–Barak**: P, NP and coNP inside PSPACE (sets manual).
- **Memory diagrams**: an array of pointers to lists, and B+-tree leaves linked (links).
