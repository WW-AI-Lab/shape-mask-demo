/**
 * Shape-Mask 图片替换工具 - 主应用程序
 * 基于现有的形状遮罩裁剪技术，实现交互式图片替换功能
 */

// ===== 应用状态管理 =====
const AppState = {
    INITIAL: 'initial',
    MASK_LOADED: 'mask_loaded',
    TOOL_ACTIVE: 'tool_active',
    PROCESSING: 'processing',
    COMPLETED: 'completed'
};

// 全局应用状态
let currentState = AppState.INITIAL;
let maskImage = null;
let replaceImage = null;
let resultCanvas = null;
let currentScale = 1;
let isReplacing = false;
// 添加拖拽和位置相关状态
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let replaceOffsetX = 0;
let replaceOffsetY = 0;

// ===== 工具函数 =====
const Utils = {
    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 防抖函数
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * 显示加载状态
     */
    showLoading(text = '处理中...') {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.querySelector('.loading-text');
        loadingText.textContent = text;
        loadingOverlay.style.display = 'flex';
    },

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'none';
    }
};

// ===== 文件管理模块 =====
const FileManager = {
    /**
     * 加载图片文件为Image对象
     */
    async loadImageFile(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('无效的图片文件格式'));
                return;
            }

            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('图片加载失败'));
            };
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * 验证PNG文件格式
     */
    validatePNGFile(file) {
        if (!file.type.includes('png')) {
            throw new Error('请选择PNG格式的透明图片');
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB
            throw new Error('文件大小不能超过10MB');
        }
        return true;
    },

    /**
     * 验证图片文件格式
     */
    validateImageFile(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('请选择支持的图片格式 (JPG, PNG, GIF, WebP)');
        }
        if (file.size > 20 * 1024 * 1024) { // 20MB
            throw new Error('文件大小不能超过20MB');
        }
        return true;
    }
};

// ===== Canvas渲染模块 =====
const CanvasRenderer = {
    /**
     * 渲染遮罩图片到Canvas
     */
    renderMaskImage(image, canvas) {
        const ctx = canvas.getContext('2d');
        
        // 设置Canvas尺寸为图片尺寸
        canvas.width = image.width;
        canvas.height = image.height;
        
        // 清空Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 绘制图片
        ctx.drawImage(image, 0, 0);
        
        return canvas;
    },

    /**
     * 清空Canvas内容
     */
    clearCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    },

    /**
     * 调整Canvas显示尺寸（保持宽高比）
     */
    adjustCanvasSize(canvas, maxWidth = 400, maxHeight = 400) {
        const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
        
        canvas.style.width = (canvas.width * ratio) + 'px';
        canvas.style.height = (canvas.height * ratio) + 'px';
    }
};

