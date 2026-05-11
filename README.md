

<p align="center">
  <img src="public/favicon.svg" alt="GD Data Logo" width="100" />
</p>

<h1 align="center">GD Data</h1> 
<p align="center">
  <strong>GITADORA 曲库查询、谱面浏览与成绩查看工具</strong>

>本项目98%由ai开发，本人只负责架构搭建、界面设计与素材收集，欢迎攻击批评指正

[![Mit License](https://img.shields.io/badge/License-MIT-orange)](LICENSE)
[![发布页面](https://img.shields.io/badge/发布页面-GD%20Data-purple)](https://gddata.selundine.top/)

##  功能特性

-  **曲库浏览** - 支持全版本曲库搜索、筛选和排序
-  **成绩查看** - 通过 BJMANIA 查看最佳成绩和最近游玩记录
-  **B50 展示** - 生成并导出 B50 成绩海报
-  **谱面预览** - DTX 文件解析，支持静态预览和实时滚动播放
-  **收藏系统** - 本地收藏喜欢的歌曲，快速访问
-  **RemyWiki** - 一键跳转Remywiki查看歌曲详细信息

##  技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3.5 + TypeScript 5.9 |
| 构建工具 | Vite 8.0 |
| 路由 | Vue Router 5.0 |
| 移动端 | Capacitor 8.2 |
| Android | Java 21 + Gradle 8.14 |

## 快速开始

### 环境要求

- **Node.js** 18+
- **npm** 9+
- **Android Studio**（仅 Android 开发需要）
- **JDK 21**（仅 Android 开发需要）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产版本

```bash
npm run build
```


## Android 开发

### 同步到 Android

```bash
npx cap sync android
```


### 在 Android Studio 中打开

```bash
npx cap open android
```

## 致谢与参考项目

- [BJMANIA](https://u.bjmania.com/) - 成绩数据来源
- [RemyWiki](https://remywiki.com) - 歌曲信息参考
- [MaimaiData](https://github.com/PaperPig/MaimaiData) - 本项目灵感来源与部分设计参考来源
- [DTXViewerTool](https://github.com/fisyher/dtxviewertool) - 谱面预览功能代码参考
- [DTXmaniaNX](https://github.com/limyz/DTXmaniaNX) - 部分美术资源参考

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

