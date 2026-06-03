import React, { useEffect, useRef, useState } from "react";
import { app } from "photoshop";
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

function getSourceName() {
   try {
      const name = app.activeDocument && (app.activeDocument.title || app.activeDocument.name);
      return String(name || "untitled").replace(/\.[^.\\/]+$/, "");
   } catch (error) {
      log("read source name failed", {
         message: error && error.message,
         error,
      });
      return "untitled";
   }
}

function readTextfieldValue(ref, fallback) {
   const node = ref.current;
   if (!node || node.value === null || node.value === undefined) {
      return fallback;
   }
   return String(node.value);
}

const helpMessages = {
   exportName: {
      title: "导出名称",
      body:
         "支持以下变量：\n" +
         "{name} - 源文件名称\n" +
         "{start=1} - 从指定序号开始, 缩写{s=1}\n" +
         "{padding=2} - 左填充 0 补全，缩写{p=2}\n" +
         "{increment=3} - 增量, 缩写{i=3}\n\n" +
         "示例: {name}-{start=6,p=2,i=3} => 图片-06; 图片-09; 图片-12 ...",
   },
   format: {
      title: "导出格式",
      body: "支持 PNG 和 JPG(JPGR)",
   },
   quality: {
      title: "JPG质量",
      body: "自定义导出时 JPG 的质量，可选值 1 - 12，默认值 10。",
   },
   mode: {
      title: "导出方式",
      body: "1. 根据当前的参考线进行裁切导出\n2. 根据自定义的尺寸信息进行裁切导出",
   },
   size: {
      title: "水平划分 / 垂直划分",
      body:
         "支持像素、百分比、等分量\n" +
         "输入示例：\n" +
         "像素：100px - 按照 100 项目裁切\n" +
         "百分比：50% - 按照 50% 的尺寸裁切\n" +
         "等分量：1 - 裁切为 1 份",
   },
};