// ===== 图像处理模块 =====
const ImageProcessor = {
    /**
     * 使用遮罩裁剪图片（支持缩放和位置偏移）
     */
    cropImageWithMask(maskImg, srcImg, scale = 1, offsetX = 0, offsetY = 0) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置Canvas尺寸为遮罩图片尺寸
        canvas.width = maskImg.width;
        canvas.height = maskImg.height;
        
        // 计算缩放后的替换图片尺寸和位置（包含偏移）
        const scaledWidth = srcImg.width * scale;
        const scaledHeight = srcImg.height * scale;
        const x = (canvas.width - scaledWidth) / 2 + offsetX;
        const y = (canvas.height - scaledHeight) / 2 + offsetY;
        
        // 绘制缩放后的替换图片
        ctx.drawImage(srcImg, x, y, scaledWidth, scaledHeight);
        
        // 使用destination-in混合模式，只保留遮罩形状内的内容
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskImg, 0, 0);
        
        // 恢复正常混合模式
        ctx.globalCompositeOperation = 'source-over';
        
        return canvas;
    },

    /**
     * 生成预览图
     */
    generatePreview(canvas, previewCanvas, size = 150) {
        const ctx = previewCanvas.getContext('2d');
        
        // 设置预览画布尺寸
        previewCanvas.width = size;
        previewCanvas.height = size;
        
        // 清空画布
        ctx.clearRect(0, 0, size, size);
        
        // 计算缩放比例
        const scale = Math.min(size / canvas.width, size / canvas.height);
        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;
        
        // 居中绘制
        const x = (size - scaledWidth) / 2;
        const y = (size - scaledHeight) / 2;
        
        ctx.drawImage(canvas, x, y, scaledWidth, scaledHeight);
    },

    /**
     * 预览替换效果（支持缩放和位置偏移）
     */
    previewReplaceWithScale(maskImg, srcImg, scale = 1, offsetX = 0, offsetY = 0) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置Canvas尺寸为遮罩图片尺寸
        canvas.width = maskImg.width;
        canvas.height = maskImg.height;
        
        // 计算缩放后的替换图片尺寸和位置（包含偏移）
        const scaledWidth = srcImg.width * scale;
        const scaledHeight = srcImg.height * scale;
        const x = (canvas.width - scaledWidth) / 2 + offsetX;
        const y = (canvas.height - scaledHeight) / 2 + offsetY;
        
        // 1. 绘制完整的替换图片（半透明）
        ctx.globalAlpha = 0.3;
        ctx.drawImage(srcImg, x, y, scaledWidth, scaledHeight);
        
        // 2. 创建遮罩区域的完整替换图片
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-atop';
        
        // 先绘制遮罩形状
        ctx.drawImage(maskImg, 0, 0);
        
        // 然后在遮罩区域绘制完整的替换图片
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(srcImg, x, y, scaledWidth, scaledHeight);
        
        // 恢复正常混合模式
        ctx.globalCompositeOperation = 'source-over';
        
        return canvas;
    },

    /**
     * 计算最佳适应缩放比例
     */
    calculateFitScale(maskImg, srcImg) {
        return Math.min(maskImg.width / srcImg.width, maskImg.height / srcImg.height);
    }
};

