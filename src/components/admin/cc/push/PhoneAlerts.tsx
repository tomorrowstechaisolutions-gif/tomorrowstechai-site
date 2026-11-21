"use client";

import { useEffect, useState } from "react";

/**
 * Turns phone alerts on for the device this page is open on.
 *
 * On an iPhone this only works from the site added to the Home Screen: Apple
 * does not allow web alerts from a normal Safari tab. The panel says so when
 * that is the case.
 */

type Status = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentStatus(): Promise<Status> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    return iphone && !installed ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const existing = await registration?.pushManager.getSubscription();
  return existing ? "on" : "off";
}

export default function PhoneAlerts({ publicKey, devices }: { publicKey: string; devices: number }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    currentStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const allowed = await Notification.requestPermission();
      if (allowed !== "granted") {
        setStatus(allowed === "denied" ? "blocked" : "off");
        return setNote("Alerts were not allowed on this device.");
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Could not save this device.");
      setStatus("on");
      setNote("Alerts are on for this device.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not turn alerts on.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setStatus("off");
      setNote("Alerts are off for this device.");
    } catch {
      setNote("Could not turn alerts off.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) });
      const result = (await res.json().catch(() => ({}))) as { sent?: number; failed?: number; error?: string };
      setNote(res.ok ? `Test sent to ${result.sent ?? 0} device${result.sent === 1 ? "" : "s"}${result.failed ? `, ${result.failed} failed` : ""}.` : result.error || "The test could not be sent.");
    } catch {
      setNote("The test could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  if (!publicKey) return <p className="sv-muted">Phone alerts are not set up on the server yet. They need two keys added to the site&rsquo;s settings.</p>;

  return (
    <div>
      <p style={{ margin: "0 0 10px" }}>
        {status === "checking" && "Checking this device."}
        {status === "on" && "This device gets an alert on its lock screen for every kind of email below that is switched on."}
        {status === "off" && "Turn alerts on to get one on this device’s lock screen for every kind of email below that is switched on."}
        {status === "blocked" && "Alerts are blocked for this site on this device. Allow notifications for tomorrowstechai.com in the device’s settings, then come back."}
        {status === "needs-install" && "On an iPhone, alerts only work from the Home Screen. In Safari, tap Share, then Add to Home Screen, open the site from that icon, sign in, and come back to this page."}
        {status === "unsupported" && "This browser cannot receive alerts."}
      </p>
      <div className="sv-actions">
        {status === "off" ? <button type="button" className="cc-btn primary" onClick={turnOn} disabled={busy}>Turn on alerts on this device</button> : null}
        {status === "on" ? <button type="button" className="cc-btn" onClick={turnOff} disabled={busy}>Turn off on this device</button> : null}
        {devices > 0 || status === "on" ? <button type="button" className="cc-btn" onClick={test} disabled={busy}>Send a test alert</button> : null}
      </div>
      <p className="sv-muted" style={{ marginTop: 8 }}>{devices} device{devices === 1 ? "" : "s"} signed up.{note ? ` ${note}` : ""}</p>
    </div>
  );
}
