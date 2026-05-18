import { app, action, constants, core } from "photoshop";
import { storage } from "uxp";
import { formatTailoringName } from "./nameTemplate.js";

const MODAL_RETRY_DELAY_MS = 300;
const MODAL_MAX_RETRIES = 20;
const DEFAULT_JPEG_QUALITY = 10;
const MAX_GUIDE_INDEX_READS = 500;
const TAILORING_DEBUG = true;

function debugLog(message, detail) {
    if (!TAILORING_DEBUG || typeof console === "undefined" || typeof console.log !== "function") {
        return;
    }

    if (detail === undefined) {
        console.log(`[Tailoring] ${message}`);
    } else {
        console.log(`[Tailoring] ${message}`, detail);
    }
}

function debugWarn(message, detail) {
    if (!TAILORING_DEBUG || typeof console === "undefined") {
        return;
    }

    const logger = typeof console.warn === "function" ? console.warn : console.log;
    if (detail === undefined) {
        logger(`[Tailoring] ${message}`);
    } else {
        logger(`[Tailoring] ${message}`, detail);
    }
}

function debugError(message, detail) {
    if (!TAILORING_DEBUG || typeof console === "undefined") {
        return;
    }

    const logger = typeof console.error === "function" ? console.error : console.log;
    if (detail === undefined) {
        logger(`[Tailoring] ${message}`);
    } else {
        logger(`[Tailoring] ${message}`, detail);
    }
}

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

