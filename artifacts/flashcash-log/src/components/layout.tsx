import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  Truck,
  Users,
  Map,
  FileText,
  FileCode2,
  CreditCard,
  LogOut,
  Smartphone,
  Globe,
  ChevronDown,
  Server,
  ClipboardCheck,
  Archive,
  ShieldCheck
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard Executivo", icon: BarChart3 },
  { href: "/aprovacao", label: "Fila de Conferência", icon: ClipboardCheck },
  { href: "/arquivo", label: "Arquivo de Operações", icon: Archive },
  { href: "/faturas", label: "Faturamento", icon: CreditCard },
  { href: "/canhotos", label: "Canhotos AI", icon: FileText },
  { href: "/viagens", label: "Viagens", icon: Map },
  { href: "/xml", label: "Upload XML", icon: FileCode2 },
  { href: "/motoristas", label: "Motoristas", icon: Truck },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/motorista-app", label: "App Motorista", icon: Smartphone },
];

const TIMEZONES = [
  { label: "BRT (Brasília)", value: "America/Sao_Paulo" },
  { label: "EST (Nova York)", value: "America/New_York" },
  { label: "CET (Lisboa)", value: "Europe/Lisbon" },
  { label: "UTC (Greenwich)", value: "UTC" },
];

const CURRENCIES = ["BRL", "USD", "EUR"];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [currency, setCurrency] = useState("BRL");
  const [tzOpen, setTzOpen] = useState(false);
  const [curOpen, setCurOpen] = useState(false);
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    setLocation("/");
  }

  /* Iniciais para avatar (ex.: "Jo\u00e3o Silva" -> "JS"). */
  const iniciais = user?.nome
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "??";

  const currentTime = new Date().toLocaleTimeString("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const activeLabel = navItems.find((i) => i.href === location)?.label || "TechSin";

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border flex flex-col shrink-0" style={{ backgroundColor: "hsl(0 0% 12%)" }}>
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-border gap-3">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-black text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #1D4ED8, #2563EB)" }}
          >
            TS
          </div>
          <div className="leading-tight">
            <span className="font-bold text-sm text-foreground tracking-tight">TechSin</span>
          </div>
        </div>

        {/* Nav label */}
        <div className="px-5 pt-5 pb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Menu Principal</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-auto pb-2">
          {navItems.map((item: any) => {
            const isActive = location === item.href;
            const isSpecial = item.special;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all duration-150 ${
                  isActive
                    ? isSpecial
                      ? "bg-amber-500/15 text-amber-400 font-medium border-l-2 border-amber-400"
                      : "bg-primary/15 text-primary font-medium border-l-2 border-primary"
                    : isSpecial
                      ? "text-amber-500/70 hover:bg-amber-500/8 hover:text-amber-400 border-l-2 border-transparent"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground border-l-2 border-transparent"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && !isActive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/20 text-primary">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-muted-foreground mb-1">
            <Server className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">TechSin · v3.0.0</span>
          </div>
          {user?.role === "superadmin" && (
            <Link
              href="/super-admin"
              className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors mb-1"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Super Admin
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sair do Sistema
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0 gap-4">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{activeLabel}</h1>
            <p className="text-[11px] text-muted-foreground">TechSin &mdash; Logística Profissional</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Timezone selector */}
            <div className="relative">
              <button
                onClick={() => { setTzOpen(!tzOpen); setCurOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded border border-border hover:border-border/80 bg-card"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{currentTime}</span>
                <span className="hidden sm:inline text-[10px] text-muted-foreground/60">{TIMEZONES.find(t => t.value === timezone)?.label.split(" ")[0]}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {tzOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded shadow-lg z-50">
                  {TIMEZONES.map((tz) => (
                    <button
                      key={tz.value}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${timezone === tz.value ? "text-primary" : "text-foreground"}`}
                      onClick={() => { setTimezone(tz.value); setTzOpen(false); }}
                    >
                      {tz.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Currency selector */}
            <div className="relative">
              <button
                onClick={() => { setCurOpen(!curOpen); setTzOpen(false); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded border border-border hover:border-border/80 bg-card"
              >
                <span className="font-mono font-medium text-foreground">{currency}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {curOpen && (
                <div className="absolute right-0 top-full mt-1 w-24 bg-card border border-border rounded shadow-lg z-50">
                  {CURRENCIES.map((cur) => (
                    <button
                      key={cur}
                      className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-white/5 transition-colors ${currency === cur ? "text-primary" : "text-foreground"}`}
                      onClick={() => { setCurrency(cur); setCurOpen(false); }}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
              <span className="hidden sm:inline">Online</span>
            </div>

            {/* User badge */}
            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-[11px] font-medium text-foreground truncate max-w-[160px]">{user?.nome ?? "Convidado"}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{user?.role ?? ""}</span>
              </div>
              <div className="w-7 h-7 rounded-full border border-border bg-card flex items-center justify-center text-[10px] font-bold text-foreground" title={user?.email}>
                {iniciais}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>

      {/* Click-outside to close dropdowns */}
      {(tzOpen || curOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setTzOpen(false); setCurOpen(false); }}
        />
      )}
    </div>
  );
}
