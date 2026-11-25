# SimHub Phone Desktop

<p align="center">
  <img src="src/assets/icon.svg" width="96" height="96" alt="SimHub Phone" />
</p>

基于 **React 19 + TypeScript + SIP.js + Tauri 2** 构建的跨平台桌面端与 Web 标准 SIP / WebRTC 软电话客户端（支持 Windows、macOS、Linux）。

## 核心特性

- **标准协议栈**：SIP over WSS（`wss://.../sip`，仅回环开发允许 `ws://`）+ WebRTC（SRTP / STUN / TURN ICE 穿透）。
- **开箱即用配网导入**：支持一键粘贴配网链接（`/api/v1/provisioning/{token}`）、XML / `linphonerc` / JSON 配置文本或手动 SIP 账号（支持 Digest `HA1` 或密码与 Auth ID）。
- **多号池管理**：支持多号码分组备注、默认出局主叫切换、单路通话占麦互斥与同振提示。
- **完整通话体验**：DTMF 拨号、通话保持（re-INVITE）、音视频设备选择、自定义 30 秒来电铃声剪辑、托盘常驻与桌面紧急来电弹窗通知。
- **最小凭据落盘**：`localStorage` 仅保留记住的非敏感配置（服务器、域名、账号名、公开 ICE 地址），SIP 密码与 `HA1` / TURN 凭据仅驻留进程内存。

## 本地开发与构建

前置要求：[Bun](https://bun.sh/)（>= 1.3）、[Rust](https://www.rust-lang.org/)（>= 1.90）以及 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
bun install --frozen-lockfile
bun test src/phone
bun run build
```

桌面端开发与打包：

```sh
bun run desktop:dev
bun run desktop:build
```

Linux（Debian/Ubuntu）系统构建依赖参考：

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev
```

## GitHub Actions CI/CD

- **CI（`.github/workflows/ci.yml`）**：每次 push 到 `main` 或发起 PR 时自动运行：
  - `bun test src/phone`（43 项核心单元测试）与 `tsc --noEmit && vite build`；
  - Linux 桌面端 `cargo check --manifest-path src-tauri/Cargo.toml`。
- **多端发版（`.github/workflows/release.yml`）**：推送版本 tag（如 `git tag v0.1.0 && git push origin v0.1.0`）或在 Actions 页面手动触发：
  - **Windows**（`windows-latest`）：NSIS 安装包（`.exe`）
  - **macOS**（`macos-latest`）：通用二进制镜像（`universal-apple-darwin` `.dmg`）
  - **Linux**（`ubuntu-22.04`）：`.deb` 与 `.AppImage`
  - 自动生成 `SHA256SUMS.txt` 并创建 GitHub Release。

## 开源协议与第三方声明

- 本项目以 **MIT License** 开源，详见 [LICENSE](LICENSE)。
- 第三方依赖许可证（含 MPL-2.0 等声明）详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
