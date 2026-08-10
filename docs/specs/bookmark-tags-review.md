# 书签标签整理候选清单

> 生成日期：2026-08-10  
> 数据源：本机 `com.bkmrx` 的 SQLite 数据库（只读分析）  
> 范围：2,173 条书签、2,919 个已使用标签

## 结论摘要

- 1,805 个标签只出现 1 次，占全部标签的 61.8%，标签体系存在明显的低复用问题。
- 当前只有 `中文`、`云程` 两个中文标签，且都只出现 1 次；绝大多数通用概念仍使用英文。
- 建议先处理三批高置信度候选：异常长度的单例标签、仅指向某个站点/产品的单例标签、拼写或单复数近似标签。
- 本文只是审核清单，不代表应直接批量删除或合并。产品名仍可能是有效检索词，执行前应结合对应书签标题确认。

## 1. 只出现 1 次且不适合作为常用搜索词

### 1.1 长度异常

这些标签只出现 1 次，并且过短、语义不完整，或过长到更像描述而不是检索标签。

| 标签 | 问题 | 建议 |
| --- | --- | --- |
| `frontend-book-recommendations` | 过长，像书签描述 | 合并为 `前端` + `书籍`，具体内容放标题或备注 |
| `human-interface-guidelines` | 过长，也是文档专名 | 视内容保留 `Apple`，资源类型统一为 `文档` |
| `persistent-data-structures` | 过长且使用一次 | 合并为 `数据结构` |
| `exploratory-data-analysis` | 过长且使用一次 | 合并为 `数据分析` |
| `0x` | 极短、歧义大 | 若指 0x Protocol 则改为完整产品名，否则删除 | 删除
| `du` | 极短、歧义大 | 改为完整概念或删除 | 删除
| `fd` | 极短、歧义大 | 若指 fd 命令则保留产品名，否则删除 | 保留
| `h5` | 极短、中文语境中尚可识别 | 可统一为 `移动 Web`，或在前端语境中保留 | 保留
| `ip` | 极短但属于明确技术概念 | 可保留；不要仅因长度自动删除 | 保留
| `ky` | 极短、歧义大 | 若指 Ky HTTP 客户端则保留，否则删除 | 删除
| `v3` | 仅版本号，脱离上下文无意义 | 删除，版本信息放标题或备注 | 保留
| `v8` | 可能指 V8 引擎 | 若确指引擎则改为 `V8`，否则删除 | 保留
| `vh` | CSS 单位，过细且仅一次 | 合并为 `CSS` | 保留
| `vm` | 极短、歧义大 | 改为 `虚拟机` 或删除 | 改为虚拟机
| `vw` | CSS 单位，过细且仅一次 | 合并为 `CSS` | 保留
| `zk` | 可能指零知识证明 | 改为 `零知识证明`，避免缩写歧义 | 零知识证明
| `zx` | 可能指 Google zx | 若确指产品则改为 `Google zx`，否则删除 | 删除
| `中文` | 语言属性过宽且只出现一次 | 若需要语言筛选，统一建立 `中文内容`；否则删除 | 中文内容
| `云程` | 含义不明 | 人工核对来源后改名或删除，不自动翻译 | 删除

### 1.2 仅指向单一站点或产品的单例标签

下列标签均只出现 1 次，且名称与该书签域名或产品名高度吻合。它们通常不适合进入长期标签体系；优先保留领域标签和资源类型，把产品名留在标题中。

