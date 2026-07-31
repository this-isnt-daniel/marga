"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();
  
  return (
    <nav className="bg-surface-container-lowest h-screen w-64 fixed left-0 top-0 border-r border-outline-variant flex flex-col z-50">
      <div className="p-unit-md mb-unit-md flex items-center space-x-unit-sm">
        <span className="material-symbols-outlined text-[32px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>hexagon</span>
        <div>
          <div className="font-headline-md text-headline-md text-on-surface">Marga</div>
          <div className="font-label-md text-label-md text-primary">Intelligence Suite</div>
        </div>
      </div>
      <div className="flex-1 px-unit-sm space-y-1">
        <div className="px-unit-md py-unit-xs text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Main Menu</div>
        <Link href="/" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname === '/' ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">dashboard</span>
          <span className="text-sm">Dashboard</span>
        </Link>
        <Link href="/simulation" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/simulation') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">science</span>
          <span className="text-sm">Simulation Engine</span>
        </Link>
        <Link href="/alerts" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/alerts') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">inventory_2</span>
          <span className="text-sm">Active Alerts</span>
        </Link>
        <Link href="/map" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/map') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">public</span>
          <span className="text-sm">Global Route Map</span>
        </Link>
        <Link href="/history" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/history') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">history</span>
          <span className="text-sm">Risk History</span>
        </Link>
        <Link href="/apis" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/apis') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">api</span>
          <span className="text-sm">API Integrations</span>
        </Link>
        <Link href="/audit" className={`flex items-center space-x-unit-md px-unit-md py-unit-sm rounded-lg group transition-colors ${pathname.startsWith('/audit') ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
          <span className="material-symbols-outlined text-[20px]">receipt_long</span>
          <span className="text-sm">Audit Trail</span>
        </Link>
      </div>
      <div className="mt-auto p-unit-md space-y-unit-xs border-t border-outline-variant">
        <Link href="#" className="flex items-center space-x-unit-md px-unit-md py-unit-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm">Settings</span>
        </Link>
        <button className="w-full mt-unit-md bg-primary-container text-on-primary py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-[16px]">smart_toy</span>
          <span>Autonomous Mode</span>
        </button>
      </div>
    </nav>
  );
}
