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
     * 按遮罩裁剪图像（核心算法）
     */
    cropImageWithMask(maskImg, srcImg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置画布尺寸为遮罩尺寸
        canvas.width = maskImg.width;
        canvas.height = maskImg.height;
        
        // 先绘制源图像（会被裁剪）
        ctx.drawImage(srcImg, 0, 0, canvas.width, canvas.height);
        
        // 应用遮罩：destination-in 仅保留两者相交且mask alpha>0的像素
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskImg, 0, 0);
        
        // 重置混合模式
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
     * 实时预览替换效果（可缩放）
     */
    previewReplaceWithScale(maskImg, srcImg, scale = 1) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置画布尺寸为遮罩尺寸
        canvas.width = maskImg.width;
        canvas.height = maskImg.height;
        
        // 计算缩放后的源图像尺寸
        const scaledWidth = srcImg.width * scale;
        const scaledHeight = srcImg.height * scale;
        
        // 计算居中位置
        const x = (canvas.width - scaledWidth) / 2;
        const y = (canvas.height - scaledHeight) / 2;
        
        // 先绘制缩放后的源图像
        ctx.drawImage(srcImg, x, y, scaledWidth, scaledHeight);
        
        // 应用遮罩
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskImg, 0, 0);
        
        // 重置混合模式
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
     * 显示替换控制层
     */
    showReplaceControls() {
        const replaceControls = document.getElementById('replace-controls');
        replaceControls.style.display = 'flex';
        
        currentState = AppState.TOOL_ACTIVE;
        this.updateStatus('点击上传要替换的图片', 'info');
    },

    /**
     * 隐藏替换控制层
     */
    hideReplaceControls() {
        const replaceControls = document.getElementById('replace-controls');
        replaceControls.style.display = 'none';
    },

    /**
     * 显示缩放控制器
     */
    showScaleControls() {
        const scaleControls = document.getElementById('scale-controls');
        scaleControls.style.display = 'block';
        
        // 初始化缩放滑块
        const scaleSlider = document.getElementById('scale-slider');
        const scaleValue = document.getElementById('scale-value');
        
        scaleSlider.value = currentScale;
        scaleValue.textContent = Math.round(currentScale * 100) + '%';
        
        this.updateStatus('调整图片大小，点击"完成"应用替换', 'info');
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
            
            // 显示替换控制层
            UIController.showReplaceControls();
            
            // 更新UI状态
            UIController.showMaskInfo(file, image);
            UIController.updateStatus('遮罩图片加载成功！点击上传要替换的图片', 'success');
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
            
            // 隐藏替换控制层
            UIController.hideReplaceControls();
            
            // 立即显示替换效果
            this.updateReplacePreview();
            
            // 显示缩放控制器
            UIController.showScaleControls();
            
            currentState = AppState.PROCESSING;
            
        } catch (error) {
            UIController.updateStatus(`错误: ${error.message}`, 'error');
            console.error('替换图片上传失败:', error);
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * 更新替换预览（实时）
     */
    updateReplacePreview() {
        if (!maskImage || !replaceImage) return;
        
        // 生成预览Canvas
        const previewCanvas = ImageProcessor.previewReplaceWithScale(maskImage, replaceImage, currentScale);
        
        // 更新主Canvas
        const mainCanvas = document.getElementById('main-canvas');
        const ctx = mainCanvas.getContext('2d');
        
        mainCanvas.width = previewCanvas.width;
        mainCanvas.height = previewCanvas.height;
        ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        ctx.drawImage(previewCanvas, 0, 0);
        
        CanvasRenderer.adjustCanvasSize(mainCanvas);
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
     * 应用图片替换（完成缩放调整）
     */
    async applyReplacement() {
        try {
            Utils.showLoading('正在应用替换...');
            
            // 执行图片替换（使用当前缩放）
            resultCanvas = ImageProcessor.previewReplaceWithScale(maskImage, replaceImage, currentScale);
            
            // 隐藏缩放控制器
            UIController.hideScaleControls();
            
            // 重置状态
            isReplacing = false;
            currentState = AppState.COMPLETED;
            UIController.updateStatus('图片替换完成！可以下载结果或点击图片重新替换', 'success');
            
            // 重新显示替换控制层，允许再次替换
            UIController.showReplaceControls();
            
        } catch (error) {
            UIController.updateStatus(`替换失败: ${error.message}`, 'error');
            console.error('图片替换失败:', error);
        } finally {
            Utils.hideLoading();
        }
    },

    /**
     * 取消替换操作
     */
    cancelReplacement() {
        // 恢复遮罩图片显示
        const mainCanvas = document.getElementById('main-canvas');
        CanvasRenderer.renderMaskImage(maskImage, mainCanvas);
        CanvasRenderer.adjustCanvasSize(mainCanvas);
        
        // 隐藏缩放控制器
        UIController.hideScaleControls();
        
        // 显示替换控制层
        UIController.showReplaceControls();
        
        // 重置状态
        replaceImage = null;
        isReplacing = false;
        currentScale = 1;
        currentState = AppState.MASK_LOADED;
        
        UIController.updateStatus('已取消替换，请重新选择图片', 'info');
    },

    /**
     * 重置应用状态
     */
    resetApp() {
        // 重置变量
        maskImage = null;
        replaceImage = null;
        resultCanvas = null;
        currentScale = 1;
        isReplacing = false;
        currentState = AppState.INITIAL;
        
        // 重置UI
        const mainCanvas = document.getElementById('main-canvas');
        CanvasRenderer.clearCanvas(mainCanvas);
        
        const overlay = document.getElementById('canvas-overlay');
        overlay.classList.remove('hidden');
        
        UIController.hideReplaceControls();
        UIController.hideScaleControls();
        UIController.hideMaskInfo();
        UIController.toggleControlButtons(false);
        UIController.updateStatus('等待上传遮罩图片...', 'info');
        
        // 清空文件输入
        document.getElementById('mask-input').value = '';
        const replaceInputMain = document.getElementById('replace-input-main');
        if (replaceInputMain) replaceInputMain.value = '';
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
    }
};

// ===== 拖拽上传功能 =====
const DragDropHandler = {
    setupDragDrop() {
        const maskUploadArea = document.getElementById('mask-upload-area');
        const replaceUploadArea = document.getElementById('replace-upload-area');
        
        // 遮罩图片拖拽
        this.setupAreaDragDrop(maskUploadArea, (file) => {
            EventHandlers.handleMaskUpload(file);
        });
        
        // 替换图片拖拽
        this.setupAreaDragDrop(replaceUploadArea, (file) => {
            EventHandlers.handleReplaceUpload(file);
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
    }
};

// ===== 应用初始化 =====
function initializeApp() {
    console.log('🎨 Shape-Mask 图片替换工具初始化...');
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 设置拖拽上传
    DragDropHandler.setupDragDrop();
    
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
    if (maskInput) {
        console.log('找到mask-input元素，绑定change事件');
        maskInput.addEventListener('change', (e) => {
            console.log('mask-input change事件触发');
            const file = e.target.files[0];
            if (file) {
                console.log('选择的文件:', file.name, file.type, file.size);
                EventHandlers.handleMaskUpload(file);
            }
        });
    } else {
        console.error('未找到mask-input元素');
    }
    
    // 主替换图片上传（新的交互方式）
    const replaceInputMain = document.getElementById('replace-input-main');
    if (replaceInputMain) {
        replaceInputMain.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                EventHandlers.handleReplaceUpload(file);
            }
        });
    }
    
    // 缩放控制器事件
    const scaleSlider = document.getElementById('scale-slider');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', (e) => {
            const newScale = parseFloat(e.target.value);
            EventHandlers.handleScaleChange(newScale);
        });
    }
    
    // 缩放控制按钮
    const fitBtn = document.getElementById('fit-btn');
    if (fitBtn) {
        fitBtn.addEventListener('click', () => {
            if (maskImage && replaceImage) {
                const fitScale = ImageProcessor.calculateFitScale(maskImage, replaceImage);
                document.getElementById('scale-slider').value = fitScale;
                EventHandlers.handleScaleChange(fitScale);
            }
        });
    }
    
    const resetScaleBtn = document.getElementById('reset-scale-btn');
    if (resetScaleBtn) {
        resetScaleBtn.addEventListener('click', () => {
            document.getElementById('scale-slider').value = 1;
            EventHandlers.handleScaleChange(1);
        });
    }
    
    const applyReplaceBtn = document.getElementById('apply-replace-btn');
    if (applyReplaceBtn) {
        applyReplaceBtn.addEventListener('click', () => {
            EventHandlers.applyReplacement();
        });
    }
    
    // 控制按钮
    document.getElementById('reset-btn').addEventListener('click', () => {
        if (confirm('确定要重置所有内容吗？')) {
            EventHandlers.resetApp();
        }
    });
    
    document.getElementById('download-btn').addEventListener('click', () => {
        EventHandlers.downloadResult();
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentState === AppState.TOOL_ACTIVE) {
            UIController.hideReplacePanel();
        }
    });
}

// ===== 应用启动 =====
document.addEventListener('DOMContentLoaded', initializeApp); 