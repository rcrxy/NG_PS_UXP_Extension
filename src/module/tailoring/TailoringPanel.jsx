import React, { useState } from "react";
import panelCss from "./panel.css?inline";
import { readReferenceLines } from "./tailoringService.js";
import { useInjectedStyle } from "../../util/useInjectedStyle.js";

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

export function TailoringPanel() {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState({ text: "读取参考线调试版 v5", isError: false });
    useInjectedStyle("ng-tailoring-panel-style", panelCss);

    const handleReadGuides = async () => {
        if (busy) {
            return;
        }

        setBusy(true);
        setStatus({ text: "正在读取参考线...", isError: false });

        try {
            log("read button clicked");
            const result = await readReferenceLines();
            setStatus({
                text: `读取完成：共 ${result.count} 条（水平 ${result.horizontalGuides.length} / 垂直 ${result.verticalGuides.length}）`,
                isError: false,
            });
        } catch (error) {
            log("read reference lines failed", {
                message: error && error.message,
                stack: error && error.stack,
                error,
            });
            setStatus({
                text: (error && error.message) || "读取参考线失败",
                isError: true,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="tailoring-panel">
            <h2 className="tailoring-title">Tailoring</h2>
            <p className="tailoring-help">当前仅保留读取参考线功能，结果会输出到控制台。调试版 v5。</p>

            <div className="tailoring-actions">
                <sp-action-button size="s" variant="cta" disabled={busy} onClick={handleReadGuides}>
                    读取参考线
                </sp-action-button>
            </div>

            <div className={`tailoring-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
        </div>
    );
}
