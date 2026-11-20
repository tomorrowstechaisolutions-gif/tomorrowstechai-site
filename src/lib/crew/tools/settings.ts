import "server-only";
import { cleanScreenChange, SETTINGS_TOOL } from "@/components/admin/cc/tess/screenSettings";
import { BACKGROUNDS } from "@/components/admin/cc/tess/soundPlan";
import { FADE_OPTIONS, TEXT_STYLES } from "@/components/admin/cc/tess/textPrefs";
import { loadTessProfile, saveTessSettings } from "../profile";
import { DIAL_KEYS, DIALS, MODE_IDS, MODES, type TessMode } from "../tess-modes";
import type { CrewTool } from "./core";
import { once } from "./setup";

/**
 * Tess changing her own settings when John asks her to: the mode she is
 * in, how she answers, and the settings on his screen (background sound,
 * how her words are shown, sound on or off).
 *
 * The mode and dials are saved to his profile here. The screen settings
 * live in his browser, so this tool only checks them; the chat route reads
 * them off the same tool call and the page applies them.
 */

const ids = <T extends { id: string }>(list: readonly T[]) => list.map((o) => o.id);

export const changeSettings: CrewTool = {
  name: SETTINGS_TOOL,
  description:
    "Change your own settings when John asks you to, and only then. Give only the fields he asked to change. mode: how you talk with him. length, bluntness, pushback: how you answer. background: the sound that plays while you wait (gamma40 and beta15 are the 40 Hz and 15 Hz focus tones). text_style: how your words are shown (hidden means he only hears you). text_fade_seconds: how long your words stay on screen, 0 for always. sound: all of your sound, voice included.",
  input_schema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: [...MODE_IDS] },
      length: { type: "string", enum: ids(DIALS.length.options) },
      bluntness: { type: "string", enum: ids(DIALS.bluntness.options) },
      pushback: { type: "string", enum: ids(DIALS.pushback.options) },
      background: { type: "string", enum: ids(BACKGROUNDS) },
      text_style: { type: "string", enum: ids(TEXT_STYLES) },
      text_fade_seconds: { type: "number", enum: FADE_OPTIONS.map((o) => o.seconds) },
      sound: { type: "string", enum: ["on", "off"] },
    },
    additionalProperties: false,
  },
  kind: "read",
  station: "library",
  async run(ctx, input) {
    const userId = ctx.run.started_by;
    if (!userId) return { ok: false, text: "This only works while talking with John." };

    const mode = (MODE_IDS as readonly string[]).includes(String(input.mode)) ? (input.mode as TessMode) : null;
    const dials = Object.fromEntries(DIAL_KEYS.filter((key) => DIALS[key].options.some((o) => o.id === input[key])).map((key) => [key, String(input[key])]));
    const screen = cleanScreenChange(input);
    const savesProfile = Boolean(mode) || Object.keys(dials).length > 0;
    if (!savesProfile && !screen) return { ok: false, text: "Nothing to change: name at least one setting and a value it can take." };

    return once(ctx, this.name, "changed her settings", async () => {
      const said: string[] = [];
      if (savesProfile) {
        const now = await loadTessProfile(ctx.sb, userId);
        try {
          await saveTessSettings(ctx.sb, userId, { mode: mode ?? now.mode, length: now.length, bluntness: now.bluntness, pushback: now.pushback, ...dials });
        } catch (err) {
          return { ok: false, text: err instanceof Error ? err.message : "Could not save that." };
        }
        if (mode) said.push(`You are now in ${MODES[mode].label} mode, starting with this reply. ${MODES[mode].instructions} ${MODES[mode].questions}`);
        for (const key of DIAL_KEYS) {
          const option = DIALS[key].options.find((o) => o.id === dials[key]);
          if (option) said.push(`${DIALS[key].label} is now ${option.label}. ${option.instructions}`);
        }
      }
      if (screen) said.push("The change to his screen has been made.");
      said.push("Tell John in a few words that it is done.");
      return { ok: true, text: said.join("\n") };
    });
  },
};
