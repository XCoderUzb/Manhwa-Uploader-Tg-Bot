import { config } from "./config.js";

const BASE = "https://app.base44.com/api/apps";

const headers = () => ({
  Authorization: `Bearer ${config.base44Token}`,
  "Content-Type": "application/json",
});

export async function listRecords(entity, { q, sort, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", JSON.stringify(q));
  if (sort) params.set("sort", sort);
  params.set("limit", String(limit));

  const response = await fetch(
    `${BASE}/${config.appId}/entities/${entity}/v2/list?${params.toString()}`,
    { headers: headers() }
  );
  if (!response.ok) throw new Error(`Ilova API xatosi (${response.status})`);
  const data = await response.json();
  return data.items || [];
}

export async function createRecords(entity, records) {
  const response = await fetch(`${BASE}/${config.appId}/entities/${entity}/bulk`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(records),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.message || JSON.stringify(data || {}).slice(0, 200);
    throw new Error(`Saqlanmadi (${response.status}) ${detail}`);
  }
  return data;
}

export async function findManhwa(code) {
  const value = String(code || "").trim();
  if (!value) return null;

  const bySlug = await listRecords("Manhwa", { q: { slug: value }, limit: 1 });
  if (bySlug.length) return bySlug[0];

  const all = await listRecords("Manhwa", { limit: 500 });
  const lower = value.toLowerCase();
  return (
    all.find((item) => item.id === value) ||
    all.find((item) => String(item.title || "").toLowerCase() === lower) ||
    all.find((item) => String(item.title || "").toLowerCase().includes(lower)) ||
    null
  );
}

export function listChapters(manhwaId) {
  return listRecords("Chapter", { q: { manhwa_id: manhwaId }, sort: "number", limit: 500 });
}

export function createChapter(record) {
  return createRecords("Chapter", [record]);
}