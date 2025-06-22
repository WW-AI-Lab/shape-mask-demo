# Shape-Mask Crop Demo (Pure Front-End)

最小可运行示例：  
1. **上传任意透明 PNG** → 作为形状遮罩（mask）  
2. **上传任意图片** → 自动按遮罩裁剪  
3. 浏览器即时展示结果，无后端、无构建、零依赖

---

## 🗂️ 目录结构

```
shape-mask-demo/
├─ index.html      # 单页应用，直接双击即可运行
├─ app.js          # 全部逻辑：加载文件、Canvas 裁剪、结果预览
└─ style.css       # 简易样式
```

---

## 🚀 快速开始

1. **下载/克隆** 本仓库  
2. 直接双击 `index.html`（或用 VS Code Live Server / 任何静态服务器）  
3. 依次点击  
   - **Choose Mask (PNG with alpha)**  
   - **Choose Image**  
4. 页面立即显示裁剪后的预览，可右键“另存为”输出 PNG

> ✅ 支持任意分辨率、任意形状（圆形、星形、logo 等），完全跑在浏览器主线程。  
> 💡 若需批量处理或大尺寸图片，推荐迁移到 `OffscreenCanvas` + Web Worker，思路一致。

---

## 🔧 实现核心

```js
// 1) 读取文件为 <img>
function loadImg(file) {
  return new Promise(r => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => r(img);
  });
}

// 2) 组合到同尺寸 Canvas 并做 'destination-in' 裁剪
async function compose(maskFile, imgFile) {
  const [maskImg, srcImg] = await Promise.all([loadImg(maskFile), loadImg(imgFile)]);

  // 统一尺寸 = 取遮罩尺寸（也可按需缩放）
  const w = maskImg.width, h = maskImg.height;
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d');

  // 2.1 先绘原图（会被裁剪）
  ctx.drawImage(srcImg, 0, 0, w, h);
  // 2.2 改混合模式 -> destination-in 仅保留两者相交且 mask alpha>0 的像素
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskImg, 0, 0, w, h);

  return cvs;   // <canvas> 可直接放进 <img>、toBlob()、toDataURL()...
}
```

**关键点解释**

| 步骤 | 技术 | 备注 |
|------|------|------|
| 读取文件 | `URL.createObjectURL` | 零拷贝，释放记得 `URL.revokeObjectURL` |
| 裁剪 | `globalCompositeOperation = 'destination-in'` | 相当于 *source∧mask*；避免手写像素遍历 |
| 输出 | `canvas.toBlob(cb, 'image/png')` | 透明通道完整保存，可上传或下载 |

---

## 📝 index.html 摘要

```html
<input id="mask" type="file" accept="image/png">
<input id="src"  type="file" accept="image/*">
<canvas id="preview"></canvas>

<script type="module" src="app.js"></script>
```

浏览器支持：Chrome 61+、Edge 79+、Firefox 60+、Safari 11+  
（即几乎所有现代环境）

---

## 🛠️ 可扩展方向

| 需求 | 改动 |
|------|------|
| **保持原图宽高比** | 先算 `fitBox`，`drawImage` 时传 9-宫参数 |
| **任意多边形硬裁剪** | 预处理 mask → `ctx.clip()` + Path2D |
| **拖拽/旋转/缩放** | 用 `hammer.js` / `pinch-zoom` 自己监听手势，再变换画布 |
| **批量处理** | 把裁剪逻辑搬到 Web Worker，主线程只接收 Blob |

---

## 📄 License

MIT — 随意商用、改造，但别忘了点个 ⭐。
