## NG_PS_UXP_Extension
这是一个个人的 ps uxp 扩展

## 如何使用

1. 下载项目
2. 安装依赖：```npm install```
3. 打包：```npm run build```
4. 将 ```dist``` 目录复制到 ``` C:\Users\{你的用户名}\AppData\Roaming\Adobe\UXP\Plugins\External ``` 中，缺少相关文件时手动创建
5. 重启 ps

## 开发

- ```npm run build```：生成 Photoshop UXP 加载用的 ```dist``` 目录
- ```npm run watch```：监听源码变更并持续打包

## 功能

### 参考线生成器

![输入示例](./src/asset/ReferenceLine_1.png)

- 支持百分比
- 分隔符支持空格、```,```、```|```、```;```
