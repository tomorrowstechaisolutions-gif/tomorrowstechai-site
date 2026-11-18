"use client";

import { useRef, useState } from "react";

/**
 * An email's HTML, isolated.
 *
 * No scripts run (no allow-scripts), links open in a new tab, and a CSP inside
 * the document blocks remote images unless you choose to load them, because a
 * remote image is how senders learn you opened their email. The frame grows to
 * its content so there is one scrollbar, not two.
 */
export default function MailFrame({ html, images }: { html: string; images: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  const remote = images ? " https: http:" : "";
  const csp = `default-src 'none'; img-src data: cid:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:14px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;

  return (
    <iframe
      ref={ref}
      title="Email"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ width: "100%", height, border: 0, display: "block", background: "#fff", borderRadius: 8 }}
      onLoad={() => {
        const body = ref.current?.contentDocument?.documentElement;
        if (body) setHeight(Math.min(Math.max(body.scrollHeight + 4, 120), 4000));
      }}
    />
  );
}
