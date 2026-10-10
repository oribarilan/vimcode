import { createHash } from "node:crypto";

// v1 has no question-create endpoint. Resolve only these pinned, embedded exports
// so the setup fixture can call the native service without copying or patching it.
export function v1QuestionBridge(binary: Buffer) {
  function embedded(marker: string) {
    const offset = binary.indexOf(marker);
    if (offset < 0) throw new Error(`Pinned v1 question setup missing ${marker}`);
    const start = binary.lastIndexOf(0, offset);
    const end = binary.indexOf(0, offset);
    const pathStart = binary.lastIndexOf(0, start - 1);
    const path = binary.subarray(pathStart + 1, start).toString();
    const source = binary.subarray(start + 1, end).toString();
    if (!/^\/\$bunfs\/root\/chunk-[\w]+\.js$/.test(path) || !source.startsWith("// @bun")) {
      throw new Error("Pinned v1 embedded module layout changed");
    }
    return { path, source, sha256: createHash("sha256").update(source).digest("hex") };
  }
  const runtime = embedded(" as AppRuntime,");
  const store = embedded(" as InstanceStore}");
  const question = embedded("Question.ask");
  const namespace = /Question:\(\)=>([\w$]+)/.exec(question.source)?.[1];
  const exports = question.source.slice(question.source.lastIndexOf("export{"));
  const questionExport = namespace && new RegExp(`(?:\\{|,)${namespace} as ([\\w$]+)[,}]`).exec(exports)?.[1];
  if (!questionExport || !question.source.includes('Service()("@opencode/Question")')) {
    throw new Error("Pinned v1 Question service export changed");
  }
  return {
    source: [
      `export { AppRuntime } from ${JSON.stringify(runtime.path)};`,
      `export { InstanceStore } from ${JSON.stringify(store.path)};`,
      `export { ${questionExport} as Question } from ${JSON.stringify(question.path)};`,
    ].join("\n"),
    modules: [runtime, store, question].map(({ path, sha256 }) => ({ path, sha256 })),
  };
}
