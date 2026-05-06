const { storage } = require("uxp");
const { app, action, core } = require("photoshop");
const { loadUI, setStatus } = require("../../util/index");

const fs = storage.localFileSystem;
const MODAL_RETRY_DELAY_MS = 300;
const MODAL_MAX_RETRIES = 20;

class GuidePanel {
    constructor(node) {
        this._node = node;
        this._isBusy = false;
        this._statusNode = null;
    }

    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _normalizeText(value) {
        if (typeof value === "string") {
            return value;
        }
        if (value === null || value === undefined) {
            return "";
        }
        return String(value);
    }

    _isModalStateError(error) {
        const message = this._normalizeText(error && error.message).toLowerCase();
        return message.includes("modal state") || message.includes("photoshop is in a modal state");
    }

    _isTransientBusyError(error) {
        const message = this._normalizeText(error && error.message).toLowerCase();
        return this._isModalStateError(error) || message.includes("not currently available") || message.includes("当前不可用");
    }

    async _runAsModalWithRetry(task, commandName) {
        let lastError = null;

        for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt += 1) {
            try {
                return await core.executeAsModal(task, { commandName });
            } catch (error) {
                lastError = error;

                if (!this._isTransientBusyError(error) || attempt === MODAL_MAX_RETRIES) {
                    this._setStatus(error && error.message ? error.message : "命令执行失败", true);
                    throw error;
                }

                this._setStatus("Photoshop 当前正忙，正在重试...", true);

                await this._wait(MODAL_RETRY_DELAY_MS);
            }
        }

        throw lastError || new Error("命令执行失败");
    }

    async _readPluginTextFile(fileName) {
        const pluginFolder = await fs.getPluginFolder();
        const file = await pluginFolder.getEntry(fileName);
        return file.read();
    }

    _parsePositionList(rawText, fieldName) {
        const normalized = this._normalizeText(rawText).trim();
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

    _buildGuideDescriptor(guide, documentId) {
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

    async _createGuides(guides) {
        if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
            throw new Error("请先打开一个 Photoshop 文档");
        }
        const activeDocumentId = app.activeDocument._id;
        const guideDescriptors = guides.map(guide => this._buildGuideDescriptor(guide, activeDocumentId));
        const historyTarget = [{ _ref: "document", _id: activeDocumentId }];

        await this._runAsModalWithRetry(async executionContext => {
            const hostControl = executionContext && executionContext.hostControl;
            const canSuspendHistory =
                hostControl &&
                typeof hostControl.suspendHistory === "function" &&
                typeof hostControl.resumeHistory === "function";
            let suspensionId = null;

            if (canSuspendHistory) {
                suspensionId = await hostControl.suspendHistory({
                    documentID: activeDocumentId,
                    name: "批量创建参考线",
                });
            }

            try {
                await action.batchPlay(guideDescriptors, {
                    synchronousExecution: true,
                    historyStateInfo: {
                        name: "批量创建参考线",
                        target: historyTarget,
                    },
                });
            } finally {
                if (suspensionId) {
                    await hostControl.resumeHistory(suspensionId);
                }
            }
        }, "批量创建参考线");
    }

    async _clearAllGuides() {
        if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
            throw new Error("请先打开一个 Photoshop 文档");
        }

        await this._runAsModalWithRetry(async () => {
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

    _setBusyState(actionButtons, busy) {
        this._isBusy = busy;
        actionButtons.forEach(button => {
            button.disabled = busy;
        });
    }

    _setStatus(text, isError) {
        if (!this._statusNode) {
            return;
        }
        setStatus(this._statusNode, text, isError);
    }

    async buildPanel() {
        const node = this._node;
        if (!node) {
            throw new Error("面板初始化失败：未提供挂载节点");
        }

        const assets = await loadUI("src/module/guide/panel.html", "src/module/guide/panel.css");
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
        this._statusNode = status;

        const actionButtons = [createBtn, reloadInputBtn, clearBtn];

        horizontalInput.value = "";
        verticalInput.value = "";

        createBtn.addEventListener("click", async () => {
            if (this._isBusy) {
                this._setStatus("请稍候，命令正在执行", true);
                return;
            }

            this._setBusyState(actionButtons, true);
            try {
                const horizontalPositions = this._parsePositionList(horizontalInput.value, "水平输入");
                const verticalPositions = this._parsePositionList(verticalInput.value, "垂直输入");
                const guides = [
                    ...horizontalPositions.map(item => ({ orientation: "horizontal", position: item.value, unit: item.unit })),
                    ...verticalPositions.map(item => ({ orientation: "vertical", position: item.value, unit: item.unit })),
                ];

                if (guides.length === 0) {
                    throw new Error("请输入至少一个参考线位置");
                }

                await this._createGuides(guides);
                this._setStatus(
                    `创建完成：共 ${guides.length} 条（水平 ${horizontalPositions.length} / 垂直 ${verticalPositions.length}）`,
                    false,
                );
            } catch (error) {
                if (this._isTransientBusyError(error)) {
                    this._setStatus("Photoshop 当前正忙，请稍后重试", true);
                } else {
                    this._setStatus(error.message || "创建失败", true);
                }
            } finally {
                this._setBusyState(actionButtons, false);
            }
        });

        reloadInputBtn.addEventListener("click", () => {
            if (this._isBusy) {
                return;
            }

            horizontalInput.value = "";
            verticalInput.value = "";
            this._setStatus("已清空输入内容", false);
        });

        clearBtn.addEventListener("click", async () => {
            if (this._isBusy) {
                this._setStatus("请稍候，命令正在执行", true);
                return;
            }

            const confirmed = confirm("确定要清空当前文档的所有参考线吗？此操作不可撤销。");
            if (!confirmed) {
                this._setStatus("已取消清空操作", false);
                return;
            }

            this._setBusyState(actionButtons, true);
            try {
                await this._clearAllGuides();
                this._setStatus("已清空当前文档参考线", false);
            } catch (error) {
                if (this._isTransientBusyError(error)) {
                    this._setStatus("Photoshop 当前正忙，请稍后重试", true);
                } else {
                    this._setStatus(error.message || "清除失败", true);
                }
            } finally {
                this._setBusyState(actionButtons, false);
            }
        });
    }
}

module.exports = {
    GuidePanel,
};
