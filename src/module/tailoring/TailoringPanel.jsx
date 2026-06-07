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

function useNativeEvent(ref, eventName, handler) {
   const handlerRef = useRef(handler);

   useEffect(() => {
      handlerRef.current = handler;
   });

   useEffect(() => {
      const node = ref.current;
      if (!node || typeof node.addEventListener !== "function") {
         return undefined;
      }

      const listener = (event) => handlerRef.current(event);
      node.addEventListener(eventName, listener);
      return () => node.removeEventListener(eventName, listener);
   });
}

function setDropdownSelectedIndex(node, selectedIndex) {
   if (!node) {
      return;
   }

   node.selectedIndex = selectedIndex;
   const menuItems = typeof node.querySelectorAll === "function" ? node.querySelectorAll("sp-menu-item") : [];
   Array.from(menuItems).forEach((item, index) => {
      const isSelected = index === selectedIndex;
      item.selected = isSelected;
      if (isSelected) {
         item.setAttribute("selected", "");
      } else {
         item.removeAttribute("selected");
      }
   });
}

function getDropdownValue(node, values, fallback) {
   const selectedIndex = Number(node && node.selectedIndex);
   if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < values.length) {
      return values[selectedIndex];
   }

   return fallback;
}

function readSliderNumber(node, fallback) {
   const value = Number(node && node.value);
   return Number.isFinite(value) ? value : fallback;
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
      body: "支持 PNG 和 JPG",
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

const formatOptions = ["png", "jpg"];
const modeOptions = ["guides", "custom"];

export function TailoringPanel({ onClose, onExport }) {
   const exportNameRef = useRef(null);
   const horizontalSizeRef = useRef(null);
   const verticalSizeRef = useRef(null);
   const formatDropdownRef = useRef(null);
   const modeDropdownRef = useRef(null);
   const qualitySliderRef = useRef(null);
   const exportButtonRef = useRef(null);
   const cancelButtonRef = useRef(null);
   const [busy, setBusy] = useState(false);
   const [helpContent, setHelpContent] = useState(helpMessages.exportName);
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

   useEffect(() => {
      setDropdownSelectedIndex(formatDropdownRef.current, formatOptions.indexOf(format));
   }, [format]);

   useEffect(() => {
      setDropdownSelectedIndex(modeDropdownRef.current, modeOptions.indexOf(mode));
   }, [mode]);

   useEffect(() => {
      if (qualitySliderRef.current) {
         qualitySliderRef.current.value = quality;
      }
   }, [format, quality]);

   const handleFormatChange = (event) => {
      const nextFormat = getDropdownValue(event.target, formatOptions, format);
      setFormat(nextFormat);
      setHelpContent(nextFormat === "jpg" ? helpMessages.quality : helpMessages.format);
   };

   const handleQualityChange = (event) => {
      setQuality(Math.max(1, Math.min(12, Math.round(readSliderNumber(event.target, quality)))));
      setHelpContent(helpMessages.quality);
   };

   const handleModeChange = (event) => {
      const nextMode = getDropdownValue(event.target, modeOptions, mode);
      setMode(nextMode);
      setHelpContent(nextMode === "custom" ? helpMessages.size : helpMessages.mode);
      if (nextMode === "custom") {
         setStatus({ text: "自定义尺寸导出暂未实现，请先使用依据参考线导出。", isError: true });
      } else {
         setStatus({ text: "", isError: false });
      }
   };

   const handleExport = () => {
      if (busy) {
         return;
      }

      if (isCustomSize) {
         setStatus({ text: "自定义尺寸导出暂未实现，请先选择依据参考线。", isError: true });
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

   useNativeEvent(formatDropdownRef, "change", handleFormatChange);
   useNativeEvent(formatDropdownRef, "mouseenter", () => setHelpContent(helpMessages.format));
   useNativeEvent(formatDropdownRef, "focus", () => setHelpContent(helpMessages.format));
   useNativeEvent(exportNameRef, "mouseenter", () => setHelpContent(helpMessages.exportName));
   useNativeEvent(exportNameRef, "focus", () => setHelpContent(helpMessages.exportName));
   useNativeEvent(qualitySliderRef, "input", handleQualityChange);
   useNativeEvent(qualitySliderRef, "change", handleQualityChange);
   useNativeEvent(qualitySliderRef, "mouseenter", () => setHelpContent(helpMessages.quality));
   useNativeEvent(qualitySliderRef, "focus", () => setHelpContent(helpMessages.quality));
   useNativeEvent(modeDropdownRef, "change", handleModeChange);
   useNativeEvent(modeDropdownRef, "mouseenter", () => setHelpContent(helpMessages.mode));
   useNativeEvent(modeDropdownRef, "focus", () => setHelpContent(helpMessages.mode));
   useNativeEvent(horizontalSizeRef, "mouseenter", () => setHelpContent(helpMessages.size));
   useNativeEvent(horizontalSizeRef, "focus", () => setHelpContent(helpMessages.size));
   useNativeEvent(verticalSizeRef, "mouseenter", () => setHelpContent(helpMessages.size));
   useNativeEvent(verticalSizeRef, "focus", () => setHelpContent(helpMessages.size));
   useNativeEvent(exportButtonRef, "click", handleExport);
   useNativeEvent(cancelButtonRef, "click", handleCancel);

   return (
      <div className="tailoring-dialog-layout">
         <div className="tailoring-config">
            <div className="tailoring-name-section">
               <sp-label class="tailoring-name-label">导出名称</sp-label>
               <div
                  className="tailoring-name-row"
                  onMouseEnter={() => setHelpContent(helpMessages.exportName)}
                  onFocus={() => setHelpContent(helpMessages.exportName)}>
                  <sp-textfield
                     id="tailoring-name"
                     class="tailoring-textfield"
                     ref={exportNameRef}
                     size="s"
                     disabled={busy ? true : undefined}></sp-textfield>
               </div>
            </div>

            <div className="tailoring-section">
               <div className="tailoring-section-title">导出格式</div>
               <div
                  className="tailoring-format-row"
                  onMouseEnter={() => setHelpContent(helpMessages.format)}
                  onFocus={() => setHelpContent(helpMessages.format)}>
                  <sp-dropdown
                     id="tailoring-format"
                     class="tailoring-picker"
                     ref={formatDropdownRef}
                     size="s"
                     disabled={busy ? true : undefined}
                     onMouseEnter={() => setHelpContent(helpMessages.format)}
                     onFocus={() => setHelpContent(helpMessages.format)}>
                     <sp-menu slot="options">
                        <sp-menu-item selected={format === "png" ? true : undefined}>PNG</sp-menu-item>
                        <sp-menu-item selected={format === "jpg" ? true : undefined}>JPG</sp-menu-item>
                     </sp-menu>
                  </sp-dropdown>

                  <div className={`tailoring-quality-controls${format === "jpg" ? " is-visible" : ""}`} aria-hidden={format === "jpg" ? "false" : "true"}>
                     <sp-label class="tailoring-quality-label" onMouseEnter={() => setHelpContent(helpMessages.quality)}>
                        质量
                     </sp-label>
                     <sp-slider
                        id="tailoring-quality"
                        class="tailoring-slider"
                        min="1"
                        max="12"
                        value={quality}
                        ref={qualitySliderRef}
                        size="s"
                        disabled={busy || format !== "jpg" ? true : undefined}
                        onMouseEnter={() => setHelpContent(helpMessages.quality)}
                        onFocus={() => setHelpContent(helpMessages.quality)}></sp-slider>
                     <sp-label class="tailoring-quality-value">{quality}</sp-label>
                  </div>
               </div>
            </div>

            <div className="tailoring-section">
               <div className="tailoring-section-title">导出方式</div>
               <div
                  className="tailoring-mode-row"
                  onMouseEnter={() => setHelpContent(helpMessages.mode)}
                  onFocus={() => setHelpContent(helpMessages.mode)}>
                  <sp-dropdown
                     id="tailoring-mode"
                     class="tailoring-picker"
                     ref={modeDropdownRef}
                     size="s"
                     disabled={busy ? true : undefined}
                     onMouseEnter={() => setHelpContent(helpMessages.mode)}
                     onFocus={() => setHelpContent(helpMessages.mode)}>
                     <sp-menu slot="options">
                        <sp-menu-item selected={mode === "guides" ? true : undefined}>依据参考线</sp-menu-item>
                        <sp-menu-item selected={mode === "custom" ? true : undefined}>自定义尺寸</sp-menu-item>
                     </sp-menu>
                  </sp-dropdown>
               </div>

               <div className="tailoring-size-grid">
                  <div
                     className="tailoring-size-row"
                     onMouseEnter={() => setHelpContent(helpMessages.size)}
                     onFocus={() => setHelpContent(helpMessages.size)}>
                     <sp-label class="tailoring-size-label">水平划分</sp-label>
                     <sp-textfield
                        id="tailoring-horizontal"
                        class="tailoring-textfield"
                        ref={horizontalSizeRef}
                        size="s"
                        disabled={busy || !isCustomSize ? true : undefined}></sp-textfield>
                  </div>

                  <div
                     className="tailoring-size-row"
                     onMouseEnter={() => setHelpContent(helpMessages.size)}
                     onFocus={() => setHelpContent(helpMessages.size)}>
                     <sp-label class="tailoring-size-label">垂直划分</sp-label>
                     <sp-textfield
                        id="tailoring-vertical"
                        class="tailoring-textfield"
                        ref={verticalSizeRef}
                        size="s"
                        disabled={busy || !isCustomSize ? true : undefined}></sp-textfield>
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
            <sp-button
               type="button"
               class="tailoring-button"
               variant="cta"
               ref={exportButtonRef}
               disabled={busy ? true : undefined}>
               导出
            </sp-button>
            <sp-button
               type="button"
               class="tailoring-button"
               variant="secondary"
               ref={cancelButtonRef}
               disabled={busy ? true : undefined}>
               取消
            </sp-button>
         </div>
      </div>
   );
}
