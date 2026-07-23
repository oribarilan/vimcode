import type { PromptAccess } from "../src/vim";

export const mockPrompt: PromptAccess = {
  getLine: (n) => ["hello world", "second line", "third line"][n] ?? "",
  getLineCount: () => 3,
  getCursorLine: () => 0,
  getCursorOffset: () => 0,
  getPlainText: () => "hello world\nsecond line\nthird line",
};

export const emptyPrompt: PromptAccess = {
  getLine: () => "",
  getLineCount: () => 1,
  getCursorLine: () => 0,
  getCursorOffset: () => 0,
  getPlainText: () => "",
};
