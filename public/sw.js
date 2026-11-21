/*
 * The service worker for phone alerts. It does two things and nothing else:
 * shows an alert when the site sends one, and opens the right admin page when
 * the alert is tapped. It does not cache pages or intercept requests.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = typeof message.title === "string" && message.title ? message.title : "Tomorrow’s Tech AI";
  const url = typeof message.url === "string" && message.url.startsWith("/admin") ? message.url : "/admin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: typeof message.tag === "string" ? message.tag : undefined,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client && "navigate" in client) return client.focus().then((focused) => focused.navigate(url));
      }
      return self.clients.openWindow(url);
    })
  );
});
