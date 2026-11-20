import React from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Store, Users, PackageCheck,
  CheckCircle2, CreditCard, BarChart3, Building, ShieldCheck, FileText,
  LogOut, Droplets, ChevronRight, X, ReceiptText
} from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import { canAccess } from '../lib/access.js';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen = true, onClose }) => {
  const { user, logout, hasPermission } = useAuth();

  const can = (routeId: string) => canAccess(user, hasPermission, routeId);

  const menuSections = [
    {
      title: 'Main Operations',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: can('dashboard') },
        { id: 'orders', label: 'Orders Management', icon: ShoppingCart, visible: can('orders') },
        { id: 'packing', label: 'Packing Management', icon: PackageCheck, visible: can('packing') },
        { id: 'delivered-orders', label: 'Delivered Orders', icon: CheckCircle2, visible: can('delivered-orders') },
        { id: 'bills', label: 'Bills', icon: ReceiptText, visible: can('bills') },
        { id: 'payments', label: 'Payments & Ledger', icon: CreditCard, visible: can('payments') },
      ]
    },
    {
      title: 'Relationship & Catalogs',
      items: [
        { id: 'vendors', label: 'Parties', icon: Store, visible: can('vendors') },
        { id: 'sales-persons', label: 'Sales Team', icon: Users, visible: can('sales-persons') },
        { id: 'products', label: 'Lubricant Catalog', icon: Package, visible: can('products') },
        { id: 'brands-categories', label: 'Brands & Categories', icon: Tags, visible: can('brands-categories') },
      ]
    },
    {
      title: 'Analytics & Governance',
      items: [
        { id: 'reports', label: 'Business Reports', icon: BarChart3, visible: can('reports') },
        { id: 'companies', label: 'Billing Companies', icon: Building, visible: can('companies') },
        { id: 'users', label: 'User Management', icon: Users, visible: can('users') },
        { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck, visible: can('roles') },
        { id: 'activity-logs', label: 'Audit Trail / Logs', icon: FileText, visible: can('activity-logs') },
      ]
    }
  ];

  return (
    <aside className={`
      print:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800 shadow-2xl transition-transform duration-200 ease-in-out
      lg:static lg:w-64 lg:max-w-none lg:shadow-none lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg  text-slate-950 flex items-center justify-center font-black shadow-md">
            <img src='https://i.ibb.co/YFZDpyCf/download-2.png' className='w-full' />
          </div>
          <div>
            <span className="font-bold text-white text-sm tracking-wide flex items-center gap-1">
              Maxmol<span className="text-amber-400">Lubricant</span>
              <span className="text-[8px] font-semibold uppercase px-1.5 py-0.2 bg-amber-400/20 text-amber-300 rounded ml-1 border border-amber-400/30">ERP</span>
            </span>
            <p className="text-[10px] text-slate-400 font-medium">Lubricant Ops & Logistics</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden transition"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {menuSections.map((section, sIdx) => {
          const visibleItems = section.items.filter(it => it.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx}>
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                {section.title}
              </p>
              <div className="space-y-1">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id || currentPage.startsWith(`${item.id}/`);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition group ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* User Footer & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-[11px] shrink-0">
              {user?.name ? user.name[0] : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-amber-400 truncate">{user?.role_slug === 'production_team' ? 'Packing Team' : user?.role_name}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
