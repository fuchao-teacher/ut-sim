# 直探头课堂 UT 仿真 webapp

Vite + Three.js 超声检测（UT）直探头仿真培训系统。

## 技术栈

- Vite 8.x
- Three.js 0.186
- KaTeX (数学公式渲染)

## 快速开始

```bash
npm install
npm run dev
```

## 构建说明

完整构建需要以下外部目录（未包含在此仓库中）：

- `../knowledge/` — 课程知识 JSON 数据
- `../contracts/` — 合约/规范 JSON 文件
- `../assets/` — 3D 模型 GLB 文件
- `../../paut_tofd_teaching_v1/` — 相控阵/TOFD 教学模块

仅 CSS/JS 源代码可在此仓库中开发和审查。完整运行需要父项目的完整资源树。

## 媒体文件说明

大型教学视频 `angle-structure.mp4` (~32MB) 未包含在此仓库中。媒体文件存放于：

- `public/media/`
- `src/angle/assets/`

如需完整媒体资源，请在本地添加后使用。

## 设计系统

Phase A/B 引入了统一的设计令牌系统：

- `src/ui/tokens.css` — 核心设计令牌（颜色、间距、排版、阴影）
- `docs/ui-upgrade.md` — 设计规范文档

### 设计约束

以下系统在 UI 升级中保持不变：

- 评分逻辑 (`scoring.js`, `studyscore.js`, `taskscore.js`)
- 声学/物理引擎 (`physics.js`, `waveform.js`)
- DeepSeek 集成 (`deepseek.js`)
- 导出格式 (UTreport, UTweld)
- Three.js 场景结构

详见 `docs/ui-upgrade.md`。

## 标签说明

- `pre-upgrade` — Phase A/B 布局升级前的基线版本

## 后续计划

- Phase A/B — 设计令牌 + 布局统一 (当前分支)
- Phase C — GSAP 动画集成 (计划中)
