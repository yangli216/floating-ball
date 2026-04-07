/**
 * Prompts 统一导出文件
 *
 * 所有 prompts 定义在 prompts.ts 中
 * 这个文件只负责重新导出，便于导入
 *
 * 区域化模式下，可通过 promptOverride 服务覆盖 system prompt
 */

export * from './prompts';
export { withOverride, getSystemPromptOverride, syncRemotePrompts } from '../services/promptOverride';
