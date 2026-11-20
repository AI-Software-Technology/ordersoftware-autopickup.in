import type { LucideIcon } from 'lucide-react';
import { ShieldCheck, Building2, CreditCard, UserCheck, PackageCheck } from 'lucide-react';

// Only ever loaded through a dynamic import() behind DEMO_MODE (see lib/demo.ts).
export interface DemoAccount {
  role: string;
  name: string;
  email: string;
  password: string;
  summary: string;
  icon: LucideIcon;
  tone: string; // Tailwind classes for the small icon tile
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'Super Admin', name: 'Siddharth Oberoi', email: 'superadmin@lubricantdemo.com', password: 'Admin@123',
    summary: 'All modules, products, orders and roles', icon: ShieldCheck, tone: 'bg-indigo-100 text-indigo-700' },
  { role: 'Operations Admin', name: 'Rajesh Mehra', email: 'admin@lubricantdemo.com', password: 'Admin@123',
    summary: 'Approve orders, assign packing, oversee dispatch', icon: Building2, tone: 'bg-blue-100 text-blue-700' },
  { role: 'Accounts', name: 'Kavita Sundaram', email: 'accounts@lubricantdemo.com', password: 'Accounts@123',
    summary: 'Verify payments and manage the ledger', icon: CreditCard, tone: 'bg-emerald-100 text-emerald-700' },
  { role: 'Sales: Akash Singh', name: 'Akash Singh', email: 'akash@lubricantdemo.com', password: 'Sales@123',
    summary: 'Create orders with custom rates, add payments', icon: UserCheck, tone: 'bg-amber-100 text-amber-800' },
  { role: 'Sales: Rahul Sharma', name: 'Rahul Sharma', email: 'rahul@lubricantdemo.com', password: 'Sales@123',
    summary: 'Gujarat parties and custom-price orders', icon: UserCheck, tone: 'bg-amber-100 text-amber-800' },
  { role: 'Packing Team', name: 'Vikram Patel', email: 'production@lubricantdemo.com', password: 'Production@123',
    summary: 'Check stock, pack and hand over to dispatch', icon: PackageCheck, tone: 'bg-purple-100 text-purple-700' }
];
