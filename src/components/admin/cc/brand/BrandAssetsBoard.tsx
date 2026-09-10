"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveBrandKitAction, reviewAssetAction } from "@/app/admin/brand-actions";
import type { BrandAsset, BrandBoard, BrandFilters, BrandKit } from "@/lib/brand/queries";
import { IconAlert, IconArrowRight, IconCheck, IconFile, IconGrid, IconImage, IconLayers, IconPlus, IconSearch, IconUsers, IconX } from "../Icons";
import styles from "./BrandAssets.module.css";

const ROOT = "/admin/marketing/brand";
const label = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className={styles.scrim} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>Changes are saved to the shared brand system.</p></div><button type="button" onClick={close} aria-label="Close"><IconX size={18}/></button></header>{children}</section></div>;
}

function BrandForm({ board, close }: { board: BrandBoard; close: () => void }) {
  return <form action={saveBrandKitAction} className={styles.form} onSubmit={close}>
    <h3>Basic</h3><div className={styles.two}><label>Brand Name<input name="name" required autoFocus/></label><label>Internal Name<input name="internal_name"/></label></div>
    <div className={styles.two}><label>Client<select name="customer_id"><option value="">No client / internal</option>{board.clients.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Brand Type<select name="brand_type" defaultValue="internal"><option value="internal">Internal</option><option value="client">Client Brand</option><option value="white_label">White Label</option><option value="product">Product Brand</option><option value="sub_brand">Sub-Brand</option></select></label></div>
    <div className={styles.two}><label>Status<select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="active">Active</option><option value="needs_review">Needs Review</option><option value="incomplete">Incomplete</option><option value="paused">Paused</option></select></label><label>Industry<input name="industry"/></label></div>
    <label>Description<textarea name="description" rows={3}/></label><label>Tagline<input name="tagline"/></label>
    <h3>Brand ownership</h3><label>Ownership<select name="ownership" defaultValue="internal"><option value="internal">Internal</option><option value="client_owned">Client-Owned</option><option value="joint">Joint</option><option value="white_label">White Label</option></select></label>
    <h3>Primary identity</h3><div className={styles.two}><label>Primary Font<input name="primary_font"/></label><label>Secondary Color<input name="secondary_color" type="color" defaultValue="#1e293b"/></label></div>
    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close}>Cancel</button><button className={styles.primary}>Create Brand Kit</button></div>
  </form>;
}

function UploadForm({ board, close }: { board: BrandBoard; close: () => void }) {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const fd = new FormData(e.currentTarget); const file = input.current?.files?.[0]; if (!file) return setError("Choose a file first."); fd.set("file", file); setBusy(true); const res = await fetch("/api/admin/assets", { method: "POST", body: fd }); const body = await res.json().catch(() => ({})); setBusy(false); if (!res.ok) return setError(body.error ?? "Upload failed."); close(); router.refresh(); }
  return <form className={styles.form} onSubmit={submit}><label>File<input ref={input} type="file" accept="image/*,video/*,audio/*,application/pdf" required/></label><div className={styles.two}><label>Brand<select name="brand_profile_id"><option value="">Unassigned</option>{board.brands.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label><label>Asset Type<select name="asset_type"><option value="logo">Logo</option><option value="brand_graphic">Brand Graphic</option><option value="photo">Photo</option><option value="video">Video</option><option value="ad">Ad</option><option value="product_image">Product Image</option><option value="template">Template</option><option value="document">Document</option><option value="other">Other</option></select></label></div><label>Title<input name="title"/></label><label>Tags<input name="tags" placeholder="campaign, approved photo, product"/></label>{error ? <p className={styles.error}>{error}</p> : null}<div className={styles.actions}><button type="button" className={styles.secondary} onClick={close}>Cancel</button><button className={styles.primary} disabled={busy}>{busy ? "Uploading…" : "Upload Asset"}</button></div></form>;
}

