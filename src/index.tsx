import { Context, Schema, h, Logger } from "koishi";
import path from "path";
import fs from "fs/promises";
import { Dirent } from "fs";

export const name = "get-image-local";
const logger = new Logger(name);

// 权限组定义
export interface GroupConfig {
  [groupName: string]: string[];
}

// 每个指令的配置项（不包含指令名，指令名作为键）
export interface CommandConfig {
  path: string;
  guilds?: string[]; // 直接指定的群ID
  group?: string; // 引用的权限组名
  private?: boolean; // 私聊权限（覆盖默认），不填则使用全局默认
}

export interface Config {
  defaultPrivate: boolean;
  defaultEnable: boolean;
  superUsers: string[];
  enableCache: boolean; // 是否启用缓存
  enableDebug: boolean; // 是否输出调试日志
  maxRange: number; // 最大连续张数
  enableNoPermissionMessage: boolean; // 无权限时是否发送提示
  groups: Record<string, string[]>; // 权限组
  commands: Record<string, CommandConfig>; // 指令名 => 配置
}

export const Config: Schema<Config> = Schema.intersect([
  // --- 新增：仓库链接卡片 ---
  Schema.union([
    Schema.object({
      repoLink: Schema.const(
        "https://github.com/RuoLi7X5/koishi-plugin-get-image-local",
      )
        .description("📦 点击下方链接访问仓库")
        .role("link"), // role='link' 会让它显示为链接
    }),
  ]),
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
    enableCache: Schema.boolean()
      .description("🚀 启用图片缓存（启动时扫描所有图片，大幅提升响应速度）")
      .default(true),
    enableDebug: Schema.boolean()
      .description("🐛 输出调试日志（可在控制台查看详细调用信息）")
      .default(false),
    maxRange: Schema.number()
      .description("📎 范围查询最大连续张数（如 1-10，不得超过此值）")
      .default(10)
      .min(1)
      .max(50),
    enableNoPermissionMessage: Schema.boolean()
      .description("🔇 无权限时是否发送提示消息（关闭则完全静默）")
      .default(true),
    groups: Schema.dict(Schema.array(String))
      .description("👥 权限组定义（组名 => 群ID列表）")
      .role("table"),
  }).description("⚙️ 全局设置 | "),

  // 指令列表卡片（字典形式，键为指令名，值包含配置，每个卡片默认折叠，键名作为折叠标题）
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
        group: Schema.string()
          .description("🔗 引用权限组名（需在全局 groups 中定义）")
          .role("input"),
        private: Schema.boolean().description(
          "💬 是否允许私聊（不填则使用全局默认）",
        ),
        // 注意：不设置 .default(undefined)，Schema.boolean() 默认即为 undefined
      }).collapse(true), // 每个指令卡片默认折叠，键名作为折叠标题
    ).description("📋 指令列表（可增删，按添加顺序排列）"),
  }),
]);

// 支持的图片扩展名
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

// 缓存结构：指令名 -> 编号 -> 绝对路径
type CacheMap = Map<string, Map<string, string>>;

// 模块级变量，供内部函数使用
let commandConfigs: Record<string, CommandConfig> = {};
let cache: CacheMap = new Map();

/**
 * 递归扫描目录，构建编号到文件路径的映射
 * @param dir 当前目录
 * @param baseDir 根目录（用于日志）
 * @param map 映射表
 * @param debug 是否输出调试日志（可能为 undefined，内部使用默认值）
 */
