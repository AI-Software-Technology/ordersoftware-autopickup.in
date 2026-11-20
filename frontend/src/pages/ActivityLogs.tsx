import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { ActivityLog } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const LIMIT_OPTIONS = [10, 20, 50, 100];
const DEFAULT_LIMIT = 10;

export const ActivityLogs: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- State derived from URL (single source of truth) ----
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = LIMIT_OPTIONS.includes(rawLimit) ? rawLimit : DEFAULT_LIMIT;
  const search = searchParams.get('search') || '';

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Ignore responses from stale requests (fast page/limit changes)
  const reqId = useRef(0);

  /** Write page/limit/search to URL. Defaults are omitted to keep the URL clean. */
  const updateParams = useCallback(
    (next: { page?: number; limit?: number; search?: string }, replace = false) => {
      const p = new URLSearchParams(searchParams);
      const nPage = next.page ?? page;
      const nLimit = next.limit ?? limit;
      const nSearch = next.search ?? search;

      if (nPage > 1) p.set('page', String(nPage)); else p.delete('page');
      if (nLimit !== DEFAULT_LIMIT) p.set('limit', String(nLimit)); else p.delete('limit');
      if (nSearch) p.set('search', nSearch); else p.delete('search');

      setSearchParams(p, { replace });
    },
    [searchParams, setSearchParams, page, limit, search]
  );

  const fetchLogs = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const token = getToken();
      const res = await apiFetch(`/api/activity-logs?page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (myReq !== reqId.current) return;
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
        if (json.pagination) {
          setPagination(json.pagination);
          // Page no longer exists (bad URL / logs shrank) -> jump to last page
          if (json.pagination.totalPages > 0 && page > json.pagination.totalPages) {
            updateParams({ page: json.pagination.totalPages }, true);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleLimitChange = (value: number) => updateParams({ limit: value, page: 1 });
  const handleSearchChange = (value: string) => updateParams({ search: value }, true);

  // Search filters the currently loaded page only
  const q = search.toLowerCase();
  const filteredLogs = logs.filter(l =>
    l.action.toLowerCase().includes(q) ||
    l.description.toLowerCase().includes(q) ||
    (l.user_name && l.user_name.toLowerCase().includes(q)) ||
    (l.entity_id && l.entity_id.toLowerCase().includes(q))
  );

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6  mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-amber-500" />
            Security Audit Trail & Activity Logs
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable system logs recording order creation, administrative approvals, production batches, and payments.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 self-start disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'motion-safe:animate-spin' : ''}`} />
          <span>Refresh Trail</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search action keyword, order ID, actor name (current page)..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Audit Description</th>
                <th className="py-3 px-4">Initiated By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">Loading audit trail...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">No log entries found.</td>
                </tr>
              ) : (
                filteredLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                      {l.entity_type} {l.entity_id ? `(${l.entity_id})` : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{l.description}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-900">{l.user_name || 'System / Auto'}</span>
                      {l.role_name && (
                        <span className="block text-[10px] text-slate-400">{l.role_name}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>
              Showing <span className="font-semibold text-slate-900">{from}-{to}</span> of{' '}
              <span className="font-semibold text-slate-900">{pagination.total}</span>
            </span>
            <label className="flex items-center gap-1.5">
              <span className="text-slate-500">Rows</span>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-700"
              >
                {LIMIT_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => updateParams({ page: Math.max(1, page - 1) })}
              disabled={loading || !pagination.hasPrevPage}
              className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-900 min-w-[84px] text-center">
              Page {pagination.page} / {Math.max(pagination.totalPages, 1)}
            </span>
            <button
              onClick={() => updateParams({ page: page + 1 })}
              disabled={loading || !pagination.hasNextPage}
              className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};