import React from "react";
import { createRoot } from "react-dom/client";
import { entrypoints } from "uxp";
import { registerSpectrumComponents } from "./spectrumComponents.js";
import { GuidePanel } from "./module/guide/GuidePanel.jsx";
import { TailoringPanel } from "./module/tailoring/TailoringPanel.jsx";
import { exportSlices } from "./module/tailoring/tailoringService.js";

const spectrumComponentsReady = registerSpectrumComponents().catch(error => {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[Spectrum] component registration failed", error);
    }

    return [];
});

const panelRoots = new WeakMap();
let tailoringDialog = null;

function getErrorText(error) {
    return (error && (error.stack || error.message)) || "面板加载失败";
}

function renderError(node, error) {
    const detail = getErrorText(error);
    node.innerHTML = `<div style="padding:12px;color:#ffdddd;background:#5b1111;white-space:pre-wrap;">${detail}</div>`;
}

function renderPanel(node, PanelComponent) {
    if (!node) {
        throw new Error("面板初始化失败：未提供挂载节点");
    }

    node.style.width = "100%";
    node.style.height = "100%";
    node.style.overflow = "auto";

    let root = panelRoots.get(node);
    if (!root) {
        root = createRoot(node);
        panelRoots.set(node, root);
    }

    spectrumComponentsReady
        .then(() => {
            root.render(<PanelComponent />);
        })
        .catch(error => {
            renderError(node, error);
        });
}

function logTailoring(message, detail) {
    if (typeof console === "undefined" || typeof console.log !== "function") {
        return;
    }

    if (detail === undefined) {
        console.log(`[Tailoring] ${message}`);
    } else {
        console.log(`[Tailoring] ${message}`, detail);
    }
}

function showTailoringMessage(message) {
    if (typeof alert === "function") {
        alert(message);
    }
}

async function runTailoringExport(options) {
    try {
        logTailoring("export starts after dialog closed", options);
        const result = await exportSlices(options);
        const message = `导出完成：共 ${result.count} 个 ${result.format.toUpperCase()}`;
        logTailoring(message, result);
        showTailoringMessage(message);
    } catch (error) {
        const message = (error && error.message) || "导出失败";
        logTailoring("export failed after dialog closed", {
            message,
            stack: error && error.stack,
            error,
        });
        showTailoringMessage(message);
    }
}

async function showTailoringDialog() {
    if (tailoringDialog) {
        return;
    }

    await spectrumComponentsReady;

    const dialog = document.createElement("dialog");
    dialog.className = "tailoring-command-dialog";
    dialog.style.width = "520px";
    dialog.style.height = "430px";
    dialog.style.padding = "0";
    dialog.style.background = "#2f2f2f";
    dialog.style.color = "#e6e6e6";

    const mountNode = document.createElement("div");
    mountNode.style.width = "100%";
    mountNode.style.height = "100%";
    mountNode.style.minHeight = "260px";
    mountNode.style.background = "#2f2f2f";
    dialog.appendChild(mountNode);
    document.body.appendChild(dialog);

    const root = createRoot(mountNode);
    let cleaned = false;
    let waitsForUxpModalResult = false;
    let pendingExportOptions = null;

    const cleanupDom = () => {
        if (cleaned) {
            return;
        }
        cleaned = true;
        root.unmount();
        if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
        }
        if (tailoringDialog === dialog) {
            tailoringDialog = null;
        }
    };

    const runPendingExport = () => {
        const exportOptions = pendingExportOptions;
        pendingExportOptions = null;
        if (exportOptions) {
            setTimeout(() => {
                runTailoringExport(exportOptions);
            }, 120);
        }
    };

    const cleanupAndRunPendingExport = () => {
        cleanupDom();
        runPendingExport();
    };

    const closeDialog = () => {
        if (typeof dialog.close === "function") {
            dialog.close();
        } else {
            cleanupAndRunPendingExport();
        }
    };

    const scheduleExport = options => {
        pendingExportOptions = options;
        closeDialog();
    };

    tailoringDialog = dialog;
    root.render(<TailoringPanel onClose={closeDialog} onExport={scheduleExport} />);
    dialog.addEventListener(
        "close",
        () => {
            if (waitsForUxpModalResult) {
                cleanupDom();
            } else {
                cleanupAndRunPendingExport();
            }
        },
        { once: true },
    );

    if (typeof dialog.uxpShowModal === "function") {
        waitsForUxpModalResult = true;
        const modalResult = dialog.uxpShowModal({
            title: "自定义导出",
            resize: "none",
            size: {
                width: 520,
                height: 430,
            },
        });

        if (modalResult && typeof modalResult.then === "function") {
            modalResult.finally(cleanupAndRunPendingExport);
        }
        return;
    }

    if (typeof dialog.showModal === "function") {
        dialog.showModal();
    }
}

entrypoints.setup({
    panels: {
        "guide-panel": {
            show(event) {
                try {
                    renderPanel(event.node, GuidePanel);
                } catch (error) {
                    renderError(event.node, error);
                }
            },
            hide(event) {
                const root = panelRoots.get(event.node);
                if (root) {
                    root.unmount();
                    panelRoots.delete(event.node);
                }
            },
        },
    },
    commands: {
        "tailoring-command": {
            run() {
                showTailoringDialog();
            },
        },
    },
});