function Kpis({ board }: { board: BrandBoard }) {
  const cards = [
    ["Total Brand Kits", board.kpis.total, <IconLayers key="i"/>], ["Client Brands", board.kpis.clientBrands, <IconUsers key="i"/>],
    ["Logos Stored", board.kpis.logos, <IconImage key="i"/>], ["Templates", board.kpis.templates, <IconFile key="i"/>],
    ["Assets Added This Month", board.kpis.addedThisMonth, <IconPlus key="i"/>], ["Needs Review", board.kpis.needsReview, <IconAlert key="i"/>],
  ] as const;
  return <div className={styles.kpis}>{cards.map(([name, value, icon]) => <article key={name}><span>{icon}</span><div><small>{name}</small><strong>{value}</strong><em>{value === 0 ? "No data" : "Live records"}</em></div></article>)}</div>;
}

function Attention({ board }: { board: BrandBoard }) {
  if (!board.attention.length) return <section className={styles.attention}><div className={styles.attentionTitle}><IconCheck size={18}/><b>Brand systems are complete</b><span>No recorded issues need attention.</span></div></section>;
  return <section className={styles.attention}><div className={styles.attentionTitle}><IconAlert size={18}/><b>Needs Attention</b><span>{board.attention.length} recorded issue{board.attention.length === 1 ? "" : "s"}</span></div><div className={styles.attentionItems}>{board.attention.map((a) => <Link href={`${ROOT}/${a.brandId}`} key={a.id}><i className={styles[a.tone]}/><span><b>{a.brand}</b><small>{a.message}</small></span></Link>)}</div><Link href={`${ROOT}?tab=approvals`}>View All <IconArrowRight size={13}/></Link></section>;
}

