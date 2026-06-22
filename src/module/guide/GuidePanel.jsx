import React, { useRef, useState } from "react";
import commonPanelCss from "../../panelCommon.css?inline";
import panelCss from "./panel.css?inline";
import { clearAllGuides, createGuides, isTransientBusyError, parsePositionList } from "./guideService.js";
import { useInjectedStyle } from "../../util/useInjectedStyle.js";
import { useNativeEvent } from "../../util/useNativeEvent.js";

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
    const createButtonRef = useRef(null);
    const clearInputButtonRef = useRef(null);
    const clearGuidesButtonRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState({ text: "", isError: false });
    useInjectedStyle("ng-common-panel-style", commonPanelCss);
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

    useNativeEvent(createButtonRef, "click", handleCreateGuides);
    useNativeEvent(clearInputButtonRef, "click", handleClearInput);
    useNativeEvent(clearGuidesButtonRef, "click", handleClearGuides);

    return (
       <div className="guide-panel">
          <div className="guide-row">
             <sp-label class="guide-label ng-label">水平位置（Y）</sp-label>
             <sp-textfield
                id="horizontal-input"
                class="guide-textfield ng-textfield"
                ref={horizontalInputRef}
                size="s"
                disabled={busy ? true : undefined}></sp-textfield>
          </div>

          <div className="guide-row">
             <sp-label class="guide-label ng-label">垂直位置（X）</sp-label>
             <sp-textfield
                id="vertical-input"
                class="guide-textfield ng-textfield"
                ref={verticalInputRef}
                size="s"
                disabled={busy ? true : undefined}></sp-textfield>
          </div>

          <div className="guide-actions">
             <div className="guide-button-box">
                <sp-action-button
                   type="button"
                   class="guide-button"
                   variant="cta"
                   size="s"
                   ref={createButtonRef}
                   disabled={busy ? true : undefined}>
                   创建参考线
                </sp-action-button>
             </div>
             <div className="guide-button-box">
                <sp-action-button
                   type="button"
                   class="guide-button"
                   variant="secondary"
                   size="s"
                   ref={clearInputButtonRef}
                   disabled={busy ? true : undefined}>
                   清空输入
                </sp-action-button>
             </div>
             <div className="guide-button-box">
                <sp-action-button
                   type="button"
                   class="guide-button"
                   variant="secondary"
                   size="s"
                   ref={clearGuidesButtonRef}
                   disabled={busy ? true : undefined}>
                   清空参考线
                </sp-action-button>
             </div>
          </div>

          <div className={`guide-status ng-status${status.isError ? " is-error" : " is-success"}`}>{status.text}</div>
       </div>
    );
}
