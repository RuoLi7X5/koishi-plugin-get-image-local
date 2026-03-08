# koishi-plugin-get-image-local

[![npm](https://img.shields.io/npm/v/koishi-plugin-get-image-local)](https://www.npmjs.com/package/koishi-plugin-get-image-local)

## 主要功能

- **精准匹配**：按编号调用图片，`001` 只匹配 `001.jpg`。
- **子文件夹支持**：自动递归查找。
- **缓存加速**：启动时扫描所有图片，后续调用毫秒级响应。
- **权限组**：定义群组，指令可引用，简化配置。
- **范围查询**：支持 `图片 1-10` 批量返回图片（可设置最大张数）。
- **调试日志**：开启后输出详细调用信息到控制台。
- **稳定顺序**：指令列表按添加顺序排列，修改指令名不会打乱。
- **友好提示**：无权限或图片不存在时返回自定义消息。

## 配置示例

```yaml
plugins:
  get-image-local:
    defaultPrivate: false
    defaultEnable: true
    superUsers:
      - '10001'
    enableCache: true
    enableDebug: false
    maxRange: 10
    enableNoPermissionMessage: true
    groups:
      内部群:
        - '123456'
        - '789012'
      测试群:
        - '345678'
    commands:
      - name: 图片
        path: /data/images
        guilds:
          - '123456789'
        group: 内部群
        private: false
      - name: meme
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
