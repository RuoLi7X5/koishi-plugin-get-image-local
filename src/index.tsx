import { Context, Schema, h } from "koishi";
import path from "path";
import fs from "fs/promises";
import { Dirent } from "fs";

export const name = "get-image-local";

// 每个指令的配置项
export interface CommandItem {
  name: string; // 指令名称
  path: string; // 图片根路径
  guilds?: string[]; // 允许的群ID列表
  private?: boolean; // 私聊权限（覆盖默认）
}

export interface Config {
  defaultPrivate: boolean; // 默认私聊权限
  defaultEnable: boolean; // 默认群聊权限（当指令未指定 guilds 时）
  commands: CommandItem[]; // 指令列表
}

// 使用 intersect 分组配置，并添加说明文字
export const Config: Schema<Config> = Schema.intersect([
  // 全局设置卡片
  Schema.object({
    defaultPrivate: Schema.boolean()
      .description("默认私聊权限（当指令未单独设置时）")
      .default(false),
    defaultEnable: Schema.boolean()
      .description("默认群聊权限（当指令未指定群白名单时）")
      .default(true),
  }).description("⚙️ 全局设置\n\n• 此处配置默认权限，每个指令可单独覆盖。"),

  // 指令列表卡片（表格形式）
  Schema.object({
    commands: Schema.array(
      Schema.object({
        name: Schema.string()
          .description("📛 指令名称（例如“图片”）")
          .required()
          .role("input"), // 优化输入框样式
        path: Schema.string()
          .description("📁 图片存放根目录（支持子文件夹）")
          .required()
          .role("textarea"), // 长路径可用多行
        guilds: Schema.array(String)
          .description("👥 允许的群ID列表（留空则使用默认规则）")
          .role("table"),
        private: Schema.boolean()
          .description("💬 是否允许私聊（不填则使用全局默认）")
          .default(undefined),
      }),
    ).description("📋 指令列表（可增删）\n\n每个指令可独立配置路径和权限。"),
  }),
]);

// 支持的图片扩展名
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

/**
 * 递归查找与编号完全匹配的图片文件
 * @param dir 当前目录
 * @param number 数字字符串（如 "001"）
 * @returns 文件绝对路径，或 null
 */
async function findImage(dir: string, number: string): Promise<string | null> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findImage(fullPath, number);
      if (found) return found;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTS.includes(ext)) {
        const basename = path.basename(entry.name, ext); // 去掉扩展名
        if (basename === number) {
          return fullPath;
        }
      }
    }
  }
  return null;
}

/**
 * 权限检查
 * @param session 会话对象
 * @param cmd 指令配置
 * @param defaultPrivate 默认私聊权限
 * @param defaultEnable 默认群聊权限
 * @returns 是否有权限响应
 */
function checkPermission(
  session: any,
  cmd: CommandItem,
  defaultPrivate: boolean,
  defaultEnable: boolean,
): boolean {
  const isPrivate = !session.guildId;
  if (isPrivate) {
    // 私聊权限：优先使用指令的 private，否则使用默认
    const allowPrivate =
      cmd.private !== undefined ? cmd.private : defaultPrivate;
    return allowPrivate;
  } else {
    // 群聊权限：若指定了 guilds，则仅允许列表中的群；否则使用默认规则
    if (cmd.guilds) {
      return cmd.guilds.includes(session.guildId);
    } else {
      return defaultEnable;
    }
  }
}

export function apply(ctx: Context, config: Config) {
  const {
    defaultPrivate = false,
    defaultEnable = true,
    commands = [],
  } = config;

  // 遍历指令数组，为每个指令注册处理函数
  for (const cmd of commands) {
    if (!cmd.name || !cmd.path) continue; // 指令名和路径必须存在

    ctx
      .command(`${cmd.name} <number:string>`)
      .action(async ({ session }, number) => {
        // 权限检查：无权限时直接返回（不响应）
        if (!checkPermission(session, cmd, defaultPrivate, defaultEnable)) {
          return;
        }

        // 参数校验：必须为纯数字（允许前导零）
        if (!/^\d+$/.test(number)) {
          return "编号必须为数字。";
        }

        const basePath = path.resolve(cmd.path);
        const imagePath = await findImage(basePath, number);

        if (!imagePath) {
          return `找不到编号为 ${number} 的图片。`;
        }

        // 使用 h 函数发送图片（避免 JSX 运行时问题）
        await session.send(h("image", { url: `file://${imagePath}` }));
      });
  }
}