// ===== UI控制模块 =====
const UIController = {
    /**
     * 显示替换控制（右侧面板已一直显示，只需激活状态）
     */
    showReplaceControls() {
        // 右侧面板已经一直显示，只需要更新状态
        const replacePanel = document.getElementById('replace-panel');
        replacePanel.classList.add('active');
        
        currentState = AppState.TOOL_ACTIVE;
        this.updateStatus('请在右侧选择要替换的图片', 'info');
    },

    /**
     * 隐藏替换控制（重置右侧面板状态）
     */
    hideReplaceControls() {
        const replacePanel = document.getElementById('replace-panel');
        replacePanel.classList.remove('active');
    },

    /**
     * 显示缩放控制器
     */
    showScaleControls() {
        const scaleControls = document.getElementById('scale-controls');
        scaleControls.style.display = 'block';
        
        // 更新缩放值显示
        const scaleValue = document.getElementById('scale-value');
        const scaleSlider = document.getElementById('scale-slider');
        scaleSlider.value = currentScale;
        scaleValue.textContent = Math.round(currentScale * 100) + '%';
    },

    /**
     * 隐藏缩放控制器
     */
    hideScaleControls() {
        const scaleControls = document.getElementById('scale-controls');
        scaleControls.style.display = 'none';
    },

    /**
     * 重置替换工具面板
     */
    resetReplacePanel() {
        const previewSection = document.getElementById('preview-section');
        const applyBtn = document.getElementById('apply-btn');
        const replaceInput = document.getElementById('replace-input');
        
        previewSection.style.display = 'none';
        applyBtn.disabled = true;
        replaceInput.value = '';
        
        replaceImage = null;
    },

    /**
     * 更新状态显示
     */
    updateStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    },

    /**
     * 显示遮罩图片信息
     */
    showMaskInfo(file, image) {
        const maskInfo = document.getElementById('mask-info');
        const filename = document.getElementById('mask-filename');
        const size = document.getElementById('mask-size');
        const filesize = document.getElementById('mask-filesize');
        
        filename.textContent = `文件名: ${file.name}`;
        size.textContent = `尺寸: ${image.width} × ${image.height}`;
        filesize.textContent = `大小: ${Utils.formatFileSize(file.size)}`;
        
        maskInfo.style.display = 'block';
    },

    /**
     * 隐藏遮罩图片信息
     */
    hideMaskInfo() {
        const maskInfo = document.getElementById('mask-info');
        maskInfo.style.display = 'none';
    },

    /**
     * 启用/禁用控制按钮
     */
    toggleControlButtons(enabled) {
        const resetBtn = document.getElementById('reset-btn');
        const downloadBtn = document.getElementById('download-btn');
        
        resetBtn.disabled = !enabled;
        downloadBtn.disabled = !enabled;
    },

    /**
     * 显示替换图片信息
     */
    showReplaceInfo(file, image) {
        const replaceInfo = document.getElementById('replace-info');
        const filename = document.getElementById('replace-filename');
        const size = document.getElementById('replace-size');
        const filesize = document.getElementById('replace-filesize');
        
        filename.textContent = `文件名: ${file.name}`;
        size.textContent = `尺寸: ${image.width} × ${image.height}`;
        filesize.textContent = `大小: ${Utils.formatFileSize(file.size)}`;
        
        replaceInfo.style.display = 'block';
    },

    /**
     * 隐藏替换图片信息
     */
    hideReplaceInfo() {
        const replaceInfo = document.getElementById('replace-info');
        replaceInfo.style.display = 'none';
    },

    /**
     * 启用Canvas替换模式（半透明遮罩）
     */
    enableReplaceMode() {
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        canvasWrapper.classList.add('replace-mode');
    },

    /**
     * 禁用Canvas替换模式
     */
    disableReplaceMode() {
        const canvasWrapper = document.querySelector('.canvas-wrapper');
        canvasWrapper.classList.remove('replace-mode');
    }
};

