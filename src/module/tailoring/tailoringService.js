import { app, action, constants, core } from "photoshop";
import { storage } from "uxp";

const DEBUG_BUILD = "read-guides-export-png-batch-save-v9";

function log(message, detail) {
    if (typeof console === "undefined" || typeof console.log !== "function") {
        return;
    }

    if (detail === undefined) {
        console.log(`[Tailoring] ${message}`);
    } else {
        console.log(`[Tailoring] ${message}`, detail);
    }
}

function warn(message, detail) {
    if (typeof console === "undefined") {
        return;
    }

    const logger = typeof console.warn === "function" ? console.warn : console.log;
    if (detail === undefined) {
        logger(`[Tailoring] ${message}`);
    } else {
        logger(`[Tailoring] ${message}`, detail);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const value = getNumber(document && document[key]);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`无法读取文档${key === "width" ? "宽度" : "高度"}`);
    }
    return value;
}

function getEnumValue(value) {
    if (value && typeof value === "object") {
        return value._value ?? value.value ?? value;
    }
    return value;
}

function getGuideDirection(guide) {
    const rawDirection = getEnumValue(guide.direction ?? guide.orientation ?? guide.$Ornt);
    const text = String(rawDirection || "").toLowerCase();

    if (text.includes("horizontal")) {
        return "horizontal";
    }
    if (text.includes("vertical")) {
        return "vertical";
    }

    return "";
}

function getGuidePosition(guide) {
    return getNumber(guide.coordinate ?? guide.position ?? guide.location ?? guide.$Pstn);
}

function toArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (Array.isArray(value._value)) {
        return value._value;
    }
    if (Array.isArray(value.list)) {
        return value.list;
    }
    if (typeof value[Symbol.iterator] === "function") {
        return Array.from(value);
    }
    if (Number.isInteger(value.length)) {
        const result = [];
        for (let index = 0; index < value.length; index += 1) {
            result.push(value[index]);
        }
        return result;
    }

    return [];
}

function normalizeGuide(guide, source, index) {
    const direction = getGuideDirection(guide);
    const position = getGuidePosition(guide);

    return {
        source,
        index,
        direction,
        position,
        raw: guide,
    };
}

function collectGuides(rawGuides, source) {
    const guides = toArray(rawGuides)
        .map((guide, index) => normalizeGuide(guide, source, index + 1))
        .filter(guide => guide.direction && Number.isFinite(guide.position));

    log(`collect guides from ${source}`, {
        rawCount: toArray(rawGuides).length,
        guides,
    });

    return guides;
}

function uniqueSortedPositions(values, min, max) {
    const result = [min];
    const sorted = values
        .filter(value => Number.isFinite(value))
        .map(value => Math.max(min, Math.min(max, value)))
        .filter(value => value > min && value < max)
        .sort((left, right) => left - right);

    for (const value of sorted) {
        if (Math.abs(value - result[result.length - 1]) > 0.5) {
            result.push(value);
        }
    }

    result.push(max);
    return result;
}

function buildSlices(document, guideResult) {
    const width = getDocumentDimension(document, "width");
    const height = getDocumentDimension(document, "height");
    const xPositions = uniqueSortedPositions(guideResult.verticalGuides, 0, width);
    const yPositions = uniqueSortedPositions(guideResult.horizontalGuides, 0, height);
    const slices = [];

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

    log("slices built", { xPositions, yPositions, slices });
    return slices;
}

function getDocumentTarget(document) {
    if (document && Number.isFinite(document._id)) {
        return [{ _ref: "document", _id: document._id }];
    }

    return [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }];
}

function getDocumentTargetWithApplication(document) {
    return [...getDocumentTarget(document), { _ref: "application" }];
}

async function batchPlayGet(descriptor) {
    const results = await action.batchPlay([descriptor], {
        synchronousExecution: true,
        modalBehavior: "fail",
    });
    const result = results && results[0];

    if (result && result._obj === "error") {
        throw new Error(`batchPlay result ${result.result}`);
    }

    return result;
}

