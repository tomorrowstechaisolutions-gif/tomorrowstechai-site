import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, cardFontSize, renderCardJpeg } from "../card";

describe("renderCardJpeg", () => {
  it("renders a 1080x1350 JPEG under Instagram's size limit", async () => {
    const buf = await renderCardJpeg("The permit was not pulled.");
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(buf.length).toBeLessThan(8 * 1024 * 1024);
  }, 30_000);

  it("renders the longest allowed line", async () => {
    const buf = await renderCardJpeg("a ".repeat(55).trim());
    expect((await sharp(buf).metadata()).format).toBe("jpeg");
  }, 30_000);

  it("is 4:5, the tallest shape Instagram accepts", () => {
    expect(CARD_WIDTH / CARD_HEIGHT).toBe(0.8);
  });
});

describe("cardFontSize", () => {
  it("shrinks the type as the line gets longer", () => {
    expect(cardFontSize("a".repeat(50))).toBe(84);
    expect(cardFontSize("a".repeat(51))).toBe(68);
    expect(cardFontSize("a".repeat(80))).toBe(68);
    expect(cardFontSize("a".repeat(81))).toBe(56);
  });
});
