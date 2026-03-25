# GITADORA Song Browser

根据设计手册初始化的移动端项目骨架，当前技术栈与手册保持一致：

- Vue 3
- TypeScript
- Vite
- Capacitor
- Android

## 目录说明

- `src/`: Vue 前端源码
- `android/`: Capacitor 生成的 Android 原生工程
- `capacitor.config.ts`: Capacitor 配置

## 已安装依赖

- `vue`
- `vue-router`
- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run android:sync
npm run android:open
```

在当前 Windows PowerShell 环境里，如果直接执行 `npm` / `npx` 被执行策略拦截，请改用：

```bash
npm.cmd install
npm.cmd run dev
npx.cmd cap sync android
```

## 环境要求

- Node.js
- npm
- Android Studio
- Android SDK
- JDK

## 当前状态

项目基础环境已完成，已具备：

- Web 端开发能力
- Capacitor Android 容器
- 后续接入曲库数据与页面开发的基础结构