async function readDocumentDescriptorGuides(document) {
    const descriptors = [
        {
            _obj: "get",
            _target: getDocumentTarget(document),
            _options: { dialogOptions: "dontDisplay" },
        },
        {
            _obj: "get",
            _target: getDocumentTargetWithApplication(document),
            _options: { dialogOptions: "dontDisplay" },
        },
    ];

    for (const descriptor of descriptors) {
        try {
            log("read document descriptor", descriptor);
            const result = await batchPlayGet(descriptor);
            log("read document descriptor result", result);
            const guides = [
                ...collectGuides(result && result.guides, "document descriptor guides"),
                ...collectGuides(result && result.guide, "document descriptor guide"),
            ];

            if (guides.length > 0) {
                return guides;
            }
        } catch (error) {
            warn("read document descriptor failed", {
                descriptor,
                message: error && error.message,
            });
        }
    }

    return [];
}

async function readGuidesByIndex(document) {
    const guides = [];
    const targetVariants = [getDocumentTarget(document)];

    for (const targetDocument of targetVariants) {
        let guideCount = 0;

        for (let index = 1; index <= Math.max(guideCount, 1); index += 1) {
            const descriptor = {
                _obj: "get",
                _target: [{ _ref: "guide", _index: index }, ...targetDocument],
                _options: { dialogOptions: "dontDisplay" },
            };

            try {
                log("read guide by index descriptor", descriptor);
                const result = await batchPlayGet(descriptor);
                log("read guide by index result", { index, result });
                if (index === 1) {
                    guideCount = Number.isInteger(result && result.count) ? result.count : 1;
                    log("guide count discovered", { guideCount });
                }
                guides.push(normalizeGuide(result, "guide index", index));
            } catch (error) {
                log("stop reading guide by index", {
                    index,
                    count: guides.length,
                    message: error && error.message,
                    targetDocument,
                });
                break;
            }
        }

        if (guides.length > 0) {
            break;
        }
    }

    return guides.filter(guide => guide.direction && Number.isFinite(guide.position));
}

function readDomGuides(document) {
    return collectGuides(document && document.guides, "document.guides");
}

function readDomGuidesByLength(document) {
    const guideCollection = document && document.guides;
    const length = guideCollection && Number.isInteger(guideCollection.length) ? guideCollection.length : 0;
    const rawGuides = [];

    log("read DOM guides by length", {
        length,
        collectionType: guideCollection && guideCollection.typename,
        constructorName: guideCollection && guideCollection.constructor && guideCollection.constructor.name,
        ownKeys: guideCollection ? Object.keys(guideCollection) : [],
        collection: guideCollection,
    });

    for (let index = 0; index < length; index += 1) {
        const guide = guideCollection[index];
        log("read DOM guide by index", { index, guide });
        rawGuides.push(guide);
    }

    return collectGuides(rawGuides, "document.guides length/index");
}

async function readGuidesWithoutModal(document) {
    const methods = [
        readGuidesByIndex,
        readDocumentDescriptorGuides,
        readDomGuidesByLength,
        readDomGuides,
    ];

    for (const method of methods) {
        try {
            const guides = await method(document);
            if (guides.length > 0) {
                return guides;
            }
        } catch (error) {
            warn(`${method.name} failed`, {
                message: error && error.message,
                stack: error && error.stack,
            });
        }
    }

    return [];
}

export async function readReferenceLines() {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }

    const document = app.activeDocument;
    log("read reference lines start", {
        build: DEBUG_BUILD,
        documentId: document._id,
        documentName: document.title || document.name,
        width: document.width,
        height: document.height,
    });

    const guides = await readGuidesWithoutModal(document);

    const horizontalGuides = guides.filter(guide => guide.direction === "horizontal").map(guide => guide.position);
    const verticalGuides = guides.filter(guide => guide.direction === "vertical").map(guide => guide.position);

    const result = {
        count: guides.length,
        horizontalGuides,
        verticalGuides,
        guides,
    };

    log("read reference lines result", result);
    return result;
}

function formatExportName(index) {
    return `tailoring_${String(index + 1).padStart(2, "0")}.png`;
}

function getCloseWithoutSavingOption() {
    return constants && constants.SaveOptions && constants.SaveOptions.DONOTSAVECHANGES;
}

