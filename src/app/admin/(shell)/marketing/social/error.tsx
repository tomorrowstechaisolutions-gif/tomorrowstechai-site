"use client";

export default function SocialCenterError({ error, reset }: { error: Error; reset: () => void }) {
  return <div style={{ padding: 28 }}><h1>Social Center could not load</h1><p>{error.message}</p><button onClick={reset}>Try again</button></div>;
}