| 标签 | 对应站点/产品 | 建议归并方向 |
| --- | --- | --- |
| `21st-dev` | 21st.dev | `组件库` / `前端` |
| `aicodewith` | aicodewith.com | `人工智能` / `教程` |
| `alova` | alova.js.org | `请求库` / `JavaScript` |
| `amexio` | Amexio | `组件库` |
| `any-router` | AnyRouter | `网络` / `工具` |
| `apeboard` | ApeBoard | `DeFi` / `工具` |
| `art-design-pro` | Art Design Pro | `后台模板` |
| `awcloud` | AWCloud | `云服务` |
| `bnbproject` | BNB Project | `区块链` |
| `chain-fm` | Chain.fm | `区块链` |
| `chain-insight` | Chain Insight | `区块链` / `数据分析` |
| `chaintool` | ChainTool | `区块链` / `工具` |
| `code2ai` | Code2AI | `人工智能` / `开发工具` |
| `codenews` | CodeNews | `资讯` / `开发` |
| `coincarp` | CoinCarp | `加密货币` / `数据` |
| `coinsniper` | CoinSniper | `加密货币` / `数据` |
| `compodoc` | Compodoc | `文档生成` / `Angular` |
| `crxjs` | CRXJS | `浏览器扩展` |
| `dappbay` | DappBay | `DApp` / `区块链` |
| `dnslink` | DNSLink | `网络` |
| `dummy-image` | DummyImage | `图片工具` |
| `easy-table` | ngx-easy-table | `表格` / `Angular` |
| `embark` | Embark | `区块链` / `框架` |
| `ethplorer` | Ethplorer | `区块链浏览器` |
| `favicon-fetcher` | favicon.im | `图标` / `在线工具` |
| `favicon-generator` | favicon.io | `图标` / `在线工具` |
| `flux` | Flux Pro | `模板` |
| `gea` | GEA.js | `JavaScript` |
| `gpt-pro` | GetGPT Pro | `人工智能` / `工具` |
| `gptsapi` | GPTsAPI | `人工智能` / `API` |
| `grid-manager` | GridManager | `表格` / `JavaScript` |
| `hapigo` | HapiGo | `效率工具` |
| `imgse` | imgse.com | `图片工具` |
| `ipidea` | IPIDEA | `代理` / `网络` |
| `jigsaw` | Jigsaw | `组件库` |
| `jointjs` | JointJS | `图表` / `JavaScript` |
| `leonardo-ai` | Leonardo AI | `图像生成` / `人工智能` |
| `liquid-network` | Liquid Network | `区块链` |
| `lite-xl` | Lite XL | `编辑器` |
| `loon` | Loon | `代理` / `网络` |
| `mafs` | Mafs | `数学` / `可视化` |
| `magic-ui` | Magic UI | `组件库` |
| `mesh-gradient` | Mesh Gradients | `渐变` / `设计工具` |
| `meteora` | Meteora | `DeFi` |
| `n1n-ai` | n1n.ai | `人工智能` / `工具` |
| `obsidian-hub` | Obsidian Hub | `Obsidian` / `资源合集` |
| `overapi` | OverAPI | `速查表` / `参考资料` |
| `papanasi` | Papanasi | `组件库` |
| `perpetual-contracts` | Perp | `DeFi` / `永续合约` |
| `pinksale` | PinkSale | `加密货币` / `平台` |
| `pretty-diff` | Pretty Diff | `代码格式化` / `在线工具` |
| `qr-code-generator` | QR Code Generator | `二维码` / `在线工具` |
| `react-bits` | React Bits | `React` / `组件库` |
| `react-rainbow` | React Rainbow | `React` / `组件库` |
| `revoke-cash` | Revoke.cash | `区块链安全` / `工具` |
| `rxweb` | RxWeb | `Angular` / `框架` |
| `shoelace` | Shoelace | `组件库` |
| `slowmist` | SlowMist Hacked | `区块链安全` |
| `smart-html-elements` | Smart HTML Elements | `组件库` |
| `spl-token` | SPL Token Faucet | `Solana` / `工具` |
| `state-of-css` | State of CSS | `CSS` / `报告` |
| `themis` | Themis | `DeFi` |
| `trueblocks` | TrueBlocks | `区块链` / `数据` |
| `uiverse` | Uiverse | `组件库` |
| `uncx` | UNCX | `DeFi` |
| `vagmi` | Vagmi | `人工智能` / `工具` |
| `whalesmarket` | Whales Market | `加密货币` / `市场` |
| `xscan` | XScan | `区块链浏览器` |

以下单例虽然也是产品名，但属于较常见且可能有独立检索价值的技术名词，不建议仅凭“只出现一次”删除：`Airtable`、`Astro`、`Biome`、`Chainlink`、`CodeMirror`、`Coursera`、`Docusaurus`、`Elixir`、`Elm`、`Ethers`、`Fabric.js`、`Flowbite`、`GSAP`、`Handlebars`、`Immer`、`Lodash`、`Lucide`、`Medusa`、`NumPy`、`OpenCV`、`Parcel`、`Perplexity`、`Polkadot`、`Remix`、`Reddit`、`Shadcn Vue`、`StackBlitz`、`Stencil`、`StyleX`、`Substrate`、`Tamagui`、`TanStack`、`Typeform`、`Undraw`、`Uppy`。

## 2. 有明确中文翻译但尚未使用

数据库中没有发现下表“建议中文名”的现有标签。优先处理高频标签能最快改善标签栏的一致性。

| 现有标签 | 次数 | 建议中文名 |
| --- | ---: | --- |
| `tool` | 477 | `工具` |
| `library` | 435 | `代码库` |
| `blog` | 349 | `博客` |
| `reference` | 306 | `参考资料` |
| `tutorial` | 241 | `教程` |
| `component-library` | 128 | `组件库` |
| `documentation` | 76 | `文档` |
| `plugin` | 67 | `插件` |
| `animation` | 64 | `动画` |
| `web` | 53 | `Web` |
| `open-source` | 50 | `开源` |
| `template` | 48 | `模板` |
| `security` | 44 | `安全` |
| `playground` | 42 | `演练场` |
| `ui-kit` | 42 | `UI 套件` |
| `blockchain` | 41 | `区块链` |
| `performance` | 41 | `性能` |
| `proxy` | 36 | `代理` |
| `image-processing` | 34 | `图像处理` |
| `article` | 30 | `文章` |
| `free` | 29 | `免费` |
| `snippet` | 29 | `代码片段` |
| `table` | 29 | `表格` |
| `automation` | 28 | `自动化` |
| `form` | 28 | `表单` |
| `framework` | 28 | `框架` |
| `guide` | 28 | `指南` |
| `resource` | 28 | `资源` |
| `online` | 27 | `在线` |
| `testing` | 27 | `测试` |
| `design` | 26 | `设计` |
| `editor` | 26 | `编辑器` |
| `component` | 25 | `组件` |
| `platform` | 24 | `平台` |
| `chart` | 23 | `图表` |
| `collection` | 23 | `合集` |
| `browser` | 22 | `浏览器` |
| `cheatsheet` | 22 | `速查表` |
| `book` | 21 | `书籍` |
| `cross-platform` | 21 | `跨平台` |
| `smart-contracts` | 21 | `智能合约` |
| `configuration` | 20 | `配置` |
| `image-generation` | 20 | `图像生成` |
| `mobile` | 20 | `移动端` |
| `code-generation` | 19 | `代码生成` |
| `low-code` | 19 | `低代码` |
| `online-tool` | 19 | `在线工具` |
| `state-management` | 19 | `状态管理` |
| `authentication` | 15 | `身份认证` |
| `code-editor` | 14 | `代码编辑器` |
| `frontend` | 12 | `前端` |
| `cryptocurrency` | 12 | `加密货币` |
| `color` | 11 | `颜色` |

