# 理科学习平台（study-hub）

为高中生理科生打造的**纯静态网页学习平台**，零服务器、零后端，可直接托管到 GitHub Pages。
家里用电脑、学校用手机，数据存浏览器本地，通过「导出 / 导入 JSON」在两端同步。

## 功能模块
- **首页**：今日学习概览、科目入口、今日计划、快捷入口
- **知识地图**：科目 → 章节 → 知识点三级体系，可标记掌握度、收藏、搜索、AI 讲解
- **题库练习**：按知识点组卷，客观题自动判分，错题自动进入错题本
- **错题本**：自动归集，按艾宾浩斯间隔复习（1/2/4/7/15/30 天），可改错因、AI 诊断
- **公式速查**：分科公式手册，可搜索、收藏、复制
- **学习计划**：日计划增删、番茄钟专注、连续打卡
- **数据看板**：累计时长 / 题量 / 正确率、近 7 天趋势、薄弱点雷达
- **AI 助手**：浏览器直连大模型，提供错题诊断 / 知识点讲解 / 智能出题（Key 仅存本地）

## 本地预览
直接双击 `index.html` 即可在浏览器打开（无需服务器）。
> 说明：Service Worker 仅在 https（含 GitHub Pages）下生效，本地双击打开时离线缓存不启用，不影响功能。

## 部署到 GitHub Pages
1. 在 GitHub 新建仓库（如 `study-hub`），把本文件夹全部内容推送上去。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 `Deploy from a branch`，分支选 `main` / `master`，目录选 `/ (root)`。
3. 稍等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/` 即可。
4. 手机浏览器打开同一地址，点右上角菜单「添加到主屏幕」，即可像 App 一样全屏使用。

## 跨设备同步（手机 ↔ 电脑）
本平台无服务器，数据默认只存在当前浏览器。换设备时：
1. 旧设备「设置 → 导出数据」下载一个 JSON；
2. 新设备「设置 → 导入数据」选该文件即可。
也可只导出「错题本」单独备份。

## 扩充学习内容（父子共建）
所有知识点、公式、例题都在 **`assets/js/data.js`** 里，按相同格式增删即可，**无需改代码**：
- `map[科目]`：章节 `kps` 数组，每个知识点含 `name / concept / formula / pit（易错）/ example`
- `formulas`：公式列表 `subject / cat / name / expr / note`
- `questions`：例题 `subject / chapter / kp / type:'choice' / q / options / answer(正确项下标) / explain`

> 例：新增一道物理题，往 `questions` 数组加一项，保证 `kp` 与 `map.physics` 里某知识点 `id` 对应即可。

## AI 助手配置与注意
1. 打开「AI 助手」页，选服务商预设（OpenAI / DeepSeek / Moonshot / 自定义），填接口地址、模型名、API Key。
2. Key 只存在本机浏览器 `localStorage`，不会上传到任何服务器。
3. **CORS 提示**：部分厂商（如 OpenAI 官方）默认禁止浏览器跨域调用，可能报网络错误。可选方案：
   - 使用支持浏览器 CORS 的端点；或
   - 自建一个极简转发代理（任意云函数）转发请求，把代理地址填到「接口地址」。

## 目录结构
```
study-hub/
├─ index.html              # 应用外壳
├─ sw.js                   # 离线缓存（Service Worker）
├─ assets/
│  ├─ css/style.css        # 浅色护眼主题、响应式
│  ├─ manifest.webmanifest # PWA 配置
│  ├─ img/icon.svg         # 图标
│  └─ js/
│     ├─ data.js           # 种子内容（科目/知识/公式/例题）
│     └─ app.js            # 全部逻辑（状态/路由/模块/AI/同步）
└─ README.md
```
