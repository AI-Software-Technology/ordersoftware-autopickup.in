import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../store/authStore.js';

interface Props {
  moduleName: string;
  onBack: () => void;
}

export const AccessRestricted: React.FC<Props> = ({ moduleName, onBack }) => {
  const { user } = useAuth();
  return (
    <div className="p-6 sm:p-12 max-w-lg mx-auto my-12 bg-white rounded-2xl border border-rose-200 shadow-md p-8 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200 shadow-xs">
        <ShieldAlert className="w-7 h-7" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Access Restricted</h2>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          Your current account role <span className="font-semibold text-slate-900">({user?.role_name})</span> does not have granted authorization to access the <span className="font-semibold text-slate-900 capitalize">{moduleName}</span> module.
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          Contact your Super Administrator to adjust your capabilities in the Dynamic Roles & Permissions Matrix.
        </p>
      </div>
      <div className="pt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
};
