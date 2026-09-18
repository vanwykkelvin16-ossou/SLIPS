import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  CircleHelp,
  Download,
  FolderTree,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Settings,
  Store,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Also highlight the item when the path starts with one of these. */
  matches?: string[];
}

export const primaryNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan a Slip', icon: Camera },
  { href: '/slips', label: 'My Slips', icon: Receipt },
  { href: '/folders', label: 'Folders', icon: FolderTree },
  { href: '/exports', label: 'Exports', icon: Download },
];

export const secondaryNav: NavItem[] = [
  { href: '/business', label: 'Business Profile', icon: Store },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/help', label: 'Help', icon: CircleHelp },
];

export const mobileNav: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/slips', label: 'My Slips', icon: Receipt },
  { href: '/scan', label: 'Scan', icon: Camera },
  { href: '/folders', label: 'Folders', icon: FolderTree },
  { href: '/more', label: 'More', icon: MoreHorizontal, matches: ['/settings', '/business', '/exports', '/help'] },
];

export function isActivePath(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (pathname.startsWith(`${item.href}/`)) return true;
  return (item.matches ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
