# 书签标签雷同审计

- 快照日期：2026-07-30（Asia/Shanghai）
- 数据库：`~/Library/Application Support/com.bkmrx/bookmarks.db`
- 标签总数：3043
- 标签 ID 范围：1–11171
- 本文档仅为只读审计结果，尚未修改数据库。

## 汇总结论

- 高置信度雷同：**118 组**，涉及 **242 个 tag**。
- 若每组只保留一个规范 tag：可减少 **124 个 tag**。
- 其中包含格式差异组 25 组、单复数组 80 组、缩写/全称或产品别名组 16 组；同一组可能同时命中多种类型。
- 另列出 **12 组**语义接近候选，必须检查书签内容后再决定，未计入可减少数量。
- 完全同名重复为 0；`tags.name` 有唯一约束。

## 使用说明

- `#数字` 是当前数据库中的 tag ID，可用于后续精确限定修改目标。
- “建议保留”优先采用通行名称；未特别指定时，优先选择引用次数较高的 tag。
- 在真正修改前仍应检查目标 ID 是否存在，以及文档快照之后是否新增了关联。
- 不要直接合并“待人工确认”部分；其中有上下位概念、版本差异或缩写歧义。

## 高置信度合并候选

| 序号 | 类型 | 建议保留 | 组内 tag（ID、引用次数） |
|---:|---|---|---|
| 1 | 单复数 | `3d-model` (#1626) | `3d-model` (#1626, 1 次)<br>`3d-models` (#1599, 1 次) |
| 2 | 单复数 | `agent` (#570) | `agent` (#570, 8 次)<br>`agents` (#10936, 1 次) |
| 3 | 单复数 | `ai-agent` (#10510) | `ai-agent` (#10510, 9 次)<br>`ai-agents` (#10474, 1 次) |
| 4 | 单复数 | `algorithm` (#1364) | `algorithm` (#1364, 8 次)<br>`algorithms` (#6131, 8 次) |
| 5 | 单复数 | `animation` (#137) | `animation` (#137, 61 次)<br>`animations` (#1154, 1 次) |
| 6 | 单复数 | `app-icon` (#1143) | `app-icon` (#1143, 1 次)<br>`app-icons` (#8733, 1 次) |
| 7 | 单复数 | `article` (#180) | `article` (#180, 29 次)<br>`articles` (#141, 1 次) |
| 8 | 单复数 | `assets` (#9322) | `asset` (#627, 1 次)<br>`assets` (#9322, 3 次) |
| 9 | 缩写/全称或产品别名 | `authentication` (#1969) | `auth` (#2578, 4 次)<br>`authentication` (#1969, 14 次) |
| 10 | 格式差异 | `autocomplete` (#2091) | `auto-complete` (#2549, 1 次)<br>`autocomplete` (#2091, 4 次) |
| 11 | 单复数 | `avatar` (#1013) | `avatar` (#1013, 4 次)<br>`avatars` (#9524, 2 次) |
| 12 | 单复数 | `backgrounds` (#754) | `background` (#696, 1 次)<br>`backgrounds` (#754, 4 次) |
| 13 | 单复数 | `best-practices` (#1669) | `best-practice` (#7569, 1 次)<br>`best-practices` (#1669, 9 次) |
| 14 | 缩写/全称或产品别名 | `bnb-chain` (#9884) | `binance-smart-chain` (#9271, 2 次)<br>`bnb-chain` (#9884, 5 次)<br>`bsc` (#9175, 4 次) |
| 15 | 格式差异 | `chainlist` (#9332) | `chain-list` (#9899, 1 次)<br>`chainlist` (#9332, 3 次) |
| 16 | 格式差异 | `cleavejs` (#4180) | `cleave.js` (#4185, 1 次)<br>`cleavejs` (#4180, 1 次) |
| 17 | 缩写/全称或产品别名 | `cli` (#1302) | `cli` (#1302, 36 次)<br>`cmdline` (#8258, 1 次)<br>`command-line` (#3835, 11 次) |
| 18 | 缩写/全称或产品别名 | `code-generation` (#5087) | `code-gen` (#1332, 10 次)<br>`code-generation` (#5087, 9 次) |
| 19 | 单复数 | `color` (#593) | `color` (#593, 10 次)<br>`colors` (#8476, 1 次) |
| 20 | 单复数 | `color-scheme` (#841) | `color-scheme` (#841, 1 次)<br>`color-schemes` (#8187, 1 次) |
| 21 | 单复数 | `component` (#421) | `component` (#421, 22 次)<br>`components` (#2798, 3 次) |
| 22 | 单复数 | `concept` (#6099) | `concept` (#6099, 1 次)<br>`concepts` (#1687, 1 次) |
| 23 | 单复数 | `custom-filter` (#3421) | `custom-filter` (#3421, 1 次)<br>`custom-filters` (#3417, 1 次) |
| 24 | 单复数 | `dapp` (#8974) | `dapp` (#8974, 7 次)<br>`dapps` (#9066, 6 次) |
| 25 | 单复数 | `data-structures` (#5448) | `data-structure` (#4167, 1 次)<br>`data-structures` (#5448, 9 次) |
| 26 | 缩写/全称或产品别名 | `domain-driven-design` (#7653) | `ddd` (#7652, 10 次)<br>`domain-driven-design` (#7653, 5 次) |
| 27 | 单复数 | `decorator` (#2677) | `decorator` (#2677, 2 次)<br>`decorators` (#1709, 1 次) |
| 28 | 缩写/全称或产品别名 | `dependency-injection` (#2720) | `dependency-injection` (#2720, 5 次)<br>`di` (#2721, 1 次)<br>`inversion-of-control` (#6194, 2 次)<br>`ioc` (#7626, 2 次) |
| 29 | 单复数 | `deployment` (#1990) | `deployment` (#1990, 14 次)<br>`deployments` (#9519, 1 次) |
| 30 | 单复数 | `design-resource` (#756) | `design-resource` (#756, 2 次)<br>`design-resources` (#1420, 2 次) |
| 31 | 单复数 | `design-tool` (#571) | `design-tool` (#571, 2 次)<br>`design-tools` (#7716, 2 次) |
| 32 | 单复数；格式差异 | `devtools` (#2182) | `dev-tool` (#6216, 1 次)<br>`dev-tools` (#4697, 3 次)<br>`devtools` (#2182, 6 次) |
| 33 | 单复数 | `ebook` (#8518) | `ebook` (#8518, 11 次)<br>`ebooks` (#8507, 2 次) |
| 34 | 单复数 | `effect` (#694) | `effect` (#694, 2 次)<br>`effects` (#705, 2 次) |
| 35 | 缩写/全称或产品别名 | `ethereum` (#1026) | `eth` (#10071, 1 次)<br>`ethereum` (#1026, 90 次) |
| 36 | 格式差异 | `ethers.js` (#9503) | `ethers.js` (#9503, 3 次)<br>`ethersjs` (#9790, 1 次) |
| 37 | 单复数 | `event` (#4198) | `event` (#4198, 3 次)<br>`events` (#4667, 2 次) |
| 38 | 单复数 | `examples` (#2028) | `example` (#3418, 3 次)<br>`examples` (#2028, 6 次) |
| 39 | 单复数 | `font` (#884) | `font` (#884, 7 次)<br>`fonts` (#660, 1 次) |
| 40 | 单复数 | `form` (#504) | `form` (#504, 27 次)<br>`forms` (#2762, 1 次) |
| 41 | 格式差异 | `fullstack` (#2001) | `full-stack` (#4591, 1 次)<br>`fullstack` (#2001, 2 次) |
| 42 | 单复数 | `hooks` (#1864) | `hook` (#2194, 2 次)<br>`hooks` (#1864, 13 次) |
| 43 | 缩写/全称或产品别名 | `i18n` (#1665) | `i18n` (#1665, 3 次)<br>`internationalization` (#233, 4 次) |
| 44 | 单复数 | `icons` (#1082) | `icon` (#735, 4 次)<br>`icons` (#1082, 22 次) |
| 45 | 单复数 | `illustration` (#1262) | `illustration` (#1262, 5 次)<br>`illustrations` (#1100, 2 次) |
| 46 | 单复数 | `image` (#927) | `image` (#927, 4 次)<br>`images` (#8501, 2 次) |
| 47 | 格式差异 | `input-mask` (#4183) | `input-mask` (#4183, 3 次)<br>`inputmask` (#4191, 1 次) |
| 48 | 格式差异 | `letsencrypt` (#7157) | `lets-encrypt` (#7152, 1 次)<br>`letsencrypt` (#7157, 1 次) |
| 49 | 单复数 | `library` (#276) | `libraries` (#2272, 1 次)<br>`library` (#276, 433 次) |
| 50 | 单复数 | `loader` (#751) | `loader` (#751, 1 次)<br>`loaders` (#707, 1 次) |
| 51 | 格式差异 | `lockfile` (#4955) | `lock-file` (#4979, 1 次)<br>`lockfile` (#4955, 1 次) |
| 52 | 单复数 | `micro-frontend` (#2288) | `micro-frontend` (#2288, 5 次)<br>`micro-frontends` (#5162, 5 次) |
| 53 | 单复数 | `microservices` (#5140) | `microservice` (#2289, 1 次)<br>`microservices` (#5140, 3 次) |
| 54 | 单复数 | `mime-type` (#4404) | `mime-type` (#4404, 1 次)<br>`mime-types` (#6923, 1 次) |
| 55 | 格式差异 | `miniprogram` (#5740) | `mini-program` (#5755, 1 次)<br>`miniprogram` (#5740, 1 次) |
| 56 | 单复数 | `monad` (#9802) | `monad` (#9802, 4 次)<br>`monads` (#6058, 2 次) |
| 57 | 格式差异 | `multichain` (#9540) | `multi-chain` (#9116, 6 次)<br>`multichain` (#9540, 7 次) |
| 58 | 格式差异 | `multi-language` (#229) | `multi-language` (#229, 2 次)<br>`multilanguage` (#8043, 1 次) |
| 59 | 格式差异 | `naiveui` (#7443) | `naive-ui` (#2398, 1 次)<br>`naiveui` (#7443, 2 次) |
| 60 | 缩写/全称或产品别名 | `nlp` (#5954) | `natural-language-processing` (#11049, 1 次)<br>`nlp` (#5954, 3 次) |
| 61 | 格式差异 | `nextauth` (#2002) | `next-auth` (#5278, 1 次)<br>`nextauth` (#2002, 1 次) |
| 62 | 格式差异 | `nextjs` (#426) | `next.js` (#7451, 2 次)<br>`nextjs` (#426, 12 次) |
| 63 | 缩写/全称或产品别名 | `ng-zorro` (#4626) | `ng-zorro` (#4626, 2 次)<br>`ng-zorro-antd` (#940, 2 次) |
| 64 | 格式差异 | `nodejs` (#1303) | `node-js` (#5118, 2 次)<br>`nodejs` (#1303, 27 次) |
| 65 | 单复数 | `node-provider` (#9748) | `node-provider` (#9748, 4 次)<br>`node-providers` (#9795, 1 次) |
| 66 | 单复数 | `notification` (#2213) | `notification` (#2213, 3 次)<br>`notifications` (#9941, 1 次) |
| 67 | 单复数 | `online-tool` (#402) | `online-tool` (#402, 17 次)<br>`online-tools` (#7719, 1 次) |
| 68 | 格式差异 | `open-source` (#21) | `open-source` (#21, 49 次)<br>`opensource` (#3796, 1 次) |
| 69 | 单复数 | `opinion` (#1882) | `opinion` (#1882, 2 次)<br>`opinions` (#240, 1 次) |
| 70 | 单复数 | `pattern` (#595) | `pattern` (#595, 3 次)<br>`patterns` (#7631, 1 次) |
| 71 | 单复数 | `perpetual` (#10267) | `perpetual` (#10267, 1 次)<br>`perpetuals` (#9459, 1 次) |
| 72 | 单复数 | `plugin` (#297) | `plugin` (#297, 65 次)<br>`plugins` (#119, 2 次) |
| 73 | 格式差异 | `producthunt` (#129) | `product-hunt` (#49, 1 次)<br>`producthunt` (#129, 1 次) |
| 74 | 单复数 | `programmer` (#25) | `programmer` (#25, 1 次)<br>`programmers` (#8644, 1 次) |
| 75 | 单复数 | `project` (#7480) | `project` (#7480, 3 次)<br>`projects` (#16, 3 次) |
| 76 | 单复数 | `prompt` (#6738) | `prompt` (#6738, 1 次)<br>`prompts` (#10789, 1 次) |
| 77 | 单复数 | `proposals` (#1762) | `proposal` (#1712, 1 次)<br>`proposals` (#1762, 2 次) |
| 78 | 单复数 | `question` (#2685) | `question` (#2685, 1 次)<br>`questions` (#8799, 1 次) |
| 79 | 缩写/全称或产品别名 | `rag` (#10374) | `rag` (#10374, 3 次)<br>`retrieval-augmented-generation` (#10500, 1 次) |
| 80 | 单复数 | `ranking` (#17) | `ranking` (#17, 1 次)<br>`rankings` (#10100, 1 次) |
| 81 | 单复数 | `react-hooks` (#3615) | `react-hook` (#5606, 1 次)<br>`react-hooks` (#3615, 2 次) |
| 82 | 单复数 | `recommendation` (#1075) | `recommendation` (#1075, 6 次)<br>`recommendations` (#8629, 1 次) |
| 83 | 单复数 | `remote-component` (#5240) | `remote-component` (#5240, 3 次)<br>`remote-components` (#5215, 1 次) |
| 84 | 单复数 | `resource` (#568) | `resource` (#568, 16 次)<br>`resources` (#26, 12 次) |
| 85 | 单复数 | `scripts` (#4943) | `script` (#4397, 1 次)<br>`scripts` (#4943, 2 次) |
| 86 | 缩写/全称或产品别名 | `ssr` (#484) | `server-side-rendering` (#7489, 1 次)<br>`ssr` (#484, 14 次) |
| 87 | 单复数 | `service` (#6787) | `service` (#6787, 6 次)<br>`services` (#2662, 1 次) |
| 88 | 单复数 | `shape` (#543) | `shape` (#543, 2 次)<br>`shapes` (#548, 1 次) |
| 89 | 缩写/全称或产品别名 | `spa` (#1437) | `single-page-application` (#2812, 1 次)<br>`spa` (#1437, 2 次) |
| 90 | 单复数 | `skill` (#10632) | `skill` (#10632, 4 次)<br>`skills` (#10933, 2 次) |
| 91 | 单复数 | `smart-contracts` (#9142) | `smart-contract` (#9130, 3 次)<br>`smart-contracts` (#9142, 17 次) |
| 92 | 单复数 | `snippet` (#466) | `snippet` (#466, 28 次)<br>`snippets` (#2031, 1 次) |
| 93 | 单复数 | `specification` (#2976) | `specification` (#2976, 5 次)<br>`specifications` (#236, 1 次) |
| 94 | 单复数 | `standard` (#2977) | `standard` (#2977, 2 次)<br>`standards` (#1764, 2 次) |
| 95 | 单复数 | `sticky-columns` (#299) | `sticky-column` (#3266, 2 次)<br>`sticky-columns` (#299, 3 次) |
| 96 | 单复数 | `stock-photos` (#1109) | `stock-photo` (#663, 1 次)<br>`stock-photos` (#1109, 4 次) |
| 97 | 格式差异 | `style-guide` (#5925) | `style-guide` (#5925, 2 次)<br>`styleguide` (#2409, 1 次) |
| 98 | 缩写/全称或产品别名；格式差异 | `tailwindcss` (#4073) | `tailwind` (#364, 12 次)<br>`tailwind-css` (#428, 6 次)<br>`tailwindcss` (#4073, 3 次) |
| 99 | 单复数 | `template` (#429) | `template` (#429, 45 次)<br>`templates` (#664, 3 次) |
| 100 | 单复数 | `testnet` (#9799) | `testnet` (#9799, 16 次)<br>`testnets` (#10294, 1 次) |
| 101 | 格式差异 | `threejs` (#1636) | `three.js` (#1597, 3 次)<br>`threejs` (#1636, 3 次) |
| 102 | 单复数 | `tool` (#4) | `tool` (#4, 468 次)<br>`tools` (#115, 9 次) |
| 103 | 单复数 | `ui-component` (#424) | `ui-component` (#424, 13 次)<br>`ui-components` (#391, 8 次) |
| 104 | 格式差异 | `ui-kit` (#471) | `ui-kit` (#471, 41 次)<br>`uikit` (#435, 1 次) |
| 105 | 单复数 | `vector` (#1202) | `vector` (#1202, 7 次)<br>`vectors` (#1432, 1 次) |
| 106 | 格式差异 | `walletconnect` (#9364) | `wallet-connect` (#9670, 1 次)<br>`walletconnect` (#9364, 3 次) |
| 107 | 单复数 | `wallpaper` (#597) | `wallpaper` (#597, 2 次)<br>`wallpapers` (#8502, 1 次) |
| 108 | 缩写/全称或产品别名 | `wasm` (#6246) | `wasm` (#6246, 2 次)<br>`webassembly` (#6581, 1 次) |
| 109 | 单复数 | `web-api` (#1380) | `web-api` (#1380, 10 次)<br>`web-apis` (#2718, 1 次) |
| 110 | 单复数 | `web-app` (#1591) | `web-app` (#1591, 14 次)<br>`web-apps` (#7881, 1 次) |
| 111 | 单复数 | `web-components` (#77) | `web-component` (#3379, 4 次)<br>`web-components` (#77, 13 次) |
| 112 | 单复数 | `web-fonts` (#888) | `web-fonts` (#888, 2 次)<br>`webfont` (#894, 1 次) |
| 113 | 格式差异 | `webscraping` (#2969) | `web-scraping` (#4409, 4 次)<br>`webscraping` (#2969, 4 次) |
| 114 | 单复数 | `web-workers` (#4484) | `web-worker` (#2632, 1 次)<br>`web-workers` (#4484, 2 次) |
| 115 | 单复数 | `website` (#8331) | `website` (#8331, 3 次)<br>`websites` (#27, 1 次) |
| 116 | 单复数 | `websocket` (#7077) | `websocket` (#7077, 1 次)<br>`websockets` (#6559, 1 次) |
| 117 | 格式差异；缩写/全称或产品别名 | `wechat-mini-program` (#5811) | `wechat-mini-program` (#5811, 2 次)<br>`wechat-miniprogram` (#971, 9 次) |
| 118 | 单复数 | `workflow` (#1197) | `workflow` (#1197, 8 次)<br>`workflows` (#10328, 1 次) |

## 意思相近、待人工确认

| 序号 | 候选 tag（ID、引用次数） | 判断说明 |
|---:|---|---|
| 1 | `chinese-number` (#3252, 2 次)<br>`chinese2number` (#3253, 1 次) | 含义接近，后者可能是具体库名；确认书签内容后再合并 |
| 2 | `free-books` (#8596, 1 次)<br>`free-ebooks` (#8516, 1 次) | 免费书籍与免费电子书高度重叠，但纸书/电子书范围可能不同 |
| 3 | `programming-books` (#8628, 3 次)<br>`programming-ebooks` (#8636, 1 次) | 编程书与编程电子书高度重叠，介质范围可能不同 |
| 4 | `vagmi` (#9497, 1 次)<br>`wagmi` (#9485, 2 次) | vagmi 很可能是 wagmi 的拼写错误 |
| 5 | `code-formatter` (#5860, 1 次)<br>`code-formatting` (#5892, 1 次)<br>`formatter` (#7926, 2 次)<br>`formatting` (#4762, 4 次) | 概念相近，但通用格式化与代码格式化的范围不同 |
| 6 | `documentation` (#222, 76 次)<br>`technical-documentation` (#7985, 1 次)<br>`code-documentation` (#1868, 2 次) | 同属文档概念，后两者是更具体的子类 |
| 7 | `image-generation` (#580, 19 次)<br>`text-to-image` (#10590, 2 次) | 高度相关，但图像生成不一定仅由文本驱动 |
| 8 | `translation` (#1698, 9 次)<br>`translator` (#6593, 1 次) | 行为与工具的区别，可按标签体系偏好决定是否统一 |
| 9 | `linting` (#4763, 14 次)<br>`linter` (#8067, 1 次)<br>`eslint` (#5867, 7 次)<br>`tslint` (#5873, 2 次) | 用途相近，但 eslint/tslint 是具体且不同的工具 |
| 10 | `node` (#3050, 38 次)<br>`nodejs` (#1303, 27 次)<br>`node-js` (#5118, 2 次) | node 可能指图节点，也可能指 Node.js；需检查 node 标签书签 |
| 11 | `authorization` (#7610, 1 次)<br>`auth` (#2578, 4 次)<br>`authentication` (#1969, 14 次) | 认证与授权不是同义词；auth 可能混用，需按书签内容拆分 |
| 12 | `ci-cd` (#5021, 4 次)<br>`continuous-integration` (#5023, 2 次)<br>`continuous-deployment` (#5022, 1 次) | CI/CD 是后二者的组合概念，不建议未经检查直接合并 |

## 已排除的典型误报

- `http` 与 `https`：字符只差一个 `s`，但协议含义不同。
- `nestjs` 与 `nextjs`：拼写接近，但属于不同框架。
- `mysql` 与 `mssql`：拼写接近，但属于不同数据库。
- `openai` 与 `openapi`：拼写接近，但含义不同。
- `callback` 与 `fallback`：拼写接近，但概念不同。
- `iframe` 与 `aframe`：拼写接近，但技术不同。

## 后续修改时的核对基线

建议实际合并时以组为单位进行，并保留操作日志。每组至少核对：

1. 建议保留的 tag ID 仍存在。
2. 被合并 ID 的书签关联数与本文档记录相比是否发生变化。
3. 将 `bookmark_tags` 关联迁移到保留 ID 时避免主键冲突。
4. 删除旧 tag 后重建或更新书签全文检索中的 tag 文本。
5. 合并后复查该组旧名称已不存在，书签数量没有减少。

本文档是 2026-07-30 的静态快照；数据库发生新增、导入或批量编辑后，应重新审计。

## 执行记录

- 执行时间：2026-07-30 20:50（Asia/Shanghai）
- 执行范围：上文 118 组高置信度候选
- 执行映射：`scripts/tag-merge-map.sql`
- 执行状态：已合并
- 暂缓范围：12 组“意思相近、待人工确认”候选，未修改
- 合并旧 tag：124 个
- tag 数量：3043 → 2919
- 书签数量：2151 → 2151
- FTS5 行数：2151 → 2151
- 关联数量：11177 → 11151；减少的 26 条是同一书签同时关联旧、新 tag 时去除的重复关系
- 备份：`/Users/gyf/MyLib/bkmrx-app/backups/bookmarks-before-tag-merge-20260730-204321.db`
- 备份 SHA-256：`a8b3bc97750177e670121cd06975edb2919f44459ca53bcefc1ddbe321e9abb7`
- 备份保留策略：等待用户确认后才能删除
- 校验结果：SQLite 完整性、书签数据、精确关联集合、tag 集合、FTS 行覆盖及 FTS tag 文本全部通过
