const { randomUUID } = require('node:crypto');
const siteRepository = require('../repositories/siteRepository');
const AppError = require('../errors/AppError');

// Explicit allowlist: even though the schema's .strict() already blocks
// unknown fields at the HTTP boundary, this makes it structurally impossible
// for any future caller to SET a pinger-written attribute (status, etc.)
// through this service.
const UPDATABLE_FIELDS = ['name', 'url', 'check_frequency_minutes', 'enabled'];

function toStatus(item) {
  return {
    status: item.status || 'unknown',
    status_code: item.status_code ?? null,
    latency_ms: item.latency_ms ?? null,
    checked_at: item.checked_at ?? null,
    error_type: item.error_type ?? null,
    error_message: item.error_message ?? null,
    consecutive_failures: item.consecutive_failures ?? 0,
    last_status_change_at: item.last_status_change_at ?? null,
  };
}

function toSite(item) {
  return {
    site_id: item.site_id,
    url: item.url,
    name: item.name,
    check_frequency_minutes: item.check_frequency_minutes,
    enabled: item.enabled,
    created_at: item.created_at,
    updated_at: item.updated_at,
    status: toStatus(item),
  };
}

async function createSite(userId, { url, name, check_frequency_minutes, enabled }) {
  const now = new Date().toISOString();

  const site = await siteRepository.create({
    user_id: userId,
    site_id: randomUUID(),
    url,
    name,
    check_frequency_minutes,
    enabled,
    created_at: now,
    updated_at: now,
  });

  return toSite(site);
}

async function listSites(userId) {
  const sites = await siteRepository.listByUser(userId);
  return sites.map(toSite);
}

async function getSite(userId, siteId) {
  const site = await siteRepository.findById(userId, siteId);
  if (!site) {
    throw new AppError(404, 'Site not found.');
  }
  return toSite(site);
}

async function updateSite(userId, siteId, updates) {
  const allowed = Object.fromEntries(
    Object.entries(updates).filter(([key]) => UPDATABLE_FIELDS.includes(key))
  );
  const site = await siteRepository.update(userId, siteId, allowed);
  return toSite(site);
}

async function deleteSite(userId, siteId) {
  await siteRepository.remove(userId, siteId);
}

async function getSiteStatus(userId, siteId) {
  const site = await siteRepository.findById(userId, siteId);
  if (!site) {
    throw new AppError(404, 'Site not found.');
  }
  return { site_id: site.site_id, ...toStatus(site) };
}

module.exports = { createSite, listSites, getSite, updateSite, deleteSite, getSiteStatus };
