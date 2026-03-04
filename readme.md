# koishi-plugin-get-image-local

[![npm](https://img.shields.io/npm/v/koishi-plugin-get-image-local)](https://www.npmjs.com/package/koishi-plugin-get-image-local)

📸 **本地图片精准调用插件**  
支持多指令、子文件夹递归查找、群聊/私聊权限独立控制。

## 功能特色

- 🔢 **精准匹配**：按编号调用图片，`001` 只匹配 `001.jpg`，不会匹配 `1.jpg`。
- 📁 **子文件夹支持**：自动递归查找指定目录下的所有子文件夹。
- 🛡️ **灵活的权限控制**：
  - 全局默认权限可配置。
  - 每个指令可独立指定允许的群聊列表。
  - 私聊权限可独立覆盖全局默认。
- 🧩 **多指令管理**：支持配置多个指令，每个指令指向不同图片库。

## 配置示例

```yaml
plugins:
  get-image-local:
    defaultPrivate: false
    defaultEnable: true
    commands:
      - name: 图片
        path: /data/images
        guilds:
          - "123456789"
          - "987654321"
        private: false
      - name: meme
        path: /data/memes
        private: true
```