export function TailoringPanel({ onClose, onExport }) {
   const exportNameRef = useRef(null);
   const horizontalSizeRef = useRef(null);
   const verticalSizeRef = useRef(null);
   const [busy, setBusy] = useState(false);
   const [helpContent, setHelpContent] = useState(null);
   const [format, setFormat] = useState("png");
   const [quality, setQuality] = useState(10);
   const [mode, setMode] = useState("guides");
   const [status, setStatus] = useState({ text: "", isError: false });
   const [sourceName, setSourceName] = useState("untitled");
   const isCustomSize = mode === "custom";
   useInjectedStyle("ng-tailoring-panel-style", panelCss);

   useEffect(() => {
      const currentSourceName = getSourceName();
      setSourceName(currentSourceName);
      if (exportNameRef.current && !exportNameRef.current.value) {
         exportNameRef.current.value = currentSourceName;
      }
      if (horizontalSizeRef.current && !horizontalSizeRef.current.value) {
         horizontalSizeRef.current.value = "1";
      }
      if (verticalSizeRef.current && !verticalSizeRef.current.value) {
         verticalSizeRef.current.value = "1";
      }
   }, []);

   const handleExport = () => {
      if (busy) {
         return;
      }

      setBusy(true);
      try {
         const exportOptions = {
            format,
            quality,
            exportName: readTextfieldValue(exportNameRef, sourceName),
            mode,
            horizontalSize: readTextfieldValue(horizontalSizeRef, "1"),
            verticalSize: readTextfieldValue(verticalSizeRef, "1"),
         };

         log("export confirmed", exportOptions);
         if (typeof onExport === "function") {
            setStatus({ text: "正在关闭窗口并开始导出...", isError: false });
            onExport(exportOptions);
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
      if (!busy && typeof onClose === "function") {
         onClose();
      }
   };

   return (
      <div className="tailoring-dialog-layout">
         <div className="tailoring-config">
            <div className="tailoring-name-section">
               <sp-field-label class="tailoring-name-label" for="tailoring-name">
                  导出名称
               </sp-field-label>
               <div
                  className="tailoring-name-row"
                  onMouseEnter={() => setHelpContent(helpMessages.exportName)}
                  onFocus={() => setHelpContent(helpMessages.exportName)}>
                  <sp-textfield
                     id="tailoring-name"
                     ref={exportNameRef}
                     disabled={busy}
                     size="s"></sp-textfield>
               </div>
            </div>

            <div className="tailoring-section">
               <div className="tailoring-section-title">导出格式</div>
               <div
                  className="tailoring-format-row"
                  onMouseEnter={() => setHelpContent(helpMessages.format)}
                  onFocus={() => setHelpContent(helpMessages.format)}>
                  <sp-picker
                     id="tailoring-format"
                     size="s"
                     value={format}
                     disabled={busy}
                     onMouseEnter={() => setHelpContent(helpMessages.format)}
                     onFocus={() => setHelpContent(helpMessages.format)}
                     onChange={(event) => setFormat(event.target.value)}>
                     <sp-menu-item value="png" selected={format === "png"}>
                        PNG
                     </sp-menu-item>
                     <sp-menu-item value="jpg" selected={format === "jpg"}>
                        JPG
                     </sp-menu-item>
                  </sp-picker>

                  {format === "jpg" && (
                     <>
                        <sp-field-label
                           class="tailoring-quality-label"
                           for="tailoring-quality"
                           onMouseEnter={() => setHelpContent(helpMessages.quality)}>
                           质量
                        </sp-field-label>
                        <sp-slider
                           id="tailoring-quality"
                           size="s"
                           min="1"
                           max="12"
                           step="1"
                           value={quality}
                           disabled={busy}
                           onMouseEnter={() => setHelpContent(helpMessages.quality)}
                           onFocus={() => setHelpContent(helpMessages.quality)}
                           onInput={(event) => setQuality(Number(event.target.value))}
                           onChange={(event) => setQuality(Number(event.target.value))}></sp-slider>
                        <span className="tailoring-quality-value">{quality}</span>
                     </>
                  )}
               </div>
            </div>

            <div className="tailoring-section">
               <div className="tailoring-section-title">导出方式</div>
               <div
                  className="tailoring-mode-row"
                  onMouseEnter={() => setHelpContent(helpMessages.mode)}
                  onFocus={() => setHelpContent(helpMessages.mode)}>
                  <sp-picker
                     id="tailoring-mode"
                     size="s"
                     value={mode}
                     disabled={busy}
                     onMouseEnter={() => setHelpContent(helpMessages.mode)}
                     onFocus={() => setHelpContent(helpMessages.mode)}
                     onChange={(event) => setMode(event.target.value)}>
                     <sp-menu-item value="guides" selected={mode === "guides"}>
                        依据参考线
                     </sp-menu-item>
                     <sp-menu-item value="custom" selected={mode === "custom"}>
                        自定义尺寸
                     </sp-menu-item>
                  </sp-picker>
               </div>

               <div className="tailoring-size-grid">
                  <div
                     className="tailoring-size-row"
                     onMouseEnter={() => setHelpContent(helpMessages.size)}
                     onFocus={() => setHelpContent(helpMessages.size)}>
                     <sp-field-label class="tailoring-size-label" for="tailoring-horizontal">
                        水平划分
                     </sp-field-label>
                     <sp-textfield
                        id="tailoring-horizontal"
                        ref={horizontalSizeRef}
                        disabled={busy || !isCustomSize}
                        size="s"></sp-textfield>
                  </div>

                  <div
                     className="tailoring-size-row"
                     onMouseEnter={() => setHelpContent(helpMessages.size)}
                     onFocus={() => setHelpContent(helpMessages.size)}>
                     <sp-field-label class="tailoring-size-label" for="tailoring-vertical">
                        垂直划分
                     </sp-field-label>
                     <sp-textfield
                        id="tailoring-vertical"
                        ref={verticalSizeRef}
                        disabled={busy || !isCustomSize}
                        size="s"></sp-textfield>
                  </div>
               </div>
            </div>

            <div className="tailoring-help-box">
               {helpContent && (
                  <>
                     <div className="tailoring-help-box-title">{helpContent.title}</div>
                     <div className="tailoring-help-box-body">{helpContent.body}</div>
                  </>
               )}
            </div>

            <div className={`tailoring-status${status.isError ? " is-error" : ""}`}>{status.text}</div>
         </div>

         <div className="tailoring-dialog-actions">
            <sp-button size="s" variant="cta" disabled={busy} onClick={handleExport}>
               导出
            </sp-button>
            <sp-button size="s" variant="secondary" disabled={busy} onClick={handleCancel}>
               取消
            </sp-button>
         </div>
      </div>
   );
}
