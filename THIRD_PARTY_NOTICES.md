# 第三方依赖与来源

SimHub Phone 桌面端本体以 [MIT License](LICENSE) 开源；本文件记录所包含的第三方开源组件与版权声明，对外分发安装包时应保留本说明及对应依赖许可文本。

| 依赖 | 版本 | 许可证 / 来源 |
|---|---|---|
| React / React DOM | 19.2.8 | MIT |
| @tanstack/react-query | 5.105.3 | MIT；已核对包内 `LICENSE` |
| SIP.js | 0.21.2 | MIT；已核对包内 `LICENSE.md` |
| Base UI | 1.9.0 | MIT；已核对包内 `LICENSE` |
| coss ui 安装的基础组件 | registry 安装版本，以提交文件为准 | 官方 `apps/ui` 子目录的 MIT 授权；见下文 |
| Lucide React | 1.62.0 | ISC |
| clsx / class-variance-authority / tailwind-merge | 2.1.1 / 0.7.1 / 3.7.0 | MIT |
| Tailwind CSS / Vite 插件 | 4.3.3 | MIT |
| tw-animate-css | 1.4.0 | MIT |
| Vite / React 插件 | 8.3.0 / 6.1.1 | MIT |
| TypeScript | 6.0.2 | Apache-2.0 |
| Tauri CLI | 2.10.1 | Apache-2.0 OR MIT |
| Tauri JavaScript API | 2.12.4 | Apache-2.0 OR MIT；官方窗口与事件绑定 |
| Tauri / tauri-build | 2.12.5 / 2.7.4 | Apache-2.0 OR MIT；官方 metadata 标注最低 Rust 1.90 |

coss ui 组件通过 `bunx --bun shadcn@latest add @coss/button @coss/input @coss/label @coss/dialog @coss/select @coss/slider -y` 安装；依赖自动带入 Spinner 与 ScrollArea。界面重构又通过同一 CLI 安装了 `@coss/tooltip` 和 `@coss/kbd`，没有新增 npm 包。官方 registry 为 `https://coss.com/ui/r/{name}.json`。上游仓库是混合许可证，不能把整站代码视为 MIT；本次只使用 UI 组件，已核对其[固定提交的 MIT 子目录说明](https://github.com/cosscom/coss/blob/19620ae8cae81e30775f2cde03829326cb4916b2/LICENSING.md)，没有使用网站、平台或 SDK 业务代码。当前上游主分支的旧路径已变更，记录固定链接保留审查依据。

首版检查本机安装图的 59 个 JS 包与 Windows 目标下 243 个 Rust 第三方包的许可证声明，均有声明，未发现 GPL / AGPL 声明。收尾新增 Tauri JavaScript API，已核对 Apache-2.0 OR MIT 声明；未增加 Rust 依赖。Windows Rust 审查不代表已审查其他平台所有可选依赖。

收尾及号码管理界面重构使用同一官方 CLI 安装了 `@coss/checkbox`、`@coss/badge`、`@coss/card`、`@coss/tabs`、`@coss/textarea`、`@coss/collapsible`、`@coss/alert`、`@coss/empty`、`@coss/separator`、`@coss/switch`（自动带入 `segmented-control`），没有新增 npm 包，只按主题定制语义颜色。窗口集成仅使用 Tauri 官方 API，没有引入其他桌面插件。

其中 Lightning CSS 两个 JS 包，以及 Rust 的 cssparser、cssparser-macros、dtoa-short、option-ext、selectors 为 **MPL-2.0**；使用原包，没有修改其源码。其他声明包含 MIT、Apache-2.0、BSD、ISC、Zlib、Unicode-3.0、CC0 / Unlicense 等。原始版权和许可证仍在对应依赖包中；对外分发时需随实际分发依赖保留其版权、许可文本，并满足 MPL 的相应要求，不能只保留本清单。

官方来源：[SIP.js](https://github.com/onsip/SIP.js/tree/0.21.2)、[Base UI](https://github.com/mui/base-ui)、[coss ui](https://coss.com/ui)、[Tauri](https://github.com/tauri-apps/tauri)、[Tauri 版本 metadata](https://crates.io/crates/tauri/2.12.5)。
