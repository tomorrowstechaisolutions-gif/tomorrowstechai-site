/**
 * Minimal ZIP writer (STORE — no compression).
 *
 * Written by hand rather than pulling in JSZip: the brand kit is a handful of
 * small SVG/PNG/HTML files, PNGs are already compressed, and this keeps the
 * project free of another dependency and lockfile churn. Produces a spec-valid
 * archive that Windows Explorer, macOS Archive Utility and `unzip` all open.
 */

type Entry = { name: string; data: Uint8Array };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date/time. Fixed epoch keeps archives byte-reproducible. */
const DOS_TIME = ((12 << 11) | (0 << 5) | 0) & 0xffff;
const DOS_DATE = (((2026 - 1980) << 9) | (1 << 5) | 1) & 0xffff;

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }

  u16(v: number) {
    this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }

  u32(v: number) {
    this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }

  bytes() {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

export function makeZip(files: { name: string; data: Uint8Array | string }[]): Blob {
  const enc = new TextEncoder();
  const entries: Entry[] = files.map((f) => ({
    name: f.name,
    data: typeof f.data === "string" ? enc.encode(f.data) : f.data,
  }));

  const w = new Writer();
  const offsets: number[] = [];
  const crcs: number[] = [];

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    offsets.push(w.length);
    crcs.push(crc);

    w.u32(0x04034b50); // local file header
    w.u16(20); // version needed
    w.u16(0x0800); // flags: UTF-8 names
    w.u16(0); // method: store
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crc);
    w.u32(e.data.length);
    w.u32(e.data.length);
    w.u16(nameBytes.length);
    w.u16(0); // extra length
    w.push(nameBytes);
    w.push(e.data);
  }

  const centralStart = w.length;
  entries.forEach((e, i) => {
    const nameBytes = enc.encode(e.name);
    w.u32(0x02014b50); // central directory header
    w.u16(20); // version made by
    w.u16(20); // version needed
    w.u16(0x0800);
    w.u16(0);
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crcs[i]);
    w.u32(e.data.length);
    w.u32(e.data.length);
    w.u16(nameBytes.length);
    w.u16(0); // extra
    w.u16(0); // comment
    w.u16(0); // disk number
    w.u16(0); // internal attrs
    w.u32(0); // external attrs
    w.u32(offsets[i]);
    w.push(nameBytes);
  });
  const centralSize = w.length - centralStart;

  w.u32(0x06054b50); // end of central directory
  w.u16(0);
  w.u16(0);
  w.u16(entries.length);
  w.u16(entries.length);
  w.u32(centralSize);
  w.u32(centralStart);
  w.u16(0);

  return new Blob([w.bytes()], { type: "application/zip" });
}
