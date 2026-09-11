export function vendorPageHref(page: number, query: string): string {
  const params = new URLSearchParams();
  const trimmedQuery = query.trim();

  if (trimmedQuery) params.set("q", trimmedQuery);
  params.set("page", String(Math.max(1, page)));

  return `/admin/vendors?${params.toString()}`;
}
