const { entrypoints, storage } = require("uxp");
const { buildPanel } = require("./src/guide/index");

entrypoints.setup({
    panels: {
        "guide-panel": {
            show(event) {
                if (!event.node.hasChildNodes()) {
                    buildPanel(event.node).catch(error => {
                        event.node.innerHTML = `<div style="padding:12px;color:#ffdddd;background:#5b1111;">${error.message || "面板加载失败"}</div>`;
                    });
                }
            },
        },
    },
});
