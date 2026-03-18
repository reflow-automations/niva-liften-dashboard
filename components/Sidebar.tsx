"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Phone,
  AlertTriangle,
  DollarSign,
  LogOut,
  ChevronLeft,
  Menu,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/lib/useAdmin";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Liften",
    href: "/liften",
    icon: Building2,
  },
  {
    label: "Gesprekken",
    href: "/gesprekken",
    icon: Phone,
  },
  {
    label: "Noodoproepen",
    href: "/noodoproepen",
    icon: AlertTriangle,
  },
  {
    label: "Kosten",
    href: "/kosten",
    icon: DollarSign,
    adminOnly: true,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useAdmin();

  const filteredNavItems = navItems.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
          <Building2 className="w-5 h-5 text-accent" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">
              Niva Liften
            </h1>
            <p className="text-xs text-text-muted whitespace-nowrap">
              Dashboard
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                active
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 ${
                  active
                    ? "text-accent"
                    : "text-text-muted group-hover:text-text-secondary"
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse & Logout */}
      <div className="p-3 space-y-1 border-t border-border-subtle">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all cursor-pointer"
        >
          <ChevronLeft
            className={`w-5 h-5 transition-transform ${
              collapsed ? "rotate-180" : ""
            }`}
          />
          {!collapsed && <span>Inklappen</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-danger hover:bg-danger-muted transition-all cursor-pointer"
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Uitloggen</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary cursor-pointer"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-surface border-r border-border transition-all duration-300 ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for desktop layout */}
      <div
        className={`hidden lg:block flex-shrink-0 transition-all duration-300 ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      />
    </>
  );
}
