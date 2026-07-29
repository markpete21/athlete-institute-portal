/**
 * Admin module registry — the single source of truth for the persistent
 * AdminShell: the left rail, the favourites bar, and each module's quick-action
 * dropdown. Adding an admin screen means adding it here (and nowhere else).
 *
 * Pure data (no server imports) so both server and client components can use it.
 */

export type ModuleKey =
  | 'programs' | 'camps' | 'club' | 'academy' | 'competitive'
  | 'schedule' | 'facilities' | 'conflicts' | 'rentals' | 'displays'
  | 'staff' | 'roles' | 'waivers' | 'import' | 'brands'
  | 'comms' | 'feedback' | 'points' | 'promotions' | 'gallery'
  | 'reports' | 'retention' | 'dunning' | 'assist';

export interface QuickAction { label: string; href: string }
export interface ModuleDef {
  key: ModuleKey;
  label: string;
  group: GroupName;
  href: string;
  actions: QuickAction[];
}

export type GroupName =
  | 'Programs & Registration'
  | 'Facilities & Scheduling'
  | 'People & Staff'
  | 'Engagement'
  | 'Business & Insight';

export const GROUP_ORDER: GroupName[] = [
  'Programs & Registration',
  'Facilities & Scheduling',
  'People & Staff',
  'Engagement',
  'Business & Insight',
];

export const MODULES: ModuleDef[] = [
  { key: 'programs', label: 'Programs', group: 'Programs & Registration', href: '/programs', actions: [
    { label: 'All programs', href: '/programs' },
    { label: 'Program types', href: '/programs/types' },
    { label: 'Custom questions', href: '/programs/questions' },
  ] },
  { key: 'camps', label: 'Camps', group: 'Programs & Registration', href: '/camps', actions: [
    { label: 'All camps', href: '/camps' },
  ] },
  { key: 'club', label: 'Club', group: 'Programs & Registration', href: '/club', actions: [
    { label: 'Clubs & teams', href: '/club' },
  ] },
  { key: 'academy', label: 'Academy', group: 'Programs & Registration', href: '/academy', actions: [
    { label: 'Academies', href: '/academy' },
  ] },
  { key: 'competitive', label: 'Competitive Play', group: 'Programs & Registration', href: '/competitive', actions: [
    { label: 'Divisions', href: '/competitive' },
  ] },

  { key: 'schedule', label: 'Schedule', group: 'Facilities & Scheduling', href: '/schedule', actions: [
    { label: 'Day view', href: '/schedule?view=day' },
    { label: 'Week view', href: '/schedule?view=week' },
    { label: 'Month view', href: '/schedule?view=month' },
  ] },
  { key: 'facilities', label: 'Facilities', group: 'Facilities & Scheduling', href: '/facilities', actions: [
    { label: 'Facility tree', href: '/facilities' },
  ] },
  { key: 'conflicts', label: 'Conflicts', group: 'Facilities & Scheduling', href: '/conflicts', actions: [
    { label: 'Open conflicts', href: '/conflicts' },
  ] },
  { key: 'rentals', label: 'Rentals', group: 'Facilities & Scheduling', href: '/rentals', actions: [
    { label: 'Quotes & agreements', href: '/rentals' },
    { label: 'Rates & settings', href: '/rentals/settings' },
  ] },
  { key: 'displays', label: 'TV Displays', group: 'Facilities & Scheduling', href: '/displays', actions: [
    { label: 'All displays', href: '/displays' },
  ] },

  { key: 'staff', label: 'Staff', group: 'People & Staff', href: '/staff', actions: [
    { label: 'Staff records', href: '/staff' },
    { label: 'Permissions', href: '/staff/permissions' },
    { label: 'Pay', href: '/staff/pay' },
  ] },
  { key: 'roles', label: 'Roles & Access', group: 'People & Staff', href: '/roles', actions: [
    { label: 'Roles', href: '/roles' },
  ] },
  { key: 'waivers', label: 'Waivers', group: 'People & Staff', href: '/waivers', actions: [
    { label: 'Waiver editor', href: '/waivers' },
  ] },
  { key: 'import', label: 'Playbook Import', group: 'People & Staff', href: '/import', actions: [
    { label: 'Import accounts', href: '/import' },
  ] },
  { key: 'brands', label: 'Brands', group: 'People & Staff', href: '/brands', actions: [
    { label: 'Brand settings', href: '/brands' },
  ] },

  { key: 'comms', label: 'Communications', group: 'Engagement', href: '/comms', actions: [
    { label: 'Campaigns', href: '/comms' },
    { label: 'Announcement', href: '/comms/announce' },
    { label: 'Auto-notifications', href: '/comms/notifications' },
  ] },
  { key: 'feedback', label: 'Feedback', group: 'Engagement', href: '/feedback', actions: [
    { label: 'Ratings overview', href: '/feedback' },
  ] },
  { key: 'points', label: 'Play Points', group: 'Engagement', href: '/points', actions: [
    { label: 'Points & referrals', href: '/points' },
  ] },
  { key: 'promotions', label: 'Promotions', group: 'Engagement', href: '/promotions', actions: [
    { label: 'Contests & challenges', href: '/promotions' },
  ] },
  { key: 'gallery', label: 'Photo & Video', group: 'Engagement', href: '/gallery', actions: [
    { label: 'Galleries', href: '/gallery' },
  ] },

  { key: 'reports', label: 'Dashboard & Reports', group: 'Business & Insight', href: '/reports', actions: [
    { label: 'Landing dashboard', href: '/reports' },
    { label: 'Financial suite', href: '/reports/financials' },
    { label: 'Report builder', href: '/reports/builder' },
  ] },
  { key: 'retention', label: 'Retention', group: 'Business & Insight', href: '/retention', actions: [
    { label: 'At-risk families', href: '/retention' },
  ] },
  { key: 'dunning', label: 'Dunning', group: 'Business & Insight', href: '/dunning', actions: [
    { label: 'Failed payments', href: '/dunning' },
  ] },
  { key: 'assist', label: 'Assist (AI)', group: 'Business & Insight', href: '/assist', actions: [
    { label: 'Ask a question', href: '/assist' },
  ] },
];

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.key, m]));

export const MAX_FAVOURITES = 8;
export const MAX_PINNED_PROGRAMS = 3;

/** Which module a pathname belongs to (longest-prefix match). */
export function activeModuleFor(pathname: string): ModuleKey | null {
  let best: ModuleDef | null = null;
  for (const m of MODULES) {
    if (pathname === m.href || pathname.startsWith(`${m.href}/`)) {
      if (!best || m.href.length > best.href.length) best = m;
    }
  }
  return best?.key ?? null;
}