// ===== 事件处理器 =====
const EventHandlers = {
    /**
     * 处理遮罩图片上传
     */
    async handleMaskUpload(file) {
        console.log('handleMaskUpload开始处理文件:', file);
        try {
            Utils.showLoading('加载遮罩图片...');
            console.log('显示加载动画');
            
            // 验证文件
            console.log('开始验证PNG文件');
            FileManager.validatePNGFile(file);
            console.log('PNG文件验证通过');
            
            // 加载图片
            console.log('开始加载图片');
            const image = await FileManager.loadImageFile(file);
            console.log('图片加载成功:', image.width, 'x', image.height);
            
            // 存储遮罩图片
            maskImage = image;
            console.log('遮罩图片已存储');
            
            // 渲染到Canvas
            const mainCanvas = document.getElementById('main-canvas');
            console.log('获取主Canvas:', mainCanvas);
            CanvasRenderer.renderMaskImage(image, mainCanvas);
            console.log('图片已渲染到Canvas');
            CanvasRenderer.adjustCanvasSize(mainCanvas);
            console.log('Canvas尺寸已调整');
            
            // 隐藏覆盖层
            const overlay = document.getElementById('canvas-overlay');
            overlay.classList.add('hidden');
            
            // 更新UI状态
            UIController.showMaskInfo(file, image);
            UIController.updateStatus('遮罩图片加载成功！点击图片开始替换', 'success');
            UIController.toggleControlButtons(true);
            
            currentState = AppState.MASK_LOADED;
            
        } catch (error) {
            UIController.updateStatus(`错误: ${error.message}`, 'error');
            console.error('遮罩图片上传失败:', error);
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * 处理替换图片上传（新的交互方式）
     */
    async handleReplaceUpload(file) {
        try {
            Utils.showLoading('加载替换图片...');
            
            // 验证文件
            FileManager.validateImageFile(file);
            
            // 加载图片
            const image = await FileManager.loadImageFile(file);
            
            // 存储替换图片
            replaceImage = image;
            isReplacing = true;
            
            // 计算最佳适应缩放
            currentScale = ImageProcessor.calculateFitScale(maskImage, replaceImage);
            
            // 显示替换图片信息
            UIController.showReplaceInfo(file, image);
            
            // 启用Canvas替换模式（半透明遮罩）
            UIController.enableReplaceMode();
            
            // 立即显示替换效果
            this.updateReplacePreview();
            
            // 显示缩放控制器
            UIController.showScaleControls();
            
            UIController.updateStatus('替换图片已加载！可以调整缩放比例', 'success');
            
            currentState = AppState.PROCESSING;
            
        } catch (error) {
            UIController.updateStatus(`错误: ${error.message}`, 'error');
            console.error('替换图片上传失败:', error);
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * 更新替换预览
     */
    updateReplacePreview() {
        if (!maskImage || !replaceImage) return;
        
        const canvas = document.getElementById('main-canvas');
        const previewCanvas = ImageProcessor.previewReplaceWithScale(
            maskImage, 
            replaceImage, 
            currentScale,
            replaceOffsetX,
            replaceOffsetY
        );
        
        // 将预览结果绘制到主Canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(previewCanvas, 0, 0);
        
        // 更新缩放值显示
        const scaleValue = document.getElementById('scale-value');
        scaleValue.textContent = `${Math.round(currentScale * 100)}%`;
    },

    /**
     * 处理缩放变化
     */
    handleScaleChange(newScale) {
        currentScale = newScale;
        this.updateReplacePreview();
        
        // 更新缩放值显示
        const scaleValue = document.getElementById('scale-value');
        scaleValue.textContent = Math.round(currentScale * 100) + '%';
    },

    /**
     * 生成预览对比图
     */
    generatePreviews() {
        const originalPreview = document.getElementById('original-preview');
        const resultPreview = document.getElementById('result-preview');
        
        // 生成原图预览
        const originalCanvas = document.createElement('canvas');
        CanvasRenderer.renderMaskImage(maskImage, originalCanvas);
        ImageProcessor.generatePreview(originalCanvas, originalPreview);
        
        // 生成替换后预览
        const processedCanvas = ImageProcessor.cropImageWithMask(maskImage, replaceImage);
        ImageProcessor.generatePreview(processedCanvas, resultPreview);
    },

    /**
     * 应用替换（生成最终结果）
     */
    async applyReplacement() {
        if (!maskImage || !replaceImage) {
            UIController.updateStatus('缺少必要的图片', 'error');
            return;
        }

        try {
            Utils.showLoading('正在生成最终结果...');
            
            // 生成最终裁剪结果（包含位置偏移）
            resultCanvas = ImageProcessor.cropImageWithMask(
                maskImage, 
                replaceImage, 
                currentScale,
                replaceOffsetX,
                replaceOffsetY
            );
            
            // 更新主Canvas显示最终结果
            const mainCanvas = document.getElementById('main-canvas');
            const ctx = mainCanvas.getContext('2d');
            ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            ctx.drawImage(resultCanvas, 0, 0);
            
            // 隐藏替换控制
            UIController.hideScaleControls();
            UIController.disableReplaceMode();
            
            // 更新状态
            currentState = AppState.COMPLETED;
            isReplacing = false;
            
            // 重置拖拽状态
            isDragging = false;
            dragStartX = 0;
            dragStartY = 0;
            replaceOffsetX = 0;
            replaceOffsetY = 0;
            
            UIController.updateStatus('替换完成！可以下载结果图片', 'success');
            UIController.toggleControlButtons(true);
            
            Utils.hideLoading();
        } catch (error) {
            console.error('应用替换失败:', error);
            UIController.updateStatus('应用替换失败: ' + error.message, 'error');
            Utils.hideLoading();
        }
    },

    /**
     * 取消替换操作
     */
    cancelReplacement() {
        // 恢复原始遮罩图片
        const mainCanvas = document.getElementById('main-canvas');
        CanvasRenderer.renderMaskImage(maskImage, mainCanvas);
        CanvasRenderer.adjustCanvasSize(mainCanvas);
        
        // 隐藏缩放控制器
        UIController.hideScaleControls();
        
        // 禁用Canvas替换模式
        UIController.disableReplaceMode();
        
        // 隐藏替换图片信息
        UIController.hideReplaceInfo();
        
        // 重置替换相关状态
        replaceImage = null;
        isReplacing = false;
        currentScale = 1;
        currentState = AppState.MASK_LOADED;
        
        // 重置拖拽状态
        isDragging = false;
        dragStartX = 0;
        dragStartY = 0;
        replaceOffsetX = 0;
        replaceOffsetY = 0;
        
        UIController.updateStatus('已取消替换，请重新选择替换图片', 'info');
    },

    /**
     * 重置整个应用
     */
    resetApp() {
        // 清空Canvas
        const mainCanvas = document.getElementById('main-canvas');
        CanvasRenderer.clearCanvas(mainCanvas);
        
        // 显示覆盖层
        const overlay = document.getElementById('canvas-overlay');
        overlay.classList.remove('hidden');
        
        // 隐藏缩放控制器
        UIController.hideScaleControls();
        
        // 禁用Canvas替换模式
        UIController.disableReplaceMode();
        
        // 隐藏信息面板
        UIController.hideMaskInfo();
        UIController.hideReplaceInfo();
        
        // 重置文件输入
        const maskInput = document.getElementById('mask-input');
        const replaceInput = document.getElementById('replace-input');
        maskInput.value = '';
        replaceInput.value = '';
        
        // 重置状态
        maskImage = null;
        replaceImage = null;
        isReplacing = false;
        currentScale = 1;
        currentState = AppState.INITIAL;
        
        // 重置拖拽状态
        isDragging = false;
        dragStartX = 0;
        dragStartY = 0;
        replaceOffsetX = 0;
        replaceOffsetY = 0;
        
        UIController.updateStatus('已重置，请重新上传遮罩图片开始使用', 'info');
        UIController.toggleControlButtons(false);
    },

    /**
     * 下载结果图片
     */
    downloadResult() {
        if (!resultCanvas && !maskImage) {
            UIController.updateStatus('没有可下载的图片', 'warning');
            return;
        }
        
        const canvas = resultCanvas || document.getElementById('main-canvas');
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shape-mask-result-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            UIController.updateStatus('图片下载完成', 'success');
        }, 'image/png');
    },

    /**
     * 设置拖拽上传
     */
    setupDragDrop() {
        const maskUploadArea = document.getElementById('mask-upload-area');
        const replaceUploadArea = document.getElementById('replace-upload-area');
        
        // 遮罩图片拖拽
        this.setupAreaDragDrop(maskUploadArea, (file) => {
            this.handleMaskUpload(file);
        });
        
        // 替换图片拖拽
        this.setupAreaDragDrop(replaceUploadArea, (file) => {
            this.handleReplaceUpload(file);
        });
    },
    
    setupAreaDragDrop(area, callback) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.classList.add('dragover');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.classList.remove('dragover');
            });
        });
        
        area.addEventListener('drop', (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                callback(files[0]);
            }
        });
    },

    /**
     * 检查点击是否在图片区域内
     */
    isClickOnImage(x, y, canvas) {
        const rect = canvas.getBoundingClientRect();
        return x >= 0 && x < rect.width && y >= 0 && y < rect.height;
    }
};

