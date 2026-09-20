export const MOTIONS: Record<string, string> = {
  h: "input.move.left",
  l: "input.move.right",
  j: "input.move.down",
  k: "input.move.up",
  w: "input.word.forward",
  b: "input.word.backward",
  "0": "input.line.home",
  $: "input.line.end",
  G: "input.buffer.end",
};

export const SELECT_MOTIONS: Record<string, string> = {
  h: "input.select.left",
  l: "input.select.right",
  j: "input.select.down",
  k: "input.select.up",
  w: "input.select.word.forward",
  b: "input.select.word.backward",
  "0": "input.select.line.home",
  $: "input.select.line.end",
  G: "input.select.buffer.end",
};

export const DELETE_MOTION: Record<string, string> = {
  w: "input.delete.word.forward",
  b: "input.delete.word.backward",
  $: "input.delete.to.line.end",
  "0": "input.delete.to.line.start",
  h: "input.backspace",
  l: "input.delete",
};
