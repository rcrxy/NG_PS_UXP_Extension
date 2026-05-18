import React from "react";
import { createRoot } from "react-dom/client";
import { entrypoints } from "uxp";
import { GuidePanel } from "./module/guide/GuidePanel.jsx";
import { TailoringPanel } from "./module/tailoring/TailoringPanel.jsx";

const panelRoots = new WeakMap();

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

    root.render(<PanelComponent />);
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
        "tailoring-panel": {
            show(event) {
                try {
                    renderPanel(event.node, TailoringPanel);
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
});