async function runAsModalWithRetry(task, commandName, updateStatus) {
    let lastError = null;

    for (let attempt = 0; attempt <= MODAL_MAX_RETRIES; attempt += 1) {
        try {
            debugLog(`executeAsModal start: ${commandName}`, { attempt: attempt + 1 });
            return await core.executeAsModal(task, { commandName });
        } catch (error) {
            lastError = error;
            debugWarn(`executeAsModal failed: ${commandName}`, {
                attempt: attempt + 1,
                message: error && error.message,
                stack: error && error.stack,
            });

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

function getNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (value && typeof value === "object") {
        if (typeof value.value === "number") {
            return value.value;
        }
        if (typeof value._value === "number") {
            return value._value;
        }
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function getDocumentDimension(document, key) {
    const rawValue = document[key];
    const value = getNumber(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`无法读取文档${key === "width" ? "宽度" : "高度"}`);
    }
    return value;
}

function guideCollectionToArray(guides) {
    if (!guides) {
        return [];
    }
    if (Array.isArray(guides)) {
        return guides;
    }
    if (typeof guides[Symbol.iterator] === "function") {
        return Array.from(guides);
    }
    if (Number.isInteger(guides.length)) {
        const result = [];
        for (let index = 0; index < guides.length; index += 1) {
            result.push(guides[index]);
        }
        return result;
    }
    return [];
}

function normalizeEnumValue(value) {
    if (value && typeof value === "object") {
        return value._value ?? value.value ?? value;
    }
    return value;
}

function normalizeGuideDirection(guide) {
    const rawDirection = normalizeEnumValue(guide.direction ?? guide.orientation ?? guide.$Ornt);
    if (constants && constants.Direction) {
        if (rawDirection === constants.Direction.HORIZONTAL) {
            return "horizontal";
        }
        if (rawDirection === constants.Direction.VERTICAL) {
            return "vertical";
        }
    }

    const text = normalizeText(rawDirection).toLowerCase();
    if (text.includes("horizontal")) {
        return "horizontal";
    }
    if (text.includes("vertical")) {
        return "vertical";
    }
    return "";
}

function normalizeGuideCoordinate(guide) {
    return getNumber(guide.coordinate ?? guide.position ?? guide.location ?? guide.$Pstn);
}

function normalizeGuideKind(guide) {
    const rawKind = normalizeEnumValue(guide.kind ?? guide.guideTarget);
    return normalizeText(rawKind).toLowerCase();
}

function isDocumentGuide(guide) {
    const kind = normalizeGuideKind(guide);
    if (!kind) {
        return true;
    }

    return kind === "document" || kind === "guidetargetcanvas" || kind.includes("document");
}

function uniqueSortedPositions(values, min, max) {
    const filtered = values
        .map(value => Math.max(min, Math.min(max, value)))
        .filter(value => Number.isFinite(value) && value > min && value < max)
        .sort((left, right) => left - right);
    const result = [min];

    for (const value of filtered) {
        const previous = result[result.length - 1];
        if (Math.abs(value - previous) > 0.5) {
            result.push(value);
        }
    }

    result.push(max);
    return result;
}

function collectDocumentGuides(guides) {
    const verticalGuides = [];
    const horizontalGuides = [];
    const guideItems = guideCollectionToArray(guides);

    debugLog("collect document guides", { total: guideItems.length, guides: guideItems });

    for (const guide of guideItems) {
        if (!guide || !isDocumentGuide(guide)) {
            debugLog("skip non-document guide", guide);
            continue;
        }

        const coordinate = normalizeGuideCoordinate(guide);
        if (!Number.isFinite(coordinate)) {
            debugWarn("skip guide with invalid coordinate", guide);
            continue;
        }

        const direction = normalizeGuideDirection(guide);
        if (direction === "vertical") {
            verticalGuides.push(coordinate);
        } else if (direction === "horizontal") {
            horizontalGuides.push(coordinate);
        } else {
            debugWarn("skip guide with unknown direction", guide);
        }
    }

    debugLog("collected document guide positions", {
        verticalGuides,
        horizontalGuides,
    });

    return { verticalGuides, horizontalGuides };
}

function getGuideListFromDescriptor(descriptor) {
    debugLog("batchPlay guide descriptor", descriptor);

    if (!descriptor || typeof descriptor !== "object") {
        return [];
    }
    if (descriptor._obj === "error") {
        throw new Error(`读取参考线失败：batchPlay result ${descriptor.result}`);
    }

    if (Array.isArray(descriptor.guides)) {
        return descriptor.guides;
    }
    if (descriptor.guides && Array.isArray(descriptor.guides._value)) {
        return descriptor.guides._value;
    }
    if (descriptor.guides && Array.isArray(descriptor.guides.list)) {
        return descriptor.guides.list;
    }
    if (Array.isArray(descriptor.guide)) {
        return descriptor.guide;
    }
    if (descriptor.guide && Array.isArray(descriptor.guide._value)) {
        return descriptor.guide._value;
    }
    if (descriptor.guide && Array.isArray(descriptor.guide.list)) {
        return descriptor.guide.list;
    }

    return [];
}

function getTargetDocumentReference(document) {
    if (document && Number.isFinite(document._id)) {
        return [{ _ref: "document", _id: document._id }, { _ref: "application" }];
    }

    return [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }, { _ref: "application" }];
}

async function readDocumentDescriptor(descriptor, options) {
    const results = await action.batchPlay([descriptor], options);
    const result = results && results[0];
    if (result && result._obj === "error") {
        throw new Error(`batchPlay result ${result.result}`);
    }

    return result;
}

async function getDocumentGuidesFromBatchPlay(document) {
    const targetDocument = getTargetDocumentReference(document);

    debugLog("read document guides by batchPlay", {
        documentId: document && document._id,
        documentName: document && (document.title || document.name),
        targetDocument,
    });

    const batchPlayOptions = {
        synchronousExecution: true,
        modalBehavior: "fail",
    };

    try {
        const guidesDescriptor = await readDocumentDescriptor(
            {
                _obj: "get",
                _target: [{ _property: "guides" }, ...targetDocument],
                _options: { dialogOptions: "dontDisplay" },
            },
            batchPlayOptions,
        );
        debugLog("batchPlay guide property result", guidesDescriptor);
        return getGuideListFromDescriptor(guidesDescriptor);
    } catch (error) {
        debugWarn("batchPlay guide property read failed, try full document descriptor", {
            message: error && error.message,
        });
    }

    const documentDescriptor = await readDocumentDescriptor(
        {
            _obj: "get",
            _target: targetDocument,
            _options: { dialogOptions: "dontDisplay" },
        },
        batchPlayOptions,
    );

    debugLog("batchPlay document descriptor result", documentDescriptor);
    return getGuideListFromDescriptor(documentDescriptor);
}

async function getDocumentGuidesByIndex(document) {
    const batchPlayOptions = {
        synchronousExecution: true,
        modalBehavior: "fail",
    };
    const targetDocument = getTargetDocumentReference(document);
    const guides = [];

    debugLog("read document guides by guide index", {
        documentId: document && document._id,
        targetDocument,
    });

    for (let index = 1; index <= MAX_GUIDE_INDEX_READS; index += 1) {
        try {
            const guideDescriptor = await readDocumentDescriptor(
                {
                    _obj: "get",
                    _target: [{ _ref: "guide", _index: index }, ...targetDocument],
                    _options: { dialogOptions: "dontDisplay" },
                },
                batchPlayOptions,
            );

            debugLog("batchPlay guide index result", { index, guideDescriptor });
            guides.push(guideDescriptor);
        } catch (error) {
            debugLog("stop reading guides by index", {
                index,
                count: guides.length,
                message: error && error.message,
            });
            break;
        }
    }

    return guides;
}

async function getDocumentGuidePositions(document) {
    let batchPlayGuides = [];
    try {
        batchPlayGuides = await getDocumentGuidesFromBatchPlay(document);
    } catch (error) {
        debugError("batchPlay guide read failed, fallback to document.guides", {
            message: error && error.message,
            stack: error && error.stack,
        });
        batchPlayGuides = [];
    }

    let guidePositions = collectDocumentGuides(batchPlayGuides);
    if (guidePositions.verticalGuides.length + guidePositions.horizontalGuides.length > 0) {
        debugLog("using batchPlay document guides", guidePositions);
        return guidePositions;
    }

    debugWarn("batchPlay returned no usable document guides, fallback to guide index reads");
    try {
        const indexedGuides = await getDocumentGuidesByIndex(document);
        guidePositions = collectDocumentGuides(indexedGuides);
        if (guidePositions.verticalGuides.length + guidePositions.horizontalGuides.length > 0) {
            debugLog("using batchPlay guide index reads", guidePositions);
            return guidePositions;
        }
    } catch (error) {
        debugError("guide index read failed, fallback to DOM document.guides", {
            message: error && error.message,
            stack: error && error.stack,
        });
    }

    debugWarn("guide index reads returned no usable document guides, fallback to DOM document.guides", document.guides);
    guidePositions = collectDocumentGuides(document.guides);
    if (guidePositions.verticalGuides.length + guidePositions.horizontalGuides.length > 0) {
        debugLog("using DOM document.guides", guidePositions);
        return guidePositions;
    }

    debugWarn("no usable document guides found");
    return guidePositions;
}

export async function buildSlicesFromDocumentGuides(document) {
    const width = getDocumentDimension(document, "width");
    const height = getDocumentDimension(document, "height");

    debugLog("build slices from document guides", {
        documentId: document && document._id,
        documentName: document && (document.title || document.name),
        width,
        height,
    });

    const { verticalGuides, horizontalGuides } = await getDocumentGuidePositions(document);

    if (verticalGuides.length + horizontalGuides.length === 0) {
        throw new Error("当前文档没有可用于切分的文档参考线");
    }

    const xPositions = uniqueSortedPositions(verticalGuides, 0, width);
    const yPositions = uniqueSortedPositions(horizontalGuides, 0, height);
    const slices = [];

    debugLog("slice grid positions", {
        xPositions,
        yPositions,
    });

    for (let row = 0; row < yPositions.length - 1; row += 1) {
        for (let column = 0; column < xPositions.length - 1; column += 1) {
            const left = xPositions[column];
            const top = yPositions[row];
            const right = xPositions[column + 1];
            const bottom = yPositions[row + 1];

            if (right - left > 0.5 && bottom - top > 0.5) {
                slices.push({ left, top, right, bottom, row, column });
            }
        }
    }

    debugLog("slices built", {
        count: slices.length,
        slices,
    });

    return slices;
}

export async function chooseOutputFolder() {
    debugLog("choose output folder");
    const folder = await storage.localFileSystem.getFolder();
    debugLog("output folder selected", folder && { name: folder.name, nativePath: folder.nativePath });
    return folder;
}

function normalizeFormat(value) {
    return normalizeText(value).toLowerCase() === "jpg" ? "jpg" : "png";
}

function getCloseWithoutSavingOption() {
    if (constants && constants.SaveOptions && constants.SaveOptions.DONOTSAVECHANGES) {
        return constants.SaveOptions.DONOTSAVECHANGES;
    }
    return undefined;
}

async function closeDocumentWithoutSaving(document) {
    if (!document || typeof document.close !== "function") {
        return;
    }

    if (typeof document.closeWithoutSaving === "function") {
        await document.closeWithoutSaving();
        return;
    }

    const option = getCloseWithoutSavingOption();
    if (option !== undefined) {
        await document.close(option);
    } else {
        await document.close();
    }
}

async function saveSliceDocument(document, file, format) {
    if (!document || !document.saveAs) {
        throw new Error("当前 Photoshop 版本不支持 DOM 导出");
    }

    if (format === "jpg") {
        await document.saveAs.jpg(file, { quality: DEFAULT_JPEG_QUALITY }, true);
        return;
    }

    await document.saveAs.png(file, {}, true);
}

function makeUniqueFilename(name, extension, usedNames) {
    let candidate = `${name}.${extension}`;
    let suffix = 2;

    while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${name}_${suffix}.${extension}`;
        suffix += 1;
    }

    usedNames.add(candidate.toLowerCase());
    return candidate;
}

export async function exportSlices(options, updateStatus) {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }
    if (!options || !options.folder) {
        throw new Error("请先选择导出目录");
    }

    const sourceDocument = app.activeDocument;
    const format = normalizeFormat(options.format);
    debugLog("export start", {
        format,
        nameTemplate: options.nameTemplate,
        folder: options.folder && { name: options.folder.name, nativePath: options.folder.nativePath },
        documentId: sourceDocument && sourceDocument._id,
        documentName: sourceDocument && (sourceDocument.title || sourceDocument.name),
    });

    const documentName = sourceDocument.title || sourceDocument.name || "untitled";
    const usedNames = new Set();
    let sliceCount = 0;

    await runAsModalWithRetry(
        async () => {
            const slices = await buildSlicesFromDocumentGuides(sourceDocument);
            sliceCount = slices.length;

            for (let index = 0; index < slices.length; index += 1) {
                const slice = slices[index];
                const name = formatTailoringName(options.nameTemplate, documentName, index);
                const fileName = makeUniqueFilename(name, format, usedNames);
                debugLog("export slice start", {
                    index: index + 1,
                    total: slices.length,
                    fileName,
                    slice,
                });

                const file = await options.folder.createFile(fileName, { overwrite: true });
                const sliceDocument = await sourceDocument.duplicate(`${name}_tailoring`, false);

                try {
                    await sliceDocument.crop([slice.left, slice.top, slice.right, slice.bottom]);
                    await saveSliceDocument(sliceDocument, file, format);
                    updateStatus(`正在导出 ${index + 1}/${slices.length}：${fileName}`);
                    debugLog("export slice done", { index: index + 1, fileName });
                } catch (error) {
                    debugError("export slice failed", {
                        index: index + 1,
                        fileName,
                        slice,
                        message: error && error.message,
                        stack: error && error.stack,
                    });
                    throw error;
                } finally {
                    await closeDocumentWithoutSaving(sliceDocument);
                }
            }
        },
        "Tailoring 批量切片导出",
        updateStatus,
    );

    debugLog("export done", { count: sliceCount, format });

    return {
        count: sliceCount,
        format,
    };
}
