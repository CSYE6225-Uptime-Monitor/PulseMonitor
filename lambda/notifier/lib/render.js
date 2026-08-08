const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// error_message and error_type originate from the *monitored server's*
// response (see lambda/pinger/lib/ping.js::classifyError) - they are
// remote-controlled input landing in the site owner's inbox. name and url
// are user-controlled. Every interpolated value in the HTML body must go
// through this.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `~${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  const minutePart = remainder ? ` ${remainder} minute${remainder === 1 ? '' : 's'}` : '';
  return `~${hourPart}${minutePart}`;
}

function subjectFor(kind, detail, environment) {
  const prefix = environment !== 'prod' ? '[dev] ' : '';
  const host = safeHost(detail.url);
  return `${prefix}[PulseMonitor] ${kind}: ${detail.name} (${host})`;
}

const FOOTER_TEXT = "You're receiving this because you monitor this site with PulseMonitor.";

function renderDownEmail(detail, { environment }) {
  const subject = subjectFor('DOWN', detail, environment);

  const textLines = [
    `${detail.name} (${detail.url}) appears to be down.`,
    '',
    `Checked at: ${detail.checked_at}`,
    detail.status_code != null ? `Status code: ${detail.status_code}` : null,
    detail.error_type ? `Error type: ${detail.error_type}` : null,
    detail.error_message ? `Error message: ${detail.error_message}` : null,
    '',
    FOOTER_TEXT,
  ].filter((line) => line !== null);

  const htmlLines = [
    `<p><strong>${escapeHtml(detail.name)}</strong> (${escapeHtml(detail.url)}) appears to be down.</p>`,
    '<ul>',
    `<li>Checked at: ${escapeHtml(detail.checked_at)}</li>`,
    detail.status_code != null ? `<li>Status code: ${escapeHtml(detail.status_code)}</li>` : null,
    detail.error_type ? `<li>Error type: ${escapeHtml(detail.error_type)}</li>` : null,
    detail.error_message ? `<li>Error message: ${escapeHtml(detail.error_message)}</li>` : null,
    '</ul>',
    `<p>${escapeHtml(FOOTER_TEXT)}</p>`,
  ].filter((line) => line !== null);

  return { subject, text: textLines.join('\n'), html: htmlLines.join('\n') };
}

function renderRecoveredEmail(detail, { environment }) {
  const subject = subjectFor('RECOVERED', detail, environment);

  const downtime =
    detail.previous_status_change_at != null
      ? formatDuration(Date.parse(detail.checked_at) - Date.parse(detail.previous_status_change_at))
      : null;

  const textLines = [
    `${detail.name} (${detail.url}) has recovered and is back up.`,
    '',
    `Checked at: ${detail.checked_at}`,
    detail.status_code != null ? `Status code: ${detail.status_code}` : null,
    downtime ? `Downtime: ${downtime}` : null,
    '',
    FOOTER_TEXT,
  ].filter((line) => line !== null);

  const htmlLines = [
    `<p><strong>${escapeHtml(detail.name)}</strong> (${escapeHtml(detail.url)}) has recovered and is back up.</p>`,
    '<ul>',
    `<li>Checked at: ${escapeHtml(detail.checked_at)}</li>`,
    detail.status_code != null ? `<li>Status code: ${escapeHtml(detail.status_code)}</li>` : null,
    downtime ? `<li>Downtime: ${escapeHtml(downtime)}</li>` : null,
    '</ul>',
    `<p>${escapeHtml(FOOTER_TEXT)}</p>`,
  ].filter((line) => line !== null);

  return { subject, text: textLines.join('\n'), html: htmlLines.join('\n') };
}

module.exports = { renderDownEmail, renderRecoveredEmail, escapeHtml, formatDuration };
