"use client";

import { useState } from "react";
import { refreshSocialProfilesAction } from "@/app/admin/social-actions";
import { PLATFORM_LABELS, type SocialAccountRow, type SocialMediaItem, type SocialPlatform } from "@/lib/social/types";
import { IconRepeat } from "../Icons";
import styles from "./SocialCenter.module.css";

/**
 * The visual side of Social Center: every connected brand as it looks on the
 * platforms (cover, avatar, live links, follower counts, latest posts).
 *
 * A "brand" is a Facebook Page plus the Instagram account linked to it
 * (Meta tells us the link via external_page_id). LinkedIn and any unlinked
 * account stand on their own.
 */

export type Brand = {
  key: string;
  name: string;
  clientName: string;
  customerId: string | null;
  avatar: string | null;
  cover: string | null;
  accounts: SocialAccountRow[];
  followers: number | null;
  media: Array<SocialMediaItem & { platform: SocialPlatform }>;
};

const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function groupBrands(accounts: SocialAccountRow[]): Brand[] {
  const live = accounts.filter((a) => a.connected && a.status === "connected");
  const pages = live.filter((a) => a.platform === "facebook");
  const byPageId = new Map(pages.map((p) => [p.externalId, p]));
  const brands = new Map<string, Brand>();

  const ensure = (key: string, lead: SocialAccountRow) => {
    if (!brands.has(key)) brands.set(key, {
      key, name: lead.displayName, clientName: lead.clientName, customerId: lead.customerId,
      avatar: null, cover: null, accounts: [], followers: null, media: [],
    });
    return brands.get(key)!;
  };

  for (const account of live) {
    const parent = account.platform === "instagram" && account.externalPageId ? byPageId.get(account.externalPageId) : undefined;
    const lead = parent ?? account;
    const brand = ensure(lead.id, lead);
    brand.accounts.push(account);
  }

  for (const brand of brands.values()) {
    const order: SocialPlatform[] = ["facebook", "instagram", "linkedin", "google_business", "youtube", "tiktok"];
    brand.accounts.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
    brand.avatar = brand.accounts.find((a) => a.profileImageUrl)?.profileImageUrl ?? null;
    brand.cover = brand.accounts.find((a) => a.coverImageUrl)?.coverImageUrl ?? null;
    const known = brand.accounts.map((a) => a.followers).filter((n): n is number => typeof n === "number");
    brand.followers = known.length ? known.reduce((s, n) => s + n, 0) : null;
    brand.media = brand.accounts
      .flatMap((a) => a.recentMedia.map((m) => ({ ...m, platform: a.platform })))
      .filter((m) => m.image)
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
      .slice(0, 6);
  }

  return [...brands.values()].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1) || a.name.localeCompare(b.name));
}

