import React, { useEffect, useRef, useState } from "react";
import panelCss from "./panel.css?inline";
import { chooseOutputFolder } from "./tailoringService.js";
import { useInjectedStyle } from "../../util/useInjectedStyle.js";

const DEFAULT_NAME_TEMPLATE = "{name}_{s=1,p=2}";

function debugLog(message, detail) {
    if (typeof console === "undefined" || typeof console.log !== "function") {
        return;
    }

    if (detail === undefined) {
        console.log(`[Tailoring] ${message}`);
    } else {
        console.log(`[Tailoring] ${message}`, detail);
    }
}

function readTextfieldValue(ref) {
    const node = ref.current;
    if (!node || node.value === null || node.value === undefined) {
        return "";
    }

    return String(node.value);
}

function readSelectValue(ref) {
    const node = ref.current;
    if (!node || !node.value) {
        return "png";
    }

    return String(node.value);
}

function getFolderLabel(folder) {
    if (!folder) {
        return "未选择导出目录";
    }
    return folder.nativePath || folder.name || "已选择导出目录";
}

export function TailoringPanel({ onClose, onExport }) {
    const nameInputRef = useRef(null);
    const formatSelectRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [folder, setFolder] = useState(null);
    const [status, setStatus] = useState({ text: "", isError: false });
    useInjectedStyle("ng-tailoring-panel-style", panelCss);

    const updateStatus = (text, isError = false) => {
        setStatus({ text, isError });
    };

    useEffect(() => {
        if (nameInputRef.current && !nameInputRef.current.value) {
            nameInputRef.current.value = DEFAULT_NAME_TEMPLATE;
        }
        if (formatSelectRef.current && !formatSelectRef.current.value) {
            formatSelectRef.current.value = "png";
        }
        updateStatus("请设置导出格式、名称规则和导出目录");
    }, []);

    const handleChooseFolder = async () => {
        if (busy) {
            return;
        }

        try {
            debugLog("folder picker open");
            const selectedFolder = await chooseOutputFolder();
            if (selectedFolder) {
                setFolder(selectedFolder);
                updateStatus("已选择导出目录");
                debugLog("folder picker selected", {
                    name: selectedFolder.name,
                    nativePath: selectedFolder.nativePath,
                });
            } else {
                debugLog("folder picker canceled");
            }
        } catch (error) {
            debugLog("folder picker failed", {
                message: error && error.message,
                stack: error && error.stack,
            });
            updateStatus((error && error.message) || "选择目录失败", true);
        }
    };

    const handleExport = () => {
        if (busy) {
            updateStatus("请稍候，导出正在执行", true);
            return;
        }
        if (!folder) {
            updateStatus("请先选择导出目录", true);
            return;
        }

        setBusy(true);
        try {
            const exportOptions = {
                format: readSelectValue(formatSelectRef),
                nameTemplate: readTextfieldValue(nameInputRef) || DEFAULT_NAME_TEMPLATE,
                folder,
            };

            debugLog("export button clicked", {
                format: exportOptions.format,
                nameTemplate: exportOptions.nameTemplate,
                hasFolder: Boolean(folder),
                folder: folder && { name: folder.name, nativePath: folder.nativePath },
            });

            if (typeof onExport === "function") {
                updateStatus("正在关闭设置窗口并开始导出");
                onExport(exportOptions);
            } else {
                updateStatus("导出入口未初始化", true);
                setBusy(false);
            }
        } catch (error) {
            debugLog("export failed in panel", {
                message: error && error.message,
                stack: error && error.stack,
            });
            updateStatus((error && error.message) || "导出失败", true);
            setBusy(false);
        }
    };

    const handleCancel = () => {
        if (!busy && typeof onClose === "function") {
            onClose();
        }
    };

    return (
        <div className="tailoring-panel">
            <h2 className="tailoring-title">Tailoring</h2>
            <p className="tailoring-help">按当前文档参考线切分内容，并批量导出为 JPG 或 PNG。</p>

            <div className="tailoring-row">
                <sp-field-label class="tailoring-label" for="tailoring-format">
                    导出格式
                </sp-field-label>
                <select id="tailoring-format" ref={formatSelectRef} disabled={busy} defaultValue="png">
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                </select>
            </div>

            <div className="tailoring-row">
                <sp-field-label class="tailoring-label" for="tailoring-name">
                    自定义名称
                </sp-field-label>
                <sp-textfield id="tailoring-name" ref={nameInputRef} size="s" disabled={busy}></sp-textfield>
                <p className="tailoring-help">
                    {`可用 {name} 表示原名称，{start=1,padding=2,increment=2} 或 {s=1,p=2,i=2} 表示序列。`}
                </p>
            </div>

            <div className="tailoring-row">
                <sp-field-label class="tailoring-label">导出目录</sp-field-label>
                <div className="tailoring-folder">{getFolderLabel(folder)}</div>
            </div>

            <div className="tailoring-actions">
                <sp-action-button size="s" variant="secondary" disabled={busy} onClick={handleChooseFolder}>
                    选择目录
                </sp-action-button>
                <sp-action-button size="s" variant="secondary" disabled={busy} onClick={handleCancel}>
                    取消
                </sp-action-button>
                <sp-action-button size="s" variant="cta" disabled={busy || !folder} onClick={handleExport}>
                    开始导出
                </sp-action-button>
            </div>

            <div className={`tailoring-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
        </div>
    );
}