以下应保留原文，不纳入汉化：语言、框架、协议和品牌专名，例如 `JavaScript`、`React`、`Angular`、`CSS`、`Vue`、`Ethereum`、`TypeScript`、`Node.js`、`GitHub`、`Solana`、`Linux`、`API`、`CLI`、`LLM`。

## 3. 明显相似或可统一的标签

### 3.1 高置信度合并

| 现有标签 | 次数 | 建议统一为 | 原因 |
| --- | ---: | --- | --- |
| `aliases` | 1 | `alias`（1） | 单复数 |
| `bugs` | 1 | `bug`（2） | 单复数 |
| `courses` | 1 | `course`（4） | 单复数 |
| `gpts` | 1 | `gpt`（7） | 单复数；也可进一步核对是否都指自定义 GPT |
| `node` | 38 | `Node.js` | 与 `nodejs`（29）指向同一运行时的概率高 |
| `nodejs` | 29 | `Node.js` | 统一标准写法 |
| `browser-extension` | 5 | `浏览器扩展` | 与 `chrome-extension`（10）上位概念一致 |
| `chrome-extension` | 10 | `浏览器扩展` | 若确需区分浏览器，再保留 Chrome 属性 |
| `image-editing` | 3 | `图像处理` | 可并入 `image-processing`（34） |
| `palette` | 1 | `颜色` | 可并入 `color`（11）或中文统一名 |

### 3.2 需要人工确认后统一

| 相似标签组 | 次数 | 建议 |
| --- | --- | --- |
| `tool` / `online-tool` | 477 / 19 | 不直接互并；分别统一为 `工具` / `在线工具` |
| `library` / `component-library` | 435 / 128 | `library` 过宽；组件类统一为 `组件库`，其余按语言或用途归类 | 
| `component` / `ui-component` / `component-library` / `ui-kit` | 25 / 21 / 128 / 42 | 可收敛为 `组件`、`组件库` 两级；`UI 套件` 是否独立取决于实际内容 |
| `blog` / `article` | 349 / 30 | 一个是站点类型、一个是内容类型，不宜自动合并；可统一成资源类型规则 |
| `reference` / `documentation` / `document` | 306 / 76 / 3 | `document` 优先并入 `文档`；`参考资料` 与官方文档仍建议区分 |
| `guide` / `tutorial` / `course` | 28 / 241 / 4 | 均属学习资源，但颗粒度不同；可统一为 `教程`，或保留 `课程` |
| `editor` / `code-editor` | 26 / 14 | 代码编辑器并入 `编辑器`，除非需要区分图片/文本编辑器 |
| `crypto` / `cryptocurrency` | 27 / 12 | 若 `crypto` 都指数字货币，可统一为 `加密货币`；先排除密码学内容 |
| `http` / `https` | 5 / 3 | 不是单复数；若只是 Web 协议资料，可统一为 `HTTP` |
| `api` / `plugin` / `resource` | 34 / 67 / 28 | 都是宽泛资源类型，但语义不同，不建议因为共现而合并 |

## 建议处理顺序

1. 先删除或改名“长度异常”中的无意义单例，如 `v3`、`du`、`vm`。
2. 将站点/产品型单例改为可复用的领域与资源类型标签；常见技术专名保留。
3. 先执行高置信度的单复数和标准写法合并。
4. 批量汉化高频通用标签；产品、语言、框架、协议名称保持原文。
5. 最后复核语义相近但不等价的组，避免把 `blog` 与 `article`、`reference` 与 `documentation` 等误合并。

## 判定口径

- “只出现 1 次”按标签关联的书签数统计，而不是标签表中的记录数。
- “产品型单例”通过标签名与其唯一书签的域名/产品名一致性筛选，再人工排除常见且值得独立检索的技术名词。
- “明确中文翻译”只覆盖通用概念；专有名词、缩写和可能存在多义性的词不自动翻译。
- “相似标签”只给出候选统一方向。语义相关不等于语义相同，批量变更前仍需查看对应书签。