/** Profile photo with an initials fallback (CDN links expire between syncs). */
export function AccountAvatar({ src, name, size = 40, className = "" }: { src: string | null; name: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.replace(/^@/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return src && !broken
    // eslint-disable-next-line @next/next/no-img-element -- remote, signed, short-lived CDN URLs; next/image would cache expired ones
    ? <img className={`${styles.avatar} ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <span className={`${styles.avatar} ${styles.avatarFallback} ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials || "?"}</span>;
}

function PlatformDot({ platform }: { platform: SocialPlatform }) {
  const letters: Record<SocialPlatform, string> = { facebook: "f", instagram: "◎", linkedin: "in", google_business: "G", tiktok: "♪", youtube: "▶" };
  return <span className={`${styles.platformIcon} ${styles[platform]}`}>{letters[platform]}</span>;
}

function Thumb({ item }: { item: SocialMediaItem & { platform: SocialPlatform } }) {
  const [broken, setBroken] = useState(false);
  if (broken || !item.image) return null;
  const body = <>
    {/* eslint-disable-next-line @next/next/no-img-element -- signed platform CDN URL */}
    <img src={item.image} alt={item.caption ?? "Recent post"} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    <span className={styles.thumbBadge}><PlatformDot platform={item.platform} /></span>
    {item.type === "video" ? <span className={styles.thumbPlay}>▶</span> : null}
  </>;
  return item.url
    ? <a className={styles.thumb} href={item.url} target="_blank" rel="noreferrer" title={item.caption ?? "Open post"}>{body}</a>
    : <span className={styles.thumb}>{body}</span>;
}

function BrandCard({ brand, onCreatePost }: { brand: Brand; onCreatePost: (accountIds: string[]) => void }) {
  return (
    <article className={styles.brandCard}>
      <div className={styles.brandCover} style={brand.cover ? { backgroundImage: `url("${brand.cover}")` } : undefined}>
        {brand.followers !== null ? <span className={styles.brandFollowers}>{compact(brand.followers)} followers</span> : null}
      </div>
      <div className={styles.brandBody}>
        <AccountAvatar src={brand.avatar} name={brand.name} size={54} className={styles.brandAvatar} />
        <div className={styles.brandTitle}>
          <b>{brand.name}</b>
          <small>{brand.clientName}</small>
        </div>
        <div className={styles.brandLinks}>
          {brand.accounts.map((a) => {
            const content = <><PlatformDot platform={a.platform} /><span>{a.platform === "facebook" ? "Facebook" : a.handle ?? PLATFORM_LABELS[a.platform]}</span>{a.followers !== null ? <em>{compact(a.followers)}</em> : null}{a.profileUrl ? <i aria-hidden>↗</i> : null}</>;
            return a.profileUrl
              ? <a key={a.id} href={a.profileUrl} target="_blank" rel="noreferrer" title={`Open ${a.displayName} on ${PLATFORM_LABELS[a.platform]}`}>{content}</a>
              : <span key={a.id}>{content}</span>;
          })}
        </div>
        {brand.media.length
          ? <div className={styles.thumbStrip}>{brand.media.map((m) => <Thumb key={`${m.platform}-${m.id}`} item={m} />)}</div>
          : <div className={styles.thumbEmpty}>{brand.accounts.some((a) => a.platform !== "linkedin") ? "No recent posts synced yet" : "LinkedIn doesn’t share your recent posts with apps"}</div>}
        <button type="button" className={styles.secondaryButton} onClick={() => onCreatePost(brand.accounts.filter((a) => a.postingEnabled).map((a) => a.id))}>＋ Post as {brand.name}</button>
      </div>
    </article>
  );
}

export function AccountsTab({ accounts, onCreatePost, onConnect }: { accounts: SocialAccountRow[]; onCreatePost: (accountIds: string[]) => void; onConnect: () => void }) {
  const brands = groupBrands(accounts);
  const lastSync = accounts.map((a) => a.statsUpdatedAt).filter(Boolean).sort().at(-1);
  return (
    <section className={styles.tabPanel}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Connected Brands</h2>
          <p>{brands.length} brands · {accounts.filter((a) => a.connected).length} accounts{lastSync ? ` · synced ${new Date(lastSync).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. Click a platform to open the live page.</p>
        </div>
        <div className={styles.headActions}>
          <form action={refreshSocialProfilesAction}><button className={styles.secondaryButton}><IconRepeat size={14} /> Refresh</button></form>
          <button type="button" className={styles.secondaryButton} onClick={onConnect}>⌁ Connect</button>
        </div>
      </div>
      {brands.length
        ? <div className={styles.brandGrid}>{brands.map((b) => <BrandCard key={b.key} brand={b} onCreatePost={onCreatePost} />)}</div>
        : <div className={styles.empty}><h3>No connected accounts</h3><p>Connect Meta or LinkedIn to see your brands here.</p></div>}
    </section>
  );
}

/** Overlapping avatars for the sidebar summary. */
export function AvatarStack({ accounts, max = 5 }: { accounts: SocialAccountRow[]; max?: number }) {
  const shown = accounts.slice(0, max);
  return (
    <span className={styles.avatarStack}>
      {shown.map((a) => <AccountAvatar key={a.id} src={a.profileImageUrl} name={a.displayName} size={22} />)}
      {accounts.length > max ? <span className={styles.avatarMore}>+{accounts.length - max}</span> : null}
    </span>
  );
}
