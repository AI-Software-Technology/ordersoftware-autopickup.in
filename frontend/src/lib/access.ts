import type { User } from '../types.js';

// ONE table that decides who can open which screen.
// App routes (route guards) and the Sidebar menu both read from here,
// so the menu can never show something the route blocks (or the other way round).
// This is a UX layer only - the backend must still enforce permissions on every API.

type Has = (code: string) => boolean;
interface Ctx { user: User; has: Has }

const anyPerm = (...codes: string[]) => (c: Ctx) => codes.some((code) => c.has(code));
const anyRole = (...slugs: string[]) => (c: Ctx) => slugs.includes(c.user.role_slug);
const either = (...rules: Array<(c: Ctx) => boolean>) => (c: Ctx) => rules.some((r) => r(c));
const everyone = () => true;

export interface RouteRule {
  label: string;
  allow: (c: Ctx) => boolean;
}

export const ROUTE_RULES: Record<string, RouteRule> = {
  'dashboard':         { label: 'Dashboard',            allow: everyone },
  'orders':            { label: 'Orders Management',    allow: anyPerm('orders:view_all', 'orders:view_own') },
  'create-order':      { label: 'Create Order',         allow: anyPerm('orders:create') },
  'packing':           { label: 'Packing Management',   allow: anyPerm('packing:view', 'production:view') },
  // Open to every signed-in user, same as the previous menu behaviour
  'delivered-orders':  { label: 'Delivered Orders',     allow: everyone },
  'bills':             { label: 'Bills & Invoices',     allow: either(anyPerm('bills:view_all', 'bills:view_own'), anyRole('admin', 'accounts')) },
  'payments':          { label: 'Payments & Ledger',    allow: anyPerm('payments:view', 'payments:add', 'payments:verify') },
  'vendors':           { label: 'Parties',              allow: anyPerm('vendors:view_all', 'vendors:view_own') },
  'sales-persons':     { label: 'Sales Team',           allow: either(anyPerm('sales_persons:view'), anyRole('admin')) },
  'products':          { label: 'Lubricant Catalog',    allow: either(anyPerm('products:view', 'products:manage'), anyRole('packing_team', 'production_team', 'sales_person')) },
  'brands-categories': { label: 'Brands & Categories',  allow: anyPerm('products:manage') },
  'reports':           { label: 'Business Reports',     allow: anyPerm('reports:view') },
  'companies':         { label: 'Billing Companies',    allow: anyPerm('companies:manage') },
  'users':             { label: 'User Management',      allow: anyPerm('users:manage') },
  'roles':             { label: 'Roles & Permissions',  allow: anyPerm('roles:manage') },
  'activity-logs':     { label: 'Audit Logs',           allow: anyPerm('activity:view') }
};

export function canAccess(user: User | null, has: Has, routeId: string): boolean {
  if (!user) return false;
  if (user.role_slug === 'super_admin') return true;
  const rule = ROUTE_RULES[routeId];
  return rule ? rule.allow({ user, has }) : false;
}
