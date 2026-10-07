import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";
import { DEMO_MODE, SUPPORT_EMAIL, SUPPORT_PHONE } from "../../config";

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100">
      {DEMO_MODE && (
        <div
          role="status"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950"
        >
          DEMO BUILD — synthetic data, no real backend or PHI. Not for clinical use.
        </div>
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="pb-16 lg:pb-0 lg:pl-72">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8" data-print-date={new Date().toLocaleDateString("en-US")}>
          <div className="animate-fade-in">
            <Outlet />
          </div>
          {/* Support contact — present in every section (spec 2026-09-28) */}
          <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500" data-testid="support-footer">
            <span>Need help?</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-600 hover:text-brand-700">{SUPPORT_EMAIL}</a>
            <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="font-medium text-brand-600 hover:text-brand-700">{SUPPORT_PHONE}</a>
          </footer>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
