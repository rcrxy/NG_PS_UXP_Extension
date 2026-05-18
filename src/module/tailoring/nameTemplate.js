const FILENAME_RESERVED_RE = /[<>:"/\\|?*\u0000-\u001f]/g;

function normalizeText(value) {
    if (typeof value === "string") {
        return value;
    }
    if (value === null || value === undefined) {
        return "";
    }
    return String(value);
}

export function stripDocumentExtension(name) {
    const normalized = normalizeText(name).trim();
    return normalized.replace(/\.[^.\\/]+$/, "") || "untitled";
}

export function sanitizeFilePart(value) {
    const sanitized = normalizeText(value)
        .replace(FILENAME_RESERVED_RE, "_")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/, "");

    return sanitized || "slice";
}

function parseInteger(rawValue, fallback, optionName, minimum) {
    if (rawValue === undefined || rawValue === "") {
        return fallback;
    }

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error(`${optionName} 必须是${minimum > 0 ? "正整数" : "非负整数"}`);
    }

    return value;
}

function parseSequenceToken(token) {
    const parts = token
        .split(",")
        .map(part => part.trim())
        .filter(Boolean);
    const options = {};

    for (const part of parts) {
        const [rawKey, rawValue] = part.split("=").map(item => item && item.trim());
        if (!rawKey || rawValue === undefined) {
            throw new Error(`命名序列参数无效：${part}`);
        }

        const key = rawKey.toLowerCase();
        if (key === "start" || key === "s") {
            options.start = rawValue;
        } else if (key === "padding" || key === "p") {
            options.padding = rawValue;
        } else if (key === "increment" || key === "i") {
            options.increment = rawValue;
        } else {
            throw new Error(`未知命名序列参数：${rawKey}`);
        }
    }

    if (options.start === undefined) {
        throw new Error("命名序列必须包含 start 或 s");
    }

    return {
        start: parseInteger(options.start, 1, "start", 0),
        padding: parseInteger(options.padding, 0, "padding", 0),
        increment: parseInteger(options.increment, 1, "increment", 1),
    };
}

function formatSequence(sequence, index) {
    const value = sequence.start + index * sequence.increment;
    const text = String(value);
    return sequence.padding > 0 ? text.padStart(sequence.padding, "0") : text;
}

export function formatTailoringName(template, documentName, index) {
    const baseName = sanitizeFilePart(stripDocumentExtension(documentName));
    const normalizedTemplate = normalizeText(template).trim() || "{name}_{s=1,p=2}";
    let hasContent = false;

    const formatted = normalizedTemplate.replace(/\{([^{}]+)\}/g, (match, rawToken) => {
        const token = rawToken.trim();
        if (token.toLowerCase() === "name") {
            hasContent = true;
            return baseName;
        }

        if (/^(start|s)\s*=/.test(token.toLowerCase())) {
            hasContent = true;
            return formatSequence(parseSequenceToken(token), index);
        }

        return match;
    });

    const sanitized = sanitizeFilePart(formatted);
    if (!hasContent || !sanitized) {
        throw new Error("命名规则至少需要包含 {name} 或 {s=1}");
    }

    return sanitized;
}