async function scanDirectory(
  dir: string,
  baseDir: string,
  map: Map<string, string>,
  debug: boolean = false,
) {
  // 确保 debug 为布尔值（处理传入 undefined 的情况）
  const shouldDebug = debug ?? false;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (shouldDebug) logger.warn(`无法读取目录 ${dir}: ${err}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(fullPath, baseDir, map, shouldDebug);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTS.includes(ext)) {
        const basename = path.basename(entry.name, ext);
        if (map.has(basename)) {
          if (shouldDebug)
            logger.warn(
              `编号 ${basename} 重复：${fullPath} 与 ${map.get(basename)}，将使用先扫描到的`,
            );
        } else {
          map.set(basename, fullPath);
          if (shouldDebug) logger.debug(`缓存图片：${basename} -> ${fullPath}`);
        }
      }
    }
  }
}

/**
 * 构建缓存
 */
async function buildCache(
  commands: Record<string, CommandConfig>,
  enableDebug: boolean,
): Promise<CacheMap> {
  const cache: CacheMap = new Map();
  for (const [cmdName, cmdConfig] of Object.entries(commands)) {
    if (!cmdConfig.path) continue;
    const cmdCache = new Map<string, string>();
    cache.set(cmdName, cmdCache);
    try {
      const basePath = path.resolve(cmdConfig.path);
      if (enableDebug) logger.info(`开始扫描指令 ${cmdName} 路径：${basePath}`);
      await scanDirectory(basePath, basePath, cmdCache, enableDebug);
      if (enableDebug)
        logger.info(`指令 ${cmdName} 扫描完成，共 ${cmdCache.size} 张图片`);
    } catch (err) {
      logger.error(`扫描指令 ${cmdName} 失败：${err}`);
    }
  }
  return cache;
}

/**
 * 从缓存获取图片路径，若文件不存在则尝试重新扫描一次
 */
async function getImagePath(
  cmdName: string,
  number: string,
  cache: CacheMap,
  enableDebug: boolean,
): Promise<string | null> {
  const cmdCache = cache.get(cmdName);
  if (!cmdCache) return null;

  let imagePath = cmdCache.get(number);
  if (!imagePath) return null;

  // 验证文件是否仍存在
  try {
    await fs.access(imagePath);
    return imagePath;
  } catch {
    // 文件已不存在，从缓存删除并尝试重新扫描该指令的路径
    if (enableDebug)
      logger.warn(`缓存图片 ${number} 已不存在，尝试重新扫描指令 ${cmdName}`);
    cmdCache.delete(number);

    // 从 commandConfigs 中找到对应指令的配置
    const cmdConfig = commandConfigs[cmdName];
    if (cmdConfig) {
      const basePath = path.resolve(cmdConfig.path);
      const newMap = new Map<string, string>();
      await scanDirectory(basePath, basePath, newMap, enableDebug);
      // 合并新扫描结果
      for (const [k, v] of newMap) {
        cmdCache.set(k, v);
      }
      return cmdCache.get(number) || null;
    }
    return null;
  }
}

/**
 * 解析参数：支持纯数字或范围（如 1-10）
 * 返回编号字符串数组，若格式错误返回 null
 */
function parseNumberParam(param: string, maxRange: number): string[] | null {
  if (/^\d+$/.test(param)) {
    return [param];
  }
  const match = param.match(/^(\d+)-(\d+)$/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    if (start <= end && end - start + 1 <= maxRange) {
      const result: string[] = [];
      for (let i = start; i <= end; i++) {
        result.push(i.toString());
      }
      return result;
    }
  }
  return null;
}

/**
 * 获取指令允许的群ID列表（合并 guilds 和 group）
 */
function getAllowedGuilds(
  cmd: CommandConfig,
  groups: Record<string, string[]>,
): string[] {
  const allowed = new Set<string>();
  if (cmd.guilds) {
    cmd.guilds.forEach((id) => allowed.add(id));
  }
  if (cmd.group && groups[cmd.group]) {
    groups[cmd.group].forEach((id) => allowed.add(id));
  }
  return Array.from(allowed);
}

/**
 * 非缓存模式下的查找（递归扫描）
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
        const basename = path.basename(entry.name, ext);
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
 */
function checkPermission(
  session: any,
  cmd: CommandConfig,
  config: Config,
): boolean {
  // 确保 session 存在
  if (!session) return false;

  // 超级管理员：无视一切限制
  if (config.superUsers?.includes(session.userId)) {
    return true;
  }

  const isPrivate = !session.guildId;
  if (isPrivate) {
    const allowPrivate =
      cmd.private !== undefined ? cmd.private : config.defaultPrivate;
    return allowPrivate;
  } else {
    const allowedGuilds = getAllowedGuilds(cmd, config.groups || {});
    if (allowedGuilds.length > 0) {
      return allowedGuilds.includes(session.guildId);
    } else {
      return config.defaultEnable;
    }
  }
}

export function apply(ctx: Context, config: Config) {
  const {
    defaultPrivate = false,
    defaultEnable = true,
    superUsers = [],
    enableCache = true,
    enableDebug = false,
    maxRange = 10,
    enableNoPermissionMessage = true,
    groups = {},
    commands = {},
  } = config;

  commandConfigs = commands; // 保存到全局变量

  // 如果启用缓存，立即构建
  if (enableCache) {
    buildCache(commandConfigs, enableDebug)
      .then((c) => {
        cache = c;
        if (enableDebug) logger.success("缓存构建完成");
      })
      .catch((err) => {
        logger.error("缓存构建失败", err);
      });
  }

  // 为每个指令注册处理函数
  for (const [cmdName, cmdConfig] of Object.entries(commandConfigs)) {
    if (!cmdName || !cmdConfig.path) continue;

    ctx
      .command(`${cmdName} <number:string>`)
      .action(async ({ session }, number) => {
        // 确保 session 存在
        if (!session) return;

        // 权限检查
        if (!checkPermission(session, cmdConfig, config)) {
          if (enableNoPermissionMessage) {
            return "暂时未获得该指令的权限，请联系管理员";
          }
          return;
        }

        // 参数解析
        const numbers = parseNumberParam(number, maxRange);
        if (!numbers) {
          return (
            "编号格式错误，应为纯数字或范围（如 1-10），且范围长度不超过 " +
            maxRange
          );
        }

        // 获取图片路径
        const imagePaths: string[] = [];
        const missing: string[] = [];
        for (const n of numbers) {
          let imagePath: string | null = null;
          if (enableCache) {
            imagePath = await getImagePath(cmdName, n, cache, enableDebug);
          } else {
            // 无缓存时直接查找
            const basePath = path.resolve(cmdConfig.path);
            imagePath = await findImage(basePath, n);
          }
          if (imagePath) {
            imagePaths.push(imagePath);
          } else {
            missing.push(n);
          }
        }

        // 处理结果
        if (imagePaths.length === 0) {
          return "小仙没找到呢，检查一下命令输入吧";
        }

        // 如果启用了调试，记录调用信息
        if (enableDebug) {
          logger.debug(
            `用户 ${session.userId} 在 ${session.guildId || "私聊"} 调用 ${cmdName} ${number}，找到 ${imagePaths.length} 张，缺失 ${missing.join(",") || "无"}`,
          );
        }

        // 发送图片（合并成一条消息发送多个图片元素）
        const elements = imagePaths.map((p) =>
          h("image", { url: `file://${p}` }),
        );
        await session.send(
          elements.length === 1 ? elements[0] : h("message", ...elements),
        );

        // 如果有缺失的编号且范围查询时，补充提示
        if (missing.length > 0 && numbers.length > 1) {
          await session.send(`以下编号未找到：${missing.join("、")}`);
        }
      });
  }
}
