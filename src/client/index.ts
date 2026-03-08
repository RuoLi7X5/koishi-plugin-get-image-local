import { Context } from "@koishijs/client";
import RepoLink from "./RepoLink.vue";

export default (ctx: Context) => {
  // 正确用法：传入一个包含 type 和 component 的对象
  ctx.schema({
    type: "repo-link",
    component: RepoLink,
  });
};
