const { storage } = require("uxp");
const { app, action, core } = require("photoshop");

const fs = storage.localFileSystem;
const MODAL_RETRY_DELAY_MS = 300;
const MODAL_MAX_RETRIES = 20;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isModalStateError(error) {
    const message = normalizeText(error && error.message).toLowerCase();
    return message.includes("modal state") || message.includes("photoshop is in a modal state");
}

function isTransientBusyError(error) {
    const message = normalizeText(error && error.message).toLowerCase();
    return isModalStateError(error) || message.includes("not currently available") || message.includes("当前不可用");
}

async function runAsModalWithRetry(task, commandName) {
    let lastError = null;

    for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt += 1) {
        try {
            return await core.executeAsModal(task, { commandName });
        } catch (error) {
            lastError = error;

            if (!isTransientBusyError(error) || attempt === MODAL_MAX_RETRIES) {
                throw error;
            }

            await wait(MODAL_RETRY_DELAY_MS);
        }
    }

    throw lastError || new Error("命令执行失败");
}

async function readPluginTextFile(fileName) {
    const pluginFolder = await fs.getPluginFolder();
    const file = await pluginFolder.getEntry(fileName);
    return file.read();
}

async function loadPanelAssets() {
    try {
        const [html, css] = await Promise.all([
            readPluginTextFile("src/guide/panel.html"),
            readPluginTextFile("src/guide/panel.css"),
        ]);
        return { html, css };
    } catch (error) {
        return { html: `<div><p>加载错误：${error}</p></div>`, css: "" };
    }
}

function normalizeText(value) {
    if (typeof value === "string") {
        return value;
    }
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

function parsePositionList(rawText, fieldName) {
    const normalized = normalizeText(rawText).trim();
    if (!normalized) {
        return [];
    }

    const segments = normalized.split(/[\s,;|]+/).filter(Boolean);
    const positions = [];

    for (let index = 0; index < segments.length; index += 1) {
        const token = segments[index];
        const isPercent = token.endsWith("%");
        const numericText = isPercent ? token.slice(0, -1) : token;
        const value = Number(numericText);
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${fieldName}第 ${index + 1} 个值无效：${token}`);
        }
        positions.push({
            value,
            unit: isPercent ? "percentUnit" : "pixelsUnit",
        });
    }

    return positions;
}

function buildGuideDescriptor(guide, documentId) {
    const guideTargetValue = guide.unit === "percentUnit" ? "guideTargetSelectedArtboard" : "guideTargetCanvas";
    const newGuideTarget = Number.isFinite(documentId) ? [{ _ref: "document", _id: documentId }] : undefined;

    return {
        _obj: "make",
        _target: [{ _ref: "good" }],
        guideTarget: { _enum: "guideTarget", _value: guideTargetValue },
        guideUserValue: { _unit: guide.unit, _value: guide.position },
        new: {
            _obj: "good",
            _target: newGuideTarget,
            kind: { _enum: "kind", _value: "document" },
            orientation: { _enum: "orientation", _value: guide.orientation },
            position: { _unit: guide.unit, _value: guide.position },
            $GdCA: 0,
            $GdCB: 255,
            $GdCG: 255,
            $GdCR: 74,
        },
        _options: { dialogOptions: "dontDisplay" },
    };
}

async function createGuides(guides) {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }
    const activeDocumentId = app.activeDocument._id;
    const guideDescriptors = guides.map(guide => [buildGuideDescriptor(guide, activeDocumentId)]);

    await runAsModalWithRetry(async () => {
        for (const descriptor of guideDescriptors) {
            await action.batchPlay(descriptor, {
                synchronousExecution: true,
            });
        }
    }, "批量创建参考线");
}

async function clearAllGuides() {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }

    await runAsModalWithRetry(async () => {
        await action.batchPlay(
            [
                {
                    _obj: "delete",
                    _target: [{ _ref: "guide", _enum: "ordinal", _value: "allEnum" }],
                    _options: { dialogOptions: "dontDisplay" },
                },
            ],
            {
                synchronousExecution: true,
            },
        );
    }, "清除参考线");
}

function setStatus(node, text, isError) {
    node.textContent = text;
    node.style.color = isError ? "#C81E1E" : "#1B6E3A";
}

async function buildPanel(node) {
    const assets = await loadPanelAssets();
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.overflow = "hidden";
    node.innerHTML = `<style>${assets.css}</style>${assets.html}`;

    const horizontalInput = node.querySelector("#horizontal-input");
    const verticalInput = node.querySelector("#vertical-input");
    const createBtn = node.querySelector("#create-guides-btn");
    const reloadInputBtn = node.querySelector("#reload-input-btn");
    const clearBtn = node.querySelector("#clear-guides-btn");
    const status = node.querySelector("#status");

    if (!horizontalInput || !verticalInput || !createBtn || !reloadInputBtn || !clearBtn || !status) {
        throw new Error("面板初始化失败：缺少必要的 UI 节点");
    }

    let isBusy = false;
    const actionButtons = [createBtn, reloadInputBtn, clearBtn];

    const setBusyState = busy => {
        isBusy = busy;
        actionButtons.forEach(button => {
            button.disabled = busy;
        });
    };

    horizontalInput.value = "";
    verticalInput.value = "";

    createBtn.addEventListener("click", async () => {
        if (isBusy) {
            setStatus(status, "请稍候，命令正在执行", true);
            return;
        }

        setBusyState(true);
        try {
            const horizontalPositions = parsePositionList(horizontalInput.value, "水平输入");
            const verticalPositions = parsePositionList(verticalInput.value, "垂直输入");
            const guides = [
                ...horizontalPositions.map(item => ({ orientation: "horizontal", position: item.value, unit: item.unit })),
                ...verticalPositions.map(item => ({ orientation: "vertical", position: item.value, unit: item.unit })),
            ];

            if (guides.length === 0) {
                throw new Error("请输入至少一个参考线位置");
            }

            await createGuides(guides);
            setStatus(
                status,
                `创建完成：共 ${guides.length} 条（水平 ${horizontalPositions.length} / 垂直 ${verticalPositions.length}）`,
                false,
            );
        } catch (error) {
            if (isTransientBusyError(error)) {
                setStatus(status, "Photoshop 当前正忙，请稍后重试", true);
            } else {
                setStatus(status, error.message || "创建失败", true);
            }
        } finally {
            setBusyState(false);
        }
    });

    reloadInputBtn.addEventListener("click", () => {
        if (isBusy) {
            return;
        }

        horizontalInput.value = "";
        verticalInput.value = "";
        setStatus(status, "已清空输入内容", false);
    });

    clearBtn.addEventListener("click", async () => {
        if (isBusy) {
            setStatus(status, "请稍候，命令正在执行", true);
            return;
        }

        // 二次确认弹窗
        const confirmed = confirm("确定要清空当前文档的所有参考线吗？此操作不可撤销。");
        if (!confirmed) {
            setStatus(status, "已取消清空操作", false);
            return;
        }

        setBusyState(true);
        try {
            await clearAllGuides();
            setStatus(status, "已清空当前文档参考线", false);
        } catch (error) {
            if (isTransientBusyError(error)) {
                setStatus(status, "Photoshop 当前正忙，请稍后重试", true);
            } else {
                setStatus(status, error.message || "清除失败", true);
            }
        } finally {
            setBusyState(false);
        }
    });
}

module.exports = {
    buildPanel,
};