async function closeWithoutSaving(document) {
    if (!document || typeof document.close !== "function") {
        return;
    }

    if (typeof document.closeWithoutSaving === "function") {
        await document.closeWithoutSaving();
        return;
    }

    const closeOption = getCloseWithoutSavingOption();
    if (closeOption) {
        await document.close(closeOption);
    } else {
        await document.close();
    }
}

async function duplicateDocumentByBatchPlay(sourceDocument, name) {
    const descriptor = {
        _obj: "duplicate",
        _target: getDocumentTarget(sourceDocument),
        name,
        merged: false,
        _options: { dialogOptions: "dontDisplay" },
    };

    log("duplicate document descriptor", descriptor);
    const result = await action.batchPlay([descriptor], {
        synchronousExecution: true,
        modalBehavior: "execute",
    });
    log("duplicate document result", result);

    const duplicatedDocument = app.activeDocument;
    if (!duplicatedDocument) {
        throw new Error("复制文档失败：未找到新建文档");
    }

    return duplicatedDocument;
}

async function runAsModal(task, commandName) {
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            log("executeAsModal start", { commandName, attempt: attempt + 1 });
            return await core.executeAsModal(task, { commandName });
        } catch (error) {
            lastError = error;
            warn("executeAsModal failed", {
                commandName,
                attempt: attempt + 1,
                message: error && error.message,
                error,
            });
            await sleep(150);
        }
    }

    throw lastError || new Error("Photoshop modal 执行失败");
}

async function saveDocumentAsPng(file) {
    const token = await storage.localFileSystem.createSessionToken(file);
    const descriptor = {
        _obj: "save",
        as: {
            _obj: "PNGFormat",
            method: { _enum: "PNGMethod", _value: "quick" },
            PNGInterlaceType: { _enum: "PNGInterlaceType", _value: "PNGInterlaceNone" },
            PNGFilter: { _enum: "PNGFilter", _value: "PNGFilterAdaptive" },
            compression: 6,
        },
        in: {
            _path: token,
            _kind: "local",
        },
        documentID: app.activeDocument && app.activeDocument._id,
        copy: true,
        lowerCase: true,
        saveStage: { _enum: "saveStageType", _value: "saveBegin" },
        _options: { dialogOptions: "dontDisplay" },
    };

    log("save png descriptor", descriptor);
    const result = await action.batchPlay([descriptor], {
        synchronousExecution: true,
        modalBehavior: "execute",
    });
    log("save png result", result);
}

export async function exportSlicesAsPng() {
    if (!app.documents || app.documents.length === 0 || !app.activeDocument) {
        throw new Error("请先打开一个 Photoshop 文档");
    }

    const sourceDocument = app.activeDocument;
    const guideResult = await readReferenceLines();
    const slices = buildSlices(sourceDocument, guideResult);

    if (slices.length === 0) {
        throw new Error("参考线没有形成可导出的切片区域");
    }

    log("choose export folder");
    const folder = await storage.localFileSystem.getFolder();
    if (!folder) {
        throw new Error("已取消选择导出目录");
    }
    log("export folder selected", { name: folder.name, nativePath: folder.nativePath });

    const files = [];
    for (let index = 0; index < slices.length; index += 1) {
        const fileName = formatExportName(index);
        const file = await folder.createFile(fileName, { overwrite: true });
        files.push({ file, fileName });
    }

    await runAsModal(
        async () => {
            for (let index = 0; index < slices.length; index += 1) {
                const slice = slices[index];
                const { file, fileName } = files[index];
                log("export slice start", { index: index + 1, total: slices.length, fileName, slice });

                const sliceDocument = await duplicateDocumentByBatchPlay(sourceDocument, `tailoring_${index + 1}`);
                try {
                    const cropBounds = {
                        left: slice.left,
                        top: slice.top,
                        right: slice.right,
                        bottom: slice.bottom,
                    };
                    log("crop slice bounds", cropBounds);
                    await sliceDocument.crop(cropBounds);
                    await saveDocumentAsPng(file);
                    log("export slice done", { index: index + 1, fileName });
                } finally {
                    await closeWithoutSaving(sliceDocument);
                }
            }
        },
        "Tailoring 导出 PNG 切片",
    );

    const result = {
        count: slices.length,
        folderName: folder.name,
        folderPath: folder.nativePath,
        files: files.map(item => item.fileName),
    };

    log("export png result", result);
    return result;
}
