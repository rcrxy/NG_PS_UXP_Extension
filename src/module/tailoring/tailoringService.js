import { app, action } from "photoshop";

const DEBUG_BUILD = "read-guides-only-index-count-v5";

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
