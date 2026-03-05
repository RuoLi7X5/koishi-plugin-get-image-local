import { Context, Schema, h } from "koishi";
import path from "path";
import fs from "fs/promises";
import { Dirent } from "fs";

export const name = "get-image-local";

// 每个指令的配置项（不包含指令名，指令名作为键）
export interface CommandConfig {
  path: string; // 图片根路径
  guilds?: string[]; // 允许的群ID列表
  private?: boolean; // 私聊权限（覆盖默认）
}

export interface Config {
  defaultPrivate: boolean; // 默认私聊权限
  defaultEnable: boolean; // 默认群聊权限（当指令未指定 guilds 时）
  superUsers: string[]; // 超级管理员用户ID，可无视群聊限制
  commands: Record<string, CommandConfig>; // 指令名 => 配置
}

export const Config: Schema<Config> = Schema.intersect([
  // 全局设置卡片
  Schema.object({
    defaultPrivate: Schema.boolean()
      .description("默认私聊权限（当指令未单独设置时）")
      .default(false),
    defaultEnable: Schema.boolean()
      .description("默认群聊权限（当指令未指定群白名单时）")
      .default(true),
    superUsers: Schema.array(String)
      .description("👑 超级管理员QQ号（可无视群聊/私聊限制，任意调用）")
      .role("table")
      .default([]),
  }).description(
    "⚙️ 全局设置\n\n• 此处配置默认权限和超级管理员，每个指令可单独覆盖。",
  ),

  // 指令列表卡片（字典形式，键为指令名，值为配置，每个卡片默认折叠）
  Schema.object({
    commands: Schema.dict(
      Schema.object({
        path: Schema.string()
          .description("📁 图片存放根目录（支持子文件夹）")
          .required()
          .role("textarea"),
        guilds: Schema.array(String)
          .description("👥 允许的群ID列表（留空则使用默认规则）")
          .role("table"),
        private: Schema.boolean()
          .description("💬 是否允许私聊（不填则使用全局默认）")
          .default(undefined),
      }).collapse(true), // 每个指令卡片默认折叠，键名作为折叠标题
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
 * 权限检查（支持超级管理员）
 * @param session 会话对象
 * @param cmdConfig 指令配置
 * @param config 完整配置
 * @returns 是否有权限响应
 */
function checkPermission(
  session: any,
  cmdConfig: CommandConfig,
  config: Config,
): boolean {
  // 超级管理员：无视一切限制
  if (config.superUsers?.includes(session.userId)) {
    return true;
  }

  const isPrivate = !session.guildId;
  if (isPrivate) {
    // 私聊权限
    const allowPrivate =
      cmdConfig.private !== undefined
        ? cmdConfig.private
        : config.defaultPrivate;
    return allowPrivate;
  } else {
    // 群聊权限
    if (cmdConfig.guilds) {
      return cmdConfig.guilds.includes(session.guildId);
    } else {
      return config.defaultEnable;
    }
  }
}

export function apply(ctx: Context, config: Config) {
  const { commands = {} } = config;

  // 为每个配置的指令注册处理函数
  for (const [cmdName, cmdConfig] of Object.entries(commands)) {
    if (!cmdName || !cmdConfig.path) continue; // 指令名和路径必须存在

    ctx
      .command(`${cmdName} <number:string>`)
      .action(async ({ session }, number) => {
        // 权限检查：无权限时直接返回（不响应）
        if (!checkPermission(session, cmdConfig, config)) {
          return;
        }

        // 参数校验：必须为纯数字（允许前导零）
        if (!/^\d+$/.test(number)) {
          return "编号必须为数字。";
        }

        const basePath = path.resolve(cmdConfig.path);
        const imagePath = await findImage(basePath, number);

        if (!imagePath) {
          return `找不到编号为 ${number} 的图片。`;
        }

        // 使用 h 函数发送图片
        await session.send(h("image", { url: `file://${imagePath}` }));
      });
  }
}
