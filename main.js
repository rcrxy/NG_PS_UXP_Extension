const { entrypoints } = require("uxp");
const { GuidePanel } = require("./src/module/guide/index");

entrypoints.setup({
    panels: {
        "guide-panel": {
            show(event) {
                try {
                    const panel = new GuidePanel(event.node);
                    panel.buildPanel().catch(error => {
                        const detail = (error && (error.stack || error.message)) || "面板加载失败";
                        event.node.innerHTML = `<div style="padding:12px;color:#ffdddd;background:#5b1111;white-space:pre-wrap;">${detail}</div>`;
                    });
                } catch (error) {
                    const detail = (error && (error.stack || error.message)) || "面板加载失败";
                    event.node.innerHTML = `<div style="padding:12px;color:#ffdddd;background:#5b1111;white-space:pre-wrap;">${detail}</div>`;
                }
            },
        },
    },
});
