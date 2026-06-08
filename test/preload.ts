// Preload: mock the @opentui/solid JSX runtime for tests.
// The real runtime is injected by the OpenCode host at runtime.
import { mock } from "bun:test";

mock.module("@opentui/solid/jsx-runtime", () => ({
  jsx: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  jsxs: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  jsxDEV: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  Fragment: (props: { children?: unknown }) => props.children,
}));

mock.module("@opentui/solid/jsx-dev-runtime", () => ({
  jsx: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  jsxs: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  jsxDEV: (_type: string, props: Record<string, unknown>) => ({ type: _type, props }),
  Fragment: (props: { children?: unknown }) => props.children,
}));

mock.module("solid-js", () => ({
  createSignal: <T>(init: T) => {
    let value = init;
    const getter = () => value;
    const setter = (v: T | ((prev: T) => T)) => {
      value = typeof v === "function" ? (v as (prev: T) => T)(value) : v;
    };
    return [getter, setter] as const;
  },
  createMemo: <T>(fn: () => T) => fn,
  createEffect: () => {},
  onCleanup: () => {},
  onMount: (fn: () => void) => fn(),
  Show: (props: { when: unknown; children: unknown }) => props.children,
  For: (props: { each: unknown[]; children: unknown }) => props.children,
}));
