import React, { useState } from "react";
import panelCss from "./panel.css?inline";
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

export function TailoringPanel({ onClose, onExport }) {
    const [busy, setBusy] = useState(false);
    const [format, setFormat] = useState("png");
    const [quality, setQuality] = useState(10);
    const [status, setStatus] = useState({ text: "设置导出格式后开始导出", isError: false });
    useInjectedStyle("ng-tailoring-panel-style", panelCss);

    const handleExport = () => {
        if (busy) {
            return;
        }

        setBusy(true);
        try {
            log("export confirmed", { format, quality });
            if (typeof onExport === "function") {
                setStatus({ text: "正在关闭窗口并开始导出...", isError: false });
                onExport({ format, quality });
            } else {
                setStatus({ text: "导出入口未初始化", isError: true });
                setBusy(false);
            }
        } catch (error) {
            log("export submit failed", {
                message: error && error.message,
                stack: error && error.stack,
                error,
            });
            setStatus({
                text: (error && error.message) || "导出失败",
                isError: true,
            });
            setBusy(false);
        }
    };

    const handleCancel = () => {
        if (busy) {
            return;
        }
        if (typeof onClose === "function") {
            onClose();
        }
    };

    return (
        <div className="tailoring-panel">
            <h2 className="tailoring-title">Tailoring</h2>
            <p className="tailoring-help">根据当前文档参考线裁切并导出。</p>

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
                <sp-action-button size="s" variant="secondary" disabled={busy} onClick={handleCancel}>
                    取消
                </sp-action-button>
                <sp-action-button size="s" variant="cta" disabled={busy} onClick={handleExport}>
                    裁切导出
                </sp-action-button>
            </div>

            <div className={`tailoring-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
        </div>
    );
}
