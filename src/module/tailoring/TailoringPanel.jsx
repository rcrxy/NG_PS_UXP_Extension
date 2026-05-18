import React, { useState } from "react";
import panelCss from "./panel.css?inline";
import { exportSlices, readReferenceLines } from "./tailoringService.js";
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
    const [format, setFormat] = useState("png");
    const [quality, setQuality] = useState(10);
    const [status, setStatus] = useState({ text: "格式选择调试版 v10", isError: false });
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

    const handleExport = async () => {
        if (busy) {
            return;
        }

        setBusy(true);
        setStatus({ text: `正在裁切并导出 ${format.toUpperCase()}...`, isError: false });

        try {
            log("export button clicked", { format, quality });
            const result = await exportSlices({ format, quality });
            setStatus({
                text: `导出完成：共 ${result.count} 个 ${result.format.toUpperCase()}`,
                isError: false,
            });
        } catch (error) {
            log("export failed", {
                message: error && error.message,
                stack: error && error.stack,
                error,
            });
            setStatus({
                text: (error && error.message) || "导出失败",
                isError: true,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="tailoring-panel">
            <h2 className="tailoring-title">Tailoring</h2>
            <p className="tailoring-help">根据参考线裁切并导出，当前支持 PNG/JPG。调试版 v10。</p>

            <div className="tailoring-row">
                <sp-field-label class="tailoring-label" for="tailoring-format">
                    导出格式
                </sp-field-label>
                <select
                    id="tailoring-format"
                    className="tailoring-select"
                    disabled={busy}
                    value={format}
                    onChange={event => setFormat(event.target.value)}>
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                </select>
            </div>

            {format === "jpg" && (
                <div className="tailoring-row">
                    <div className="tailoring-label-row">
                        <sp-field-label class="tailoring-label" for="tailoring-quality">
                            JPG 质量
                        </sp-field-label>
                        <span className="tailoring-quality-value">{quality}</span>
                    </div>
                    <input
                        id="tailoring-quality"
                        className="tailoring-range"
                        type="range"
                        min="1"
                        max="12"
                        step="1"
                        disabled={busy}
                        value={quality}
                        onChange={event => setQuality(Number(event.target.value))}
                    />
                </div>
            )}

            <div className="tailoring-actions">
                <sp-action-button size="s" variant="cta" disabled={busy} onClick={handleReadGuides}>
                    读取参考线
                </sp-action-button>
                <sp-action-button size="s" variant="cta" disabled={busy} onClick={handleExport}>
                    裁切导出
                </sp-action-button>
            </div>

            <div className={`tailoring-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
        </div>
    );
}
