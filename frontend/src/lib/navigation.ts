// The pages were written against a string based navigate('orders/12') / navigate('orders?status=NEW') API.
// We keep that API (so no page has to change) and turn those strings into real URLs.
export function toPath(page: string): string {
  const clean = page.replace(/^\/+/, '');
  return `/${clean}`;
}

// '/orders/12' -> 'orders'   (used to highlight the active sidebar item)
export function sectionFromPath(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0] || 'dashboard';
}
