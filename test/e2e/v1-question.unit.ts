import { expect, it } from "bun:test";
import { v1QuestionBridge } from "./v1-question";

function binary(
  question = 'var q={};map(q,{Question:()=>q});class Service extends Tag.Service()("@opencode/Question"){};var ask="Question.ask";export{q as Q};',
) {
  return Buffer.from(
    [
      "native prefix",
      "/$bunfs/root/chunk-runtime.js",
      "// @bun\nexport{r as AppRuntime,l as AppLayer};",
      "/$bunfs/root/chunk-store.js",
      "// @bun\nexport{s as InstanceStore};",
      "/$bunfs/root/chunk-question.js",
      `// @bun\n${question}`,
      "native suffix",
    ].join("\0"),
  );
}

it("resolves native v1 question setup exports and records their identities without copying code", () => {
  const bridge = v1QuestionBridge(binary());
  expect(bridge.source).toBe(
    [
      'export { AppRuntime } from "/$bunfs/root/chunk-runtime.js";',
      'export { InstanceStore } from "/$bunfs/root/chunk-store.js";',
      'export { Q as Question } from "/$bunfs/root/chunk-question.js";',
    ].join("\n"),
  );
  expect(bridge.modules).toHaveLength(3);
  expect(bridge.modules.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
  expect(bridge.source).not.toContain("class Service");
});

it("fails closed when pinned embedded layout or service exports change", () => {
  expect(() => v1QuestionBridge(Buffer.from("not a native host"))).toThrow("missing");
  expect(() =>
    v1QuestionBridge(Buffer.from(binary().toString().replace("/$bunfs/root/chunk-question.js", "/untrusted.js"))),
  ).toThrow("layout changed");
  expect(() =>
    v1QuestionBridge(binary('var q={};map(q,{Question:()=>q});var ask="Question.ask";export{q as Q};')),
  ).toThrow("service export changed");
  expect(() =>
    v1QuestionBridge(
      binary('class Service extends Tag.Service()("@opencode/Question"){};var ask="Question.ask";export{q as Q};'),
    ),
  ).toThrow("service export changed");
});
