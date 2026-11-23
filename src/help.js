/*
 * Figure Suite — syntax reference shown in the panel (English and Chinese).
 *
 * Plain data so the panel can build it with DOM calls and the tests can render
 * every example. In text, `backticks` mark code.
 *   { p }          paragraph
 *   { ref: [...] } two-column reference: [syntax, { en, zh }]
 *   { ex, note }   complete example with an "Insert" button
 */

const HELP = [
  {
    id: 'basics',
    title: { en: 'Basics', zh: '基础' },
    items: [
      { p: { en: 'A figure is a list of blocks. A block starts at the left margin with its kind, an optional name and options; its body is indented below it. Inside a body, a line `word: …` is a directive.', zh: '一张图由若干「块」组成。块头顶格写：类型、可选的名字和选项；块体缩进写在下面。块体里 `关键字: …` 形式的行是指令。' } },
      { ex: 'array A\n  5 2 4 6 1 3\n  shade: 2..3', note: { en: 'header, body, directive', zh: '块头、块体、指令' } },
      {
        ref: [
          ['array  table  tree  graph', { en: 'block kinds; also list, chains, text, arrow, space', zh: '块类型；另有 list、chains、text、arrow、space' }],
          ['kind name key=value flag', { en: 'block header, at the left margin', zh: '块头，顶格' }],
          ['  indented lines', { en: 'block body (2 spaces is usual)', zh: '块体，一般缩进两格' }],
          ['  word: …', { en: 'directive inside a body', zh: '块体里的指令' }],
          ['// comment', { en: 'comment line; also at the end of a line after a space. `%` starts a comment line too', zh: '注释行；也可以写在行尾（前面要有空格）。`%` 开头的行也是注释' }],
          ['figure cols=3 …', { en: 'options for the whole figure (see Panels & layout)', zh: '整张图的选项（见「面板与排版」）' }],
          ['panel (a) caption', { en: 'start a new panel with a caption', zh: '开始一个带标题的新面板' }],
          ['size=12', { en: 'any block can set its own font size', zh: '任何块都可以单独设置字号' }],
        ],
      },
      { p: { en: 'Problems are listed under the source: red = error, orange = warning (typos, out-of-range indices…; the figure still renders). Click one to jump to its line.', zh: '问题列在源码下方：红色是错误，橙色是警告（拼写错误、下标越界等，图照常画）。点一下跳到对应行。' } },
    ],
  },
  {
    id: 'labels',
    title: { en: 'Labels', zh: '标签' },
    items: [
      { p: { en: 'Every label is typeset like TeX math with Computer Modern: letters italic, digits upright. Quote a label that contains spaces — the quotes only group, the content stays math.', zh: '所有标签都按 TeX 数学排版（Computer Modern 字体）：字母斜体、数字正体。含空格的标签用引号括起来——引号只是分组，内容仍是数学。' } },
      { ex: 'array\n  x_1 n^2 a_{i,j} v1 "n - 1" \\infty NIL', note: { en: 'sub/superscripts, auto subscript, quoted label', zh: '上下标、自动下标、带引号的标签' } },
      {
        ref: [
          ['x_1  n^2  a_{i,j}', { en: 'sub- and superscripts', zh: '上下标' }],
          ['v1', { en: 'one letter + digits becomes v₁', zh: '单个字母加数字自动成 v₁' }],
          ['"n - 1"', { en: 'label with spaces', zh: '含空格的标签' }],
          ['\\alpha … \\Omega', { en: 'Greek letters', zh: '希腊字母' }],
          ['\\le \\ge \\ne \\in \\cup \\infty \\cdots', { en: 'symbols (most common TeX names work)', zh: '符号（常用 TeX 命令名都可以）' }],
          ['\\lceil \\rceil \\lfloor \\rfloor', { en: 'ceiling and floor', zh: '上取整、下取整' }],
          ['\\uparrow \\nwarrow \\leftarrow', { en: 'arrows (LCS tables)', zh: '箭头（LCS 表）' }],
          ['\\frac{a}{b}  \\sqrt{n}  \\overline{x}', { en: 'fraction, root, bar', zh: '分数、根号、上划线' }],
          ['\\log \\lg \\min \\max', { en: 'upright operator names', zh: '正体函数名' }],
          ['NIL   RL', { en: 'NIL in small caps; 2+ capitals upright', zh: 'NIL 小型大写；两个以上大写字母正体' }],
          ['\\text{…}  "…"', { en: 'upright text inside a label', zh: '标签里的正体文字' }],
          ['\\textbf{…} \\textsc{…}', { en: 'bold, small caps', zh: '粗体、小型大写' }],
          ['\\\\', { en: 'line break', zh: '换行' }],
          ['$…$', { en: 'in text, arrow labels and captions (text by default), math goes between dollars', zh: 'text、arrow 标签和面板标题默认是文字，数学写在 $…$ 里' }],
        ],
      },
      { p: { en: 'Unknown commands such as `\\alpah` are printed as they are and reported as a warning.', zh: '不认识的命令（如 `\\alpah`）会原样印出并给出警告。' } },
    ],
  },
  {
    id: 'colors',
    title: { en: 'Colours', zh: '颜色' },
    items: [
      { p: { en: 'Names: `white light shade gray dark black red pink blue lightblue green lightgreen yellow orange tan purple`, or `#hex`. Labels turn white on dark fills.', zh: '颜色名：`white light shade gray dark black red pink blue lightblue green lightgreen yellow orange tan purple`，或 `#hex`。深色底上的文字自动变白。' } },
      {
        ref: [
          ['5@red', { en: 'colour one cell or node — arrays, tables, lists, chains, tree and graph nodes', zh: '给单个格子或结点上色——数组、表格、链表、拉链、树结点、图结点通用' }],
          ['shade: … [colour]', { en: 'colour several at once: indices (array, list), (row,col) (table), labels (tree, chains), ids (graph). Default colour: shade', zh: '一次给多个上色：下标（数组、链表）、(行,列)（表格）、标签（树、拉链）、id（图）。默认颜色 shade' }],
          ['color: …', { en: 'same as shade:', zh: '同 shade:' }],
          ['fill=light', { en: 'on a block header: default fill of the block; on figure: of the whole figure', zh: '写在块头：整个块的默认填充；写在 figure：整张图' }],
        ],
      },
      { ex: 'array A\n  5 2@red 4 6 1\n  shade: 3..4 lightblue\ntree\n  7 black\n    3@red\n    9\n  shade: 9 gray', note: { en: 'one-off colours and shade:', zh: '单个上色与 shade:' } },
    ],
  },
  {
    id: 'array',
    title: { en: 'array', zh: 'array 数组' },
    items: [
      { p: { en: 'Arrays, stacks, queues, sorting steps. Body: the cell values (`_` = empty cell). Indices start at 1 unless `start=` says otherwise.', zh: '数组、栈、队列、排序过程。块体写格子的值（`_` = 空格子）。下标默认从 1 开始，可用 `start=` 修改。' } },
      { ex: 'array A\n  2 8 7 1 3 5 6 4\n  shade: 1..3 lightblue\n  ptr: p=1 i=3 j=6 r=8\n  span: 1..3 {\\le x} below', note: { en: 'partition', zh: '快排划分' } },
      {
        ref: [
          ['array A start=0', { en: 'name and first index', zh: '名字与起始下标' }],
          ['index=above|below|none', { en: 'where the indices go', zh: '下标的位置' }],
          ['vertical', { en: 'cells top to bottom', zh: '竖排' }],
          ['w=30 h=26', { en: 'cell size in px', zh: '格子大小（px）' }],
          ['shade: 2..4 7 [colour]', { en: 'colour cells (ranges allowed)', zh: '给格子上色（可写区间）' }],
          ['ptr: i=2 j=5 [below]', { en: 'pointer arrows; one cell past either end is allowed (i=0)', zh: '指针箭头；可以指到两端外一格（如 i=0）' }],
          ['span: 1..3 {label} [above|below] [square]', { en: 'brace (or bracket) under a range', zh: '区间下方（或上方）的花括号 / 方括号' }],
          ['bar: 3', { en: 'thick bar after cell 3', zh: '第 3 格后的粗竖线' }],
          ['arc: 2 -> 1 [label] [below]', { en: 'curved arrow between cells', zh: '格子之间的弧形箭头' }],
          ['index: a b c', { en: 'custom index labels', zh: '自定义下标' }],
        ],
      },
      { ex: 'array A\n  5 2 4 6 1 3\n  shade: 2 black\n  arc: 2 -> 1 below\n  arc: 1 -> 2 above', note: { en: 'insertion sort step', zh: '插入排序的一步' } },
    ],
  },
  {
    id: 'table',
    title: { en: 'table', zh: 'table 表格' },
    items: [
      { p: { en: 'DP tables, matrices, adjacency matrices, counters. Each body line is a row; quote or brace a cell that contains spaces.', zh: 'DP 表、矩阵、邻接矩阵、计数器。块体每行是一行；含空格的格子用引号或花括号括起来。' } },
      { ex: 'table c start=0\n  cols: _ j 0 1 2 3\n  rows: i 0 1 2\n  _ y_j B D C\n  0 0 0 0 0\n  0 {\\uparrow\\,0} {\\nwarrow\\,1} {\\leftarrow\\,1}\n  shade: (2,4)', note: { en: 'LCS table', zh: 'LCS 表' } },
      {
        ref: [
          ['table c start=0', { en: 'name and first row/column index', zh: '名字与起始行列号' }],
          ['index', { en: 'number the rows and columns', zh: '自动给行列编号' }],
          ['grid=all|none|outer|rows|cols', { en: 'which lines to draw', zh: '画哪些网格线' }],
          ['brackets  (or matrix)', { en: 'matrix style: no grid, square brackets', zh: '矩阵样式：无网格、方括号' }],
          ['cols: x A B', { en: 'column headers (one extra goes in the corner)', zh: '列表头（多一个时放在左上角）' }],
          ['rows: 0 1', { en: 'row headers', zh: '行表头' }],
          ['shade: (1,2) (0..1,2) [colour]', { en: 'colour cells or blocks of cells', zh: '给格子或一片格子上色' }],
          ['arrow: (2,2) -> (1,1) -> (0,0)', { en: 'arrows between cells; path: draws the same without heads', zh: '格子间的箭头链；path: 同样但不带箭头' }],
        ],
      },
      { ex: 'table "$A =$" brackets\n  1 2 3\n  4 5 6\n  7 8 9', note: { en: 'matrix', zh: '矩阵' } },
    ],
  },
  {
    id: 'tree',
    title: { en: 'tree', zh: 'tree 树' },
    items: [
      { p: { en: 'Rooted trees: BST, heaps, AVL and red-black trees, B-trees, recursion trees, Huffman trees, disjoint-set forests. Indentation gives the children. A line indented less than the root starts another tree.', zh: '有根树：BST、堆、AVL、红黑树、B 树、递归树、Huffman 树、不相交集森林。缩进表示孩子；比根缩进还浅的行开始另一棵树（森林）。' } },
      { ex: 'tree\n  6 right=0\n    2 right=0\n      1\n      3\n    9 right=+1\n      _\n      10', note: { en: 'AVL tree with balance factors; _ keeps 10 on the right', zh: '带平衡因子的 AVL 树；_ 让 10 留在右边' } },
      {
        ref: [
          ['tree r=14 levelgap= sibgap=', { en: 'node radius and spacing', zh: '结点半径与间距' }],
          ['shape=circle|box|ellipse|none', { en: 'default node shape', zh: '默认结点形状' }],
          ['arrows=up|down', { en: 'directed edges (up: disjoint sets)', zh: '有向边（up 用于不相交集）' }],
          ['label [shape] [colour] [flags] key=…', { en: 'a node line', zh: '一行一个结点' }],
          ['_', { en: 'empty slot: keeps a lone child left or right', zh: '空位：让唯一的孩子靠左或靠右' }],
          ['nil', { en: 'NIL sentinel', zh: 'NIL 哨兵' }],
          ['[G M P]', { en: 'B-tree node; children hang from the key gaps', zh: 'B 树结点，孩子从关键字间隙引出' }],
          ['"α" tri h=1.5 w=1', { en: 'subtree triangle', zh: '子树三角' }],
          ['circle box ellipse none point', { en: 'node shapes; circle is never turned into an ellipse', zh: '结点形状；写了 circle 就不会自动变椭圆' }],
          ['left= right= above= below=', { en: 'notes beside the node (balance factors, heap indices)', zh: '结点四周的注释（平衡因子、堆下标）' }],
          ['edge=0', { en: 'label on the edge from the parent', zh: '父边上的标签' }],
          ['thick dashed noedge ecolor=red', { en: 'style of the edge from the parent', zh: '父边的样式' }],
          ['double loop', { en: 'double circle; self loop (set roots)', zh: '双圈；自环（集合的根）' }],
          ['level: 0 cn^2', { en: 'note at the right of a level (recursion trees)', zh: '某一层右侧的标注（递归树）' }],
          ['shade: 3 9 gray', { en: 'colour nodes by label', zh: '按标签给结点上色' }],
        ],
      },
      { ex: 'tree\n  26 black\n    17 red\n      nil\n      nil\n    41 black\n      nil\n      nil', note: { en: 'red-black tree', zh: '红黑树' } },
      { ex: 'tree\n  [M]\n    [D H]\n      [B C]\n      [F G]\n      [J K L]\n    [Q T]\n      [N P]\n      [R S]\n      [V W]', note: { en: 'B-tree', zh: 'B 树' } },
      { ex: 'tree shape=none\n  "cn^2"\n    "c(n/2)^2"\n    "c(n/2)^2"\n  level: 0 cn^2\n  level: 1 \\frac{1}{2}cn^2', note: { en: 'recursion tree', zh: '递归树' } },
    ],
  },
  {
    id: 'graph',
    title: { en: 'graph', zh: 'graph 图' },
    items: [
      { p: { en: 'Directed and undirected graphs, weights, BFS/DFS states, flows, automata, DAGs. Nodes are created by the edges that mention them; declare a node on its own line to give it a label, position, shape or colour.', zh: '有向/无向图、带权图、BFS/DFS 状态、流网络、自动机、DAG。边里出现的结点自动创建；要改标签、位置、形状或颜色时，单独写一行声明它。' } },
      { ex: 'graph\n  s (0,0) "0" gray below=s\n  t (1,1) "\\infty" above=t\n  x (2.2,1) "\\infty" above=x\n  y (1,-1) "\\infty" below=y\n  z (2.2,-1) "\\infty" below=z\n  s -> t 10\n  s -> y 5\n  t -> x 1\n  t -> y 2 bend=15\n  y -> t 3 bend=15\n  y -> z 2\n  z -> x 6', note: { en: 'weighted digraph with positions (shortest paths)', zh: '带坐标的带权有向图（最短路）' } },
      { ex: 'graph\n  shirt -> tie -> jacket\n  shirt -> belt -> jacket\n  pants -> belt\n  pants -> shoes', note: { en: 'automatic layered layout', zh: '自动分层布局' } },
      {
        ref: [
          ['a -> b   a -- b   a <-> b', { en: 'directed, undirected, both ways; chains like a -- b -- c', zh: '有向、无向、双向；可连写 a -- b -- c' }],
          ['a -> b 10', { en: 'edge label (weight)', zh: '边标签（权重）' }],
          ['thick dashed dotted red', { en: 'edge style', zh: '边的样式' }],
          ['bend=20  swap  inline  straight', { en: 'curve (+ = left), label on the other side, label on the line, never auto-bend', zh: '弯曲（正数向左）、标签换边、标签压在线上、不自动弯开' }],
          ['x -> x loop=above', { en: 'self loop; side above|below|left|right or an angle (default: where there is room)', zh: '自环；方向 above|below|left|right 或角度（默认放在空位最大的一侧）' }],
          ['id (x,y) label shape colour', { en: 'node line: position in units, y up', zh: '结点行：坐标以单位计，y 向上' }],
          ['above= below= left= right=', { en: 'notes beside a node (d values, names)', zh: '结点四周的注释（d 值、名字）' }],
          ['circle box ellipse point none double start', { en: 'node shapes; start = initial arrow (automata)', zh: '结点形状；start = 初始箭头（自动机）' }],
          ['a@gray', { en: 'colour a node where it is mentioned', zh: '在出现处直接给结点上色' }],
          ['shade: a b gray', { en: 'colour several nodes', zh: '给多个结点上色' }],
          ['group: a b c [colour]', { en: 'shaded region around nodes (SCCs)', zh: '围住一组结点的色块（SCC）' }],
          ['rank: a b', { en: 'same layer in the layered layout', zh: '分层布局里放在同一层' }],
          ['layout=auto', { en: 'manual if every node has a position, else layered (directed) or force (undirected)', zh: '所有结点都有坐标时手动；否则有向图分层、无向图力导向' }],
          ['layout=layered dir=right', { en: 'Sugiyama layers, top-down or left-right', zh: '分层布局，自上而下或从左到右' }],
          ['layout=circle|grid|line', { en: 'on a circle, in a grid (cols=), in a row', zh: '圆周、网格（cols=）、一行' }],
          ['a -> c above|below', { en: 'in layout=line: side of the arc that skips nodes', zh: 'layout=line 时跨越结点的弧线放上方或下方' }],
          ['unit=60 r= spread=1.2', { en: 'px per unit, node radius, stretch an automatic layout', zh: '每单位像素、结点半径、拉伸自动布局' }],
        ],
      },
      { p: { en: 'Drag nodes in the preview: positions are written back as `(x,y)` (snaps to 0.1; hold Alt for free movement). One drag is one undo step.', zh: '可以在预览里拖动结点：坐标自动写回源码为 `(x,y)`（吸附到 0.1，按住 Alt 不吸附），一次拖动是一步撤销。' } },
      { ex: 'graph layout=line\n  0 -> 1 -> 2 -> 3 -> 4\n  0 -> 2 above\n  1 -> 3 below\n  2 -> 4 above', note: { en: 'chain with skip arcs (Fibonacci DP)', zh: '带跨越弧的链（斐波那契 DP）' } },
      { ex: 'graph layout=circle\n  0 start\n  1\n  2\n  3 double\n  0 -> 1 a\n  1 -> 2 b\n  2 -> 3 a\n  1 -> 1 a\n  2 -> 0 b\n  0 -> 0 b', note: { en: 'finite automaton', zh: '有限自动机' } },
    ],
  },
  {
    id: 'lists',
    title: { en: 'list / chains', zh: 'list / chains 链表' },
    items: [
      { p: { en: '`list` draws a linked list; `chains` draws a table of slots with a list per slot (hash tables, adjacency lists, buckets).', zh: '`list` 画链表；`chains` 画一列槽位、每个槽位挂一条链（散列表、邻接表、桶）。' } },
      { ex: 'list L.head double\n  9 16 4 1\n  names: 2', note: { en: 'doubly linked list with field names', zh: '双向链表，标出字段名' } },
      {
        ref: [
          ['list L.head [double]', { en: 'name and singly/doubly linked', zh: '名字，单向或双向' }],
          ['fields=prev,key,next', { en: 'field names used by names:', zh: 'names: 用的字段名' }],
          ['names: 2', { en: 'label the fields of node 2', zh: '在第 2 个结点上方标出字段名' }],
          ['w= h= gap=', { en: 'field size and gap between nodes', zh: '字段大小与结点间距' }],
          ['chains T [double] start=0', { en: 'name, list type, first slot number', zh: '名字、链表类型、起始槽号' }],
          ['1: k1 k4', { en: 'slot 1 holds k1, k4', zh: '槽 1 挂着 k1、k4' }],
          ['0:', { en: 'empty slot (NIL)', zh: '空槽（NIL）' }],
          ['shade: 2 [colour]', { en: 'colour nodes (list: positions, chains: keys)', zh: '给结点上色（list 按位置，chains 按关键字）' }],
        ],
      },
      { ex: 'chains T\n  0:\n  1: k1 k4\n  2:\n  3: k5 k2 k7', note: { en: 'hash table with chaining', zh: '拉链法散列表' } },
    ],
  },
  {
    id: 'layout',
    title: { en: 'Panels & layout', zh: '面板与排版' },
    items: [
      { p: { en: 'Blocks without `panel` lines are stacked in one panel. `panel` starts a new one; `arrow` always sits between two panels. `cols=` wraps panels into rows whose columns line up.', zh: '没有 `panel` 时所有块竖着叠在一个面板里。`panel` 开始新面板；`arrow` 总是放在两个面板之间。`cols=` 让面板换行排列，各行的列对齐。' } },
      { ex: 'figure cols=3\npanel (a) before\narray A\n  5 2 4 6 1 3\n  shade: 2\narrow "step"\npanel (b) after\narray A\n  2 5 4 6 1 3\n  shade: 3', note: { en: 'before → after', zh: '前 → 后' } },
      {
        ref: [
          ['figure cols=3', { en: 'panels per row (arrows not counted)', zh: '每行面板数（箭头不计）' }],
          ['figure packed', { en: 'pack each row instead of aligning columns', zh: '每行紧排，不按列对齐' }],
          ['figure align=top|center|bottom', { en: 'vertical alignment within a row', zh: '同一行面板的竖直对齐' }],
          ['figure size=15 lw=1 fill= background=', { en: 'font size, line width, default fill, background', zh: '字号、线宽、默认填充、背景' }],
          ['figure gap= rowgap= padding=', { en: 'spacing between panels, rows, around the figure', zh: '面板间距、行距、四周留白' }],
          ['panel (a) caption', { en: 'caption; "(a)" is set in bold', zh: '标题；"(a)" 自动加粗' }],
          ['panel dir=row', { en: 'blocks side by side inside the panel', zh: '面板内的块横排' }],
          ['arrow "label" len=60 dir=right|down|left|up both', { en: 'arrow between panels', zh: '面板之间的箭头' }],
          ['text "words $x^2$" size= bold align= color=', { en: 'a line of text', zh: '一行文字' }],
          ['space 20 10', { en: 'empty space (width height)', zh: '空白（宽 高）' }],
        ],
      },
    ],
  },
  {
    id: 'editor',
    title: { en: 'Editor & export', zh: '编辑与导出' },
    items: [
      {
        ref: [
          ['Templates', { en: 'fuzzy search; Enter replaces the source (Mod+Z undoes), Shift+Enter appends', zh: '模糊搜索；回车替换源码（Mod+Z 撤销），Shift+回车追加' }],
          ['Mod+Enter', { en: 'main button: Insert / Update / Save & copy link', zh: '主按钮：Insert / Update / Save & copy link' }],
          ['Tab  Shift+Tab', { en: 'indent / outdent the selected lines', zh: '缩进 / 取消缩进选中行' }],
          ['Mod+/', { en: 'comment / uncomment the selected lines', zh: '注释 / 取消注释选中行' }],
          ['Mod+wheel', { en: 'zoom the preview', zh: '缩放预览' }],
          ['PNG 2×', { en: 'pixel density: sharper, not bigger — the link keeps the 1× width', zh: '像素密度：更清晰但不变大——链接里写的是 1× 宽度' }],
          ['Copy PNG / SVG', { en: 'to the clipboard', zh: '复制到剪贴板' }],
          ['Save file', { en: 'save to the attachment folder and copy the embed link', zh: '存到附件目录并复制嵌入链接' }],
        ],
      },
      { p: { en: 'The source is stored inside every PNG/SVG it makes. To change a figure later, hover it in the note and click the pencil (or right-click its link → Edit figure, or run “Edit figure at cursor”). Update overwrites the file and keeps the links.', zh: '源码保存在生成的 PNG/SVG 里。以后要修改：鼠标移到笔记里的图上点铅笔图标（或右键图片链接 → Edit figure，或运行「Edit figure at cursor」）。Update 会原地覆盖文件，链接不变。' } },
      { p: { en: 'Closing the panel with unsaved work asks first; a new figure that was not inserted is kept as a draft for next time.', zh: '有未保存内容时关闭面板会先确认；没有插入的新图会作为草稿保留，下次新建时恢复。' } },
    ],
  },
];
