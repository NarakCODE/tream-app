/** Compare concrete route paths without matching similarly named segments. */
export function normalizeSidebarPath(path: string): string {
   const pathname = path.split(/[?#]/, 1)[0] || '/';
   return pathname.replace(/\/+$/, '') || '/';
}

export function isSidebarPathActive(pathname: string, href: string, exact = false): boolean {
   const current = normalizeSidebarPath(pathname);
   const target = normalizeSidebarPath(href);
   return current === target || (!exact && target !== '/' && current.startsWith(`${target}/`));
}