// ===== 应用初始化 =====
function initializeApp() {
    console.log('🎨 Shape-Mask 图片替换工具初始化...');
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 设置拖拽上传
    EventHandlers.setupDragDrop();
    
    // 初始化状态
    UIController.updateStatus('等待上传遮罩图片...', 'info');
    UIController.toggleControlButtons(false);
    
    console.log('✅ 应用初始化完成');
}

// ===== 事件绑定 =====
function bindEventListeners() {
    console.log('开始绑定事件监听器...');
    
    // 遮罩图片上传
    const maskInput = document.getElementById('mask-input');
    maskInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            EventHandlers.handleMaskUpload(file);
        }
    });

    // 替换图片上传
    const replaceInput = document.getElementById('replace-input');
    replaceInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            EventHandlers.handleReplaceUpload(file);
        }
    });

    // 缩放滑块
    const scaleSlider = document.getElementById('scale-slider');
    scaleSlider.addEventListener('input', (e) => {
        const newScale = parseFloat(e.target.value);
        EventHandlers.handleScaleChange(newScale);
    });

    // 缩放控制按钮
    const fitBtn = document.getElementById('fit-btn');
    fitBtn.addEventListener('click', () => {
        if (maskImage && replaceImage) {
            const newScale = ImageProcessor.calculateFitScale(maskImage, replaceImage);
            EventHandlers.handleScaleChange(newScale);
            scaleSlider.value = newScale;
        }
    });

    const resetScaleBtn = document.getElementById('reset-scale-btn');
    resetScaleBtn.addEventListener('click', () => {
        EventHandlers.handleScaleChange(1);
        scaleSlider.value = 1;
    });

    const applyReplaceBtn = document.getElementById('apply-replace-btn');
    applyReplaceBtn.addEventListener('click', () => {
        EventHandlers.applyReplacement();
    });

    // 控制按钮
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.addEventListener('click', () => {
        EventHandlers.resetApp();
    });

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.addEventListener('click', () => {
        EventHandlers.downloadResult();
    });

    // 右侧面板重置按钮
    const resetReplaceBtn = document.getElementById('reset-replace-btn');
    resetReplaceBtn.addEventListener('click', () => {
        EventHandlers.cancelReplacement();
    });

    // Canvas点击和拖拽事件
    const mainCanvas = document.getElementById('main-canvas');
    
    // Canvas点击事件 - 只有在有遮罩图片且点击在图片区域内时才显示替换工具
    mainCanvas.addEventListener('click', (e) => {
        if (!maskImage) return;
        
        const rect = mainCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 检查点击是否在图片区域内
        if (EventHandlers.isClickOnImage(x, y, mainCanvas)) {
            UIController.showReplaceControls();
        }
    });
    
    // Canvas鼠标拖拽事件 - 仅在替换模式下生效
    mainCanvas.addEventListener('mousedown', (e) => {
        if (!isReplacing || !replaceImage) return;
        
        isDragging = true;
        const rect = mainCanvas.getBoundingClientRect();
        dragStartX = e.clientX - rect.left;
        dragStartY = e.clientY - rect.top;
        mainCanvas.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    mainCanvas.addEventListener('mousemove', (e) => {
        if (!isDragging || !isReplacing || !replaceImage) return;
        
        const rect = mainCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // 计算偏移量（考虑Canvas的显示缩放）
        const displayScale = mainCanvas.offsetWidth / mainCanvas.width;
        replaceOffsetX += (currentX - dragStartX) / displayScale;
        replaceOffsetY += (currentY - dragStartY) / displayScale;
        
        dragStartX = currentX;
        dragStartY = currentY;
        
        // 实时更新预览
        EventHandlers.updateReplacePreview();
        e.preventDefault();
    });
    
    mainCanvas.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            mainCanvas.style.cursor = isReplacing ? 'grab' : 'default';
        }
    });
    
    mainCanvas.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            mainCanvas.style.cursor = isReplacing ? 'grab' : 'default';
        }
    });
    
    // 设置Canvas鼠标样式
    mainCanvas.addEventListener('mouseenter', () => {
        if (isReplacing && replaceImage) {
            mainCanvas.style.cursor = 'grab';
        }
    });

    // 拖拽上传
    EventHandlers.setupDragDrop();
}

// ===== 应用启动 =====
document.addEventListener('DOMContentLoaded', initializeApp); 