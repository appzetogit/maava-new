// Every sidebar link must resolve to a real route and to an RBAC section,
// otherwise it renders as a dead link (or gets filtered out for sub-admins).
// Run: node scripts/check-admin-sidebar-links.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminSidebarMenu } from "../src/modules/Food/utils/adminSidebarMenu.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const paths = [];
const walk = (items = []) =>
  items.forEach((entry) => {
    if (!entry) return;
    if (entry.path) paths.push(entry.path);
    walk(entry.items);
    walk(entry.subItems);
  });
walk(adminSidebarMenu);

const routes = new Set(
  [...read("../src/modules/Food/components/admin/AdminRouter.jsx").matchAll(/<Route\s+path="([^"]*)"/g)].map((m) => m[1]),
);
const prefixes = [...read("../src/modules/Food/utils/adminRbac.js").matchAll(/prefix: "([^"]+)"/g)].map((m) => m[1]);

for (const path of paths) {
  const sub = path.replace(/^\/admin\/store\/?/, "");
  if (sub) assert.ok(routes.has(sub), `sidebar link has no route in AdminRouter: ${path}`);
  assert.ok(
    path === "/admin/store" || prefixes.some((prefix) => path.startsWith(prefix)),
    `sidebar link has no RBAC prefix in adminRbac: ${path}`,
  );
}

// The two links this check was written for.
for (const path of ["/admin/store/delivery-cash-limit", "/admin/store/cash-limit-settlement"]) {
  assert.ok(paths.includes(path), `missing from sidebar: ${path}`);
}

console.log(`ok - ${paths.length} sidebar links, all routed and permission-mapped`);
