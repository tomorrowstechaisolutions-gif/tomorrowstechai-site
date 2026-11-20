import "server-only";
import { ROLE } from "./roles";
import { toolsFor } from "./tools";

/** Tess as the code has her today: her standing instructions and the names of her tools. */
export function tessCurrent(): { prompt: string; toolNames: string[] } {
  return { prompt: ROLE.tess.prompt, toolNames: toolsFor("tess").map((t) => t.name) };
}