function Toolbar({ board, filters }: { board: BrandBoard; filters: BrandFilters }) {
  return <form className={styles.toolbar}><div className={styles.search}><IconSearch size={15}/><input name="q" defaultValue={filters.q} placeholder="Search brands, assets, or templates…"/></div><select name="status" defaultValue={filters.status}><option value="">Status</option>{["active","draft","needs_review","incomplete","paused"].map((v) => <option value={v} key={v}>{label(v)}</option>)}</select><select name="client" defaultValue={filters.client}><option value="">Client</option>{board.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="industry" defaultValue={filters.industry}><option value="">Industry</option>{board.industries.map((v) => <option key={v}>{v}</option>)}</select><select name="type" defaultValue={filters.type}><option value="">Brand Type</option>{["internal","client","white_label","product","sub_brand"].map((v) => <option value={v} key={v}>{label(v)}</option>)}</select><select name="sort" defaultValue={filters.sort}><option value="name">Name A–Z</option><option value="updated">Recently Updated</option><option value="used">Most Used</option><option value="assets">Most Assets</option><option value="review">Needs Review</option></select><button className={styles.filterButton}>Apply</button><div className={styles.toggle}><Link className={filters.view === "grid" ? styles.on : ""} href={{ query: { ...filters, view: "grid" } }}><IconGrid size={14}/> Grid</Link><Link className={filters.view === "list" ? styles.on : ""} href={{ query: { ...filters, view: "list" } }}>☷ List</Link></div></form>;
}

function BrandCard({ brand }: { brand: BrandKit }) {
  return <article className={styles.brandCard}><div className={styles.brandHead}><div className={styles.logo}>{brand.logoUrl ? <Image src={brand.logoUrl} alt="" fill sizes="64px"/> : <span>{brand.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}</span>}</div><div><h3>{brand.name}</h3><div className={styles.badges}><span>{label(brand.brandType)}</span><span className={styles[brand.status]}>{label(brand.status)}</span></div></div></div><p>{brand.tagline || brand.description || "No tagline configured."}</p><div className={styles.identity}><div className={styles.swatches}>{brand.colors.length ? brand.colors.slice(0, 5).map((c, i) => <i key={`${c}-${i}`} style={{ background: c }} title={c}/>) : <small>No colors</small>}</div><div><small>Primary Font</small><b>{brand.primaryFont || "Not set"}</b></div></div><div className={styles.stats}><span><b>{brand.templateCount}</b>Templates</span><span><b>{brand.assetCount}</b>Assets</span><span><b>{brand.logoCount}</b>Logos</span></div><div className={styles.cardActions}><Link href={`${ROOT}/${brand.id}`}>Open Brand Kit <IconArrowRight size={14}/></Link><Link href={`${ROOT}/${brand.id}?tab=settings`} aria-label={`Edit ${brand.name}`}>•••</Link></div></article>;
}

function BrandKits({ board, filters }: { board: BrandBoard; filters: BrandFilters }) {
  if (!board.brands.length) return <div className={styles.empty}><IconLayers size={28}/><h2>No brand kits yet</h2><p>Create your first brand kit to start managing logos, colors, typography, messaging, and templates.</p></div>;
  if (filters.view === "list") return <div className={styles.list}>{board.brands.map((b) => <Link href={`${ROOT}/${b.id}`} key={b.id}><span className={styles.miniLogo}>{b.logoUrl ? <Image src={b.logoUrl} alt="" fill sizes="40px"/> : b.name.slice(0, 2).toUpperCase()}</span><b>{b.name}</b><span>{b.clientName ?? label(b.brandType)}</span><span>{b.assetCount} assets</span><span className={styles[b.status]}>{label(b.status)}</span><IconArrowRight size={14}/></Link>)}</div>;
  return <div className={styles.brandGrid}>{board.brands.map((b) => <BrandCard brand={b} key={b.id}/>)}</div>;
}

function AssetTile({ asset, review = false }: { asset: BrandAsset; review?: boolean }) {
  return <article className={styles.asset}><div className={styles.assetPreview}>{asset.url && asset.mimeType?.startsWith("image/") ? <Image src={asset.url} alt="" fill sizes="240px"/> : <IconFile size={28}/>}<span>{label(asset.assetType)}</span></div><div><b>{asset.title}</b><small>{asset.brandName ?? "Unassigned"} · {label(asset.approvalStatus)}</small></div>{review ? <form action={reviewAssetAction}><input type="hidden" name="asset_id" value={asset.id}/><button name="status" value="approved">Approve</button><button name="status" value="changes_requested">Request changes</button><button name="status" value="rejected">Reject</button></form> : null}</article>;
}

function MainContent({ board, filters }: { board: BrandBoard; filters: BrandFilters }) {
  if (filters.tab === "kits") return <BrandKits board={board} filters={filters}/>;
  if (filters.tab === "templates") return board.templates.length ? <div className={styles.assetGrid}>{board.templates.map((t) => <article className={styles.asset} key={t.id}><div className={styles.assetPreview}><IconGrid size={28}/><span>{label(t.type)}</span></div><div><b>{t.name}</b><small>{t.brandName ?? "Unassigned"} · {t.width && t.height ? `${t.width}×${t.height}` : "Custom size"} · {label(t.status)}</small></div></article>)}</div> : <div className={styles.empty}><IconGrid size={28}/><h2>No templates yet</h2><p>Create reusable branded templates inside a brand kit.</p></div>;
  let assets = board.assets;
  if (filters.tab === "approvals") assets = assets.filter((a) => a.approvalStatus === "waiting_review");
  if (filters.tab === "guidelines") return <div className={styles.empty}><IconFile size={28}/><h2>Guidelines live inside each brand kit</h2><p>Open a brand kit to manage logo, color, typography, channel, and legal guidance in context.</p></div>;
  if (!assets.length) return <div className={styles.empty}><IconImage size={28}/><h2>No {filters.tab === "approvals" ? "assets awaiting approval" : filters.tab} yet</h2><p>{filters.tab === "approvals" ? "Submitted assets will appear here for review." : "Upload the first approved brand asset."}</p></div>;
  return <div className={styles.assetGrid}>{assets.map((a) => <AssetTile asset={a} review={filters.tab === "approvals"} key={a.id}/>)}</div>;
}

function SideRail({ board }: { board: BrandBoard }) {
  const total = board.health.complete + board.health.needsReview + board.health.incomplete;
  const complete = total ? Math.round(board.health.complete / total * 100) : 0;
  return <aside className={styles.rail}><section><header><b>Brand Health</b><Link href={`${ROOT}?sort=review`}>View Details →</Link></header><div className={styles.health}><div className={styles.donut} style={{ "--complete": `${complete * 3.6}deg` } as React.CSSProperties}><span><b>{total}</b>Brand Kits</span></div><ul><li><i className={styles.green}/><span>Complete</span><b>{board.health.complete}</b></li><li><i className={styles.yellow}/><span>Needs Review</span><b>{board.health.needsReview}</b></li><li><i className={styles.red}/><span>Missing Assets</span><b>{board.health.incomplete}</b></li></ul></div></section><section><header><b>Recently Added Assets</b><Link href={`${ROOT}?tab=assets`}>View All →</Link></header>{board.recentAssets.length ? <div className={styles.recent}>{board.recentAssets.map((a) => <div key={a.id}><div>{a.url && a.mimeType?.startsWith("image/") ? <Image src={a.url} alt="" fill sizes="90px"/> : <IconFile size={22}/>}</div><small>{a.title}</small></div>)}</div> : <p className={styles.noData}>No assets have been uploaded.</p>}</section><section><header><b>Most Used Brand</b><Link href={`${ROOT}?sort=used`}>View Details →</Link></header>{board.mostUsed ? <><div className={styles.usedBrand}><span>{board.mostUsed.brand.name.slice(0, 2).toUpperCase()}</span><div><b>{board.mostUsed.brand.name}</b><small>{board.mostUsed.total} recorded uses this month</small></div></div><ul className={styles.channels}>{board.mostUsed.channels.map((c) => <li key={c.channel}><span>{label(c.channel)}</span><i><em style={{ width: `${Math.min(100, c.count / board.mostUsed!.total * 100)}%` }}/></i><b>{c.count}</b></li>)}</ul></> : <p className={styles.noData}>Usage tracking has no recorded references this month.</p>}</section></aside>;
}

export default function BrandAssetsBoard({ board, filters, canManage }: { board: BrandBoard; filters: BrandFilters; canManage: boolean }) {
  const [modal, setModal] = useState<"brand" | "upload" | null>(null);
  const tabs = [["kits","Brand Kits"],["assets","Assets"],["templates","Templates"],["approvals","Approvals"],["guidelines","Guidelines"]];
  return <div className={styles.page}><header className={styles.pageHead}><div><h1>Brand Assets</h1><p>Manage logos, colors, typography, templates, messaging, and brand standards for every client.</p></div><div>{canManage ? <button className={styles.primary} onClick={() => setModal("brand")}><IconPlus size={15}/> New Brand Kit</button> : null}<button className={styles.secondary} onClick={() => setModal("upload")}><IconImage size={15}/> Upload Asset</button><Link className={styles.secondary} href="/logo-studio" target="_blank"><IconImage size={15}/> Open Logo Studio</Link></div></header><Kpis board={board}/><Attention board={board}/><nav className={styles.tabs}>{tabs.map(([id, name]) => <Link className={filters.tab === id ? styles.activeTab : ""} href={{ pathname: ROOT, query: { tab: id } }} key={id}>{name}</Link>)}</nav><div className={styles.layout}><main><Toolbar board={board} filters={filters}/><MainContent board={board} filters={filters}/></main><SideRail board={board}/></div>{modal === "brand" ? <Modal title="New Brand Kit" close={() => setModal(null)}><BrandForm board={board} close={() => setModal(null)}/></Modal> : null}{modal === "upload" ? <Modal title="Upload Asset" close={() => setModal(null)}><UploadForm board={board} close={() => setModal(null)}/></Modal> : null}</div>;
}
