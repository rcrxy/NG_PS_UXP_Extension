const { storage } = require("uxp");

const fs = storage.localFileSystem;

async function readPluginTextFile(filePath) {
    const pluginFolder = await fs.getPluginFolder();
    const file = await pluginFolder.getEntry(filePath);
    return file.read();
}

async function loadUI(htmlDir, cssDir) {
    try {
        const [html, css] = await Promise.all([readPluginTextFile(htmlDir), readPluginTextFile(cssDir)]);
        return { html, css };
    } catch (error) {
        return { html: `<div><p>加载错误：${error}</p></div>`, css: "" };
    }
}

function setStatus(node, text, isError) {
    node.textContent = text;
    node.style.color = isError ? "#C81E1E" : "#1B6E3A";
}

module.exports = {
    loadUI,
    setStatus,
};
