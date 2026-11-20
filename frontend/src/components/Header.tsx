import React, { useState, useEffect } from 'react';
import {
  Bell, Search, Plus, UserCircle, LogOut, ChevronDown, Check, RefreshCw,
  Sparkles, Menu, Droplets, X
} from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import { NotificationItem } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { DEMO_MODE } from '../lib/demo.js';
import { canAccess } from '../lib/access.js';
import type { DemoAccount } from '../lib/demoAccounts.js';
import { getToken } from '../lib/session.js';

interface HeaderProps {
  onNavigate: (page: string) => void;
  onOpenNewOrder?: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigate, onOpenNewOrder, onToggleMobileSidebar }) => {
  const { user, logout, login, hasPermission } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showSwitchRole, setShowSwitchRole] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMobileSearch, setShowMobileSearch] = useState<boolean>(false);

  const fetchNotifications = async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await apiFetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const markAllAsRead = async () => {
    try {
      const token = getToken();
      await apiFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  // Demo accounts are only fetched when the build was made with VITE_DEMO_MODE=true
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      import('../lib/demoAccounts.js').then((m) => setDemoAccounts(m.DEMO_ACCOUNTS));
    }
  }, []);

  const handleQuickSwitch = async (acc: DemoAccount) => {
    try {
      await login(acc.email, acc.password);
      setShowSwitchRole(false);
      setShowUserMenu(false);
      onNavigate('dashboard');
    } catch (err) {
      console.error('Switch failed:', err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onNavigate(`orders?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="print:hidden sticky top-0 z-30 bg-white border-b border-slate-200 h-16 flex items-center justify-between px-3 sm:px-4 lg:px-6">
      {/* If Mobile Search is Active */}
      {showMobileSearch ? (
        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            onClick={() => setShowMobileSearch(false)}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg shrink-0"
            aria-label="Close search"
          >
            <X className="w-5 h-5" />
          </button>
          <form
            onSubmit={(e) => {
              handleSearchSubmit(e);
              setShowMobileSearch(false);
            }}
            className="relative flex-1"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search orders, parties, products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-100 text-xs border border-transparent focus:border-amber-400 focus:bg-white rounded-lg outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={(e) => {
              handleSearchSubmit(e);
              setShowMobileSearch(false);
            }}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shrink-0"
          >
            Search
          </button>
        </div>
      ) : (
        <>
          {/* Left: Hamburger + Brand for Mobile & Desktop Search */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 mr-2">
            {/* Hamburger Menu on Mobile */}
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Brand Link */}
            <div
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-1.5 cursor-pointer lg:hidden shrink-0"
            >
              <div className="w-9 h-9 rounded-md  text-slate-950 flex items-center justify-center font-black shadow-xs">
               <img src='https://i.ibb.co/YFZDpyCf/download-2.png' className='w-full' />
              </div>
              <span className="font-bold text-slate-900 text-sm tracking-tight hidden xs:inline">
                Maxmol<span className="text-amber-500">Lubricant</span>
              </span>
            </div>

            {/* Desktop Search Input */}
            <div className="hidden md:block w-full max-w-md">
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search orders (ORD-10170), parties, products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-xs border border-transparent focus:border-slate-300 rounded-lg outline-none transition"
                />
              </form>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Mobile Search Button */}
            <button
              type="button"
              onClick={() => setShowMobileSearch(true)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
              title="Search orders & products"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Quick Create Order Button (guarded by orders:create permission) */}
            {(user?.role_slug === 'super_admin' || hasPermission('orders:create')) && (
              <button
                onClick={() => onOpenNewOrder ? onOpenNewOrder() : onNavigate('create-order')}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold text-xs rounded-lg shadow-xs transition"
                title="Create New Order"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Create Order</span>
              </button>
            )}

        {/* Demo Fast Switcher Pill - demo builds only */}
        {DEMO_MODE && demoAccounts.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowSwitchRole(!showSwitchRole)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition"
            title="Fast switch between roles to test the complete workflow"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span className="hidden sm:inline">Switch Role</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showSwitchRole && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:max-w-sm sm:w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">Instant Role Switcher</p>
                <p className="text-[11px] text-slate-500">Test different user perspectives with 1 click</p>
              </div>
              <div className="mt-1 space-y-1 max-h-80 overflow-y-auto">
                {demoAccounts.map((acc, i) => {
                  const Icon = acc.icon;
                  const isCurrent = user?.email.toLowerCase() === acc.email.toLowerCase();
                  return (
                    <button
                      key={i}
                      onClick={() => handleQuickSwitch(acc)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition ${
                        isCurrent ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-md ${acc.tone}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-tight">{acc.role}</p>
                          <p className="text-[11px] text-slate-500">{acc.name}</p>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-amber-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[10px] rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] text-amber-300 hover:text-amber-200 underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No recent notifications
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className={`p-3 text-xs transition ${n.is_read ? 'bg-white opacity-75' : 'bg-blue-50/40'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-800">{n.title}</p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{n.message}</p>
                      {n.order_id && (
                        <button
                          onClick={() => {
                            setShowNotifications(false);
                            onNavigate(`orders/${n.order_id}`);
                          }}
                          className="mt-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                        >
                          View Order →
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 p-1.5 hover:bg-slate-100 rounded-lg transition"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 font-bold flex items-center justify-center text-xs border border-slate-700 shadow-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user?.name}</p>
              <span className="inline-block px-1.5 py-0.2 bg-slate-100 text-slate-600 font-medium rounded text-[10px]">
                {user?.role_name}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">{user?.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Role: {user?.role_name}</p>
              </div>

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 border-t border-slate-100"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )}
</header>
  );
};
