import { app, action, core } from "photoshop";

const MODAL_RETRY_DELAY_MS = 300;
const MODAL_MAX_RETRIES = 20;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

function isModalStateError(error) {
    const message = normalizeText(error && error.message).toLowerCase();
    return message.includes("modal state") || message.includes("photoshop is in a modal state");
}

export function isTransientBusyError(error) {
    const message = normalizeText(error && error.message).toLowerCase();
    return isModalStateError(error) || message.includes("not currently available") || message.includes("当前不可用");
}

export function parsePositionList(rawText, fieldName) {
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

async function runAsModalWithRetry(task, commandName, updateStatus) {
    let lastError = null;

    for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt += 1) {
        try {
            return await core.executeAsModal(task, { commandName });
        } catch (error) {
            lastError = error;

            if (!isTransientBusyError(error) || attempt === MODAL_MAX_RETRIES) {
                updateStatus((error && error.message) || "命令执行失败", true);
                throw error;
            }

            updateStatus("Photoshop 当前正忙，正在重试...", true);
            await wait(MODAL_RETRY_DELAY_MS);
        }
    }

    throw lastError || new Error("命令执行失败");
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

export async function createGuides(guides, updateStatus) {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }

    const activeDocumentId = app.activeDocument._id;
    const guideDescriptors = guides.map(guide => buildGuideDescriptor(guide, activeDocumentId));
    const historyTarget = [{ _ref: "document", _id: activeDocumentId }];

    await runAsModalWithRetry(
        async executionContext => {
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
        },
        "批量创建参考线",
        updateStatus,
    );
}

export async function clearAllGuides(updateStatus) {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }

    await runAsModalWithRetry(
        async () => {
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
        },
        "清除参考线",
        updateStatus,
    );
}
