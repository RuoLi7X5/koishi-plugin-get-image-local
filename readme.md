# koishi-plugin-get-image-local

[![npm](https://img.shields.io/npm/v/koishi-plugin-get-image-local)](https://www.npmjs.com/package/koishi-plugin-get-image-local)

📸 **本地图片精准调用插件**  
支持多指令、子文件夹递归查找、群聊/私聊权限独立控制，新增超级管理员功能。

## 功能特色

- 🔢 **精准匹配**：按编号调用图片，`001` 只匹配 `001.jpg`，不会匹配 `1.jpg`。
- 📁 **子文件夹支持**：自动递归查找指定目录下的所有子文件夹。
- 🛡️ **灵活的权限控制**：
  - 全局默认权限可配置。
  - 每个指令可独立指定允许的群聊列表。
  - 私聊权限可独立覆盖全局默认。
- 👑 **超级管理员**：配置特定用户 ID，可无视所有群聊/私聊限制。
- 🧩 **多指令管理**：支持配置多个指令，每个指令指向不同图片库，指令卡片默认折叠，折叠时显示指令名。

## 配置示例

```yaml
plugins:
  get-image-local:
    defaultPrivate: false
    defaultEnable: true
    superUsers:
      - "10001" # 超级管理员QQ号，可无视群聊限制
    commands:
      图片: # 指令名作为键
        path: /data/images
        guilds:
          - "123456789"
          - "987654321"
        private: false
      meme: # 另一个指令
        path: /data/memes
        private: true
```

指令用法
在允许的群聊或私聊中发送：

text
<指令名> <编号>
例如：图片 42、meme 007

权限说明
普通用户：受指令的 guilds 列表和 private 权限控制。

超级管理员：在 superUsers 中配置的用户，可无视所有群聊/私聊限制，在任何地方调用任意指令
