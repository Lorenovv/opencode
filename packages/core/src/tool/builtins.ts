export * as BuiltInTools from "./builtins"

import { Layer } from "effect"
import { BashTool } from "./bash"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { QuestionTool } from "./question"
import { ReadTool } from "./read"
import { SkillTool } from "./skill"
import { TodoWriteTool } from "./todowrite"
import { WebFetchTool } from "./webfetch"
import { WebSearchTool } from "./websearch"
import { WriteTool } from "./write"

/**
 * Composes only the shipped Location-scoped built-in tool transforms.
 * Each tool retains its implementation and focused tests independently. Dynamic
 * MCP and plugin tools later use separate scoped canonical registrations, while
 * provider/model filtering belongs to a future materialization phase rather
 * than this static list. The caller intentionally supplies shared Location
 * services once to this merged set.
 *
 * NOTE: apply_patch is intentionally omitted. Its single large multiline
 * patchText argument is fragile when streamed through proxied/reseller
 * providers (truncation or newline-escaping breaks the tool-call JSON, which
 * surfaces as "Invalid input for tool apply_patch: JSON parsing failed" on any
 * model). File mutations go through write/edit (and bash for deletes), whose
 * smaller structured arguments survive proxying reliably.
 *
 * TODO: Port the remaining launch-follow-up leaves deliberately: edit fuzzy
 * parity, task, LSP,
 * repo_clone, repo_overview, plan_exit, and Rune/code mode. Keep MCP and plugin
 * transforms separate from this static built-in list.
 */
export const locationLayer = Layer.mergeAll(
  BashTool.layer,
  EditTool.layer,
  GlobTool.layer,
  GrepTool.layer,
  QuestionTool.layer,
  ReadTool.layer,
  SkillTool.layer,
  TodoWriteTool.layer,
  WebFetchTool.layer,
  WebSearchTool.layer.pipe(Layer.provide(WebSearchTool.defaultConfigLayer)),
  WriteTool.layer,
)
