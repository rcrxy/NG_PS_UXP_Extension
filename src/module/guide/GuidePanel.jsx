import React, { useRef, useState } from "react";
import spectrumNativeCss from "../../spectrumNative.css?inline";
import panelCss from "./panel.css?inline";
import { clearAllGuides, createGuides, isTransientBusyError, parsePositionList } from "./guideService.js";
import { useInjectedStyle } from "../../util/useInjectedStyle.js";

function readTextfieldValue(ref) {
    const node = ref.current;
    if (!node || node.value === null || node.value === undefined) {
        return "";
    }

    return String(node.value);
}

export function GuidePanel() {
    const horizontalInputRef = useRef(null);
    const verticalInputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState({ text: "", isError: false });
    useInjectedStyle("ng-spectrum-native-style", spectrumNativeCss);
    useInjectedStyle("ng-guide-panel-style", panelCss);

    const updateStatus = (text, isError = false) => {
        setStatus({ text, isError });
    };

    const handleCreateGuides = async () => {
        if (busy) {
            updateStatus("请稍候，命令正在执行", true);
            return;
        }

        setBusy(true);
        try {
            const horizontalPositions = parsePositionList(readTextfieldValue(horizontalInputRef), "水平输入");
            const verticalPositions = parsePositionList(readTextfieldValue(verticalInputRef), "垂直输入");
            const guides = [
                ...horizontalPositions.map(item => ({
                    orientation: "horizontal",
                    position: item.value,
                    unit: item.unit,
                })),
                ...verticalPositions.map(item => ({
                    orientation: "vertical",
                    position: item.value,
                    unit: item.unit,
                })),
            ];

            if (guides.length === 0) {
                throw new Error("请输入至少一个参考线位置");
            }

            await createGuides(guides, updateStatus);
            updateStatus(
                `创建完成：共 ${guides.length} 条（水平 ${horizontalPositions.length} / 垂直 ${verticalPositions.length}）`,
            );
        } catch (error) {
            if (isTransientBusyError(error)) {
                updateStatus("Photoshop 当前正忙，请稍后重试", true);
            } else {
                updateStatus((error && error.message) || "创建失败", true);
            }
        } finally {
            setBusy(false);
        }
    };

    const handleClearInput = () => {
        if (busy) {
            return;
        }

        if (horizontalInputRef.current) {
            horizontalInputRef.current.value = "";
        }
        if (verticalInputRef.current) {
            verticalInputRef.current.value = "";
        }
        updateStatus("已清空输入内容");
    };

    const handleClearGuides = async () => {
        if (busy) {
            updateStatus("请稍候，命令正在执行", true);
            return;
        }

        const confirmed = confirm("确定要清空当前文档的所有参考线吗？此操作不可撤销。");
        if (!confirmed) {
            updateStatus("已取消清空操作");
            return;
        }

        setBusy(true);
        try {
            await clearAllGuides(updateStatus);
            updateStatus("已清空当前文档参考线");
        } catch (error) {
            if (isTransientBusyError(error)) {
                updateStatus("Photoshop 当前正忙，请稍后重试", true);
            } else {
                updateStatus((error && error.message) || "清除失败", true);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="guide-panel">
            <div className="guide-row">
                <label className="guide-label" htmlFor="horizontal-input">
                    水平位置（Y）
                </label>
                <input
                    type="text"
                    id="horizontal-input"
                    className="guide-textfield spectrum-Textfield-input"
                    ref={horizontalInputRef}
                    disabled={busy}
                />
            </div>

            <div className="guide-row">
                <label className="guide-label" htmlFor="vertical-input">
                    垂直位置（X）
                </label>
                <input
                    type="text"
                    id="vertical-input"
                    className="guide-textfield spectrum-Textfield-input"
                    ref={verticalInputRef}
                    disabled={busy}
                />
            </div>

            <div className="guide-actions">
                <div className="button-box">
                    <button
                        type="button"
                        className="guide-button spectrum-Button spectrum-Button--sizeS spectrum-Button--accent"
                        disabled={busy}
                        onClick={handleCreateGuides}>
                        创建参考线
                    </button>
                </div>
                <div className="button-box">
                    <button
                        type="button"
                        className="guide-button spectrum-Button spectrum-Button--sizeS spectrum-Button--secondary"
                        disabled={busy}
                        onClick={handleClearInput}>
                        清空输入
                    </button>
                </div>
                <div className="button-box">
                    <button
                        type="button"
                        className="guide-button spectrum-Button spectrum-Button--sizeS spectrum-Button--secondary"
                        disabled={busy}
                        onClick={handleClearGuides}>
                        清空参考线
                    </button>
                </div>
            </div>

            <div className={`guide-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
        </div>
    );
}
