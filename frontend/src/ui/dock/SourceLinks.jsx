// Links to the evidence for a figure. Only https links are ever rendered.

export const safeHref = (url) => { try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; } };

export function SourceLinks({ sources }) {
  const links = (sources || []).filter((s) => safeHref(s.url));
  if (!links.length) return <i>none found</i>;
  return links.map((s, i) => (
    <span key={s.url}>{i > 0 && ' · '}<a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.label}</a></span>
  ));
}
