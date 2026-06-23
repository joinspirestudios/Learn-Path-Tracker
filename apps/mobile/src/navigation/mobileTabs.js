// Mobile tab definitions. These align to the existing product architecture
// (the same five primary areas the web app exposes). No navigation library is
// used in this foundation phase — MobileApp drives tab state internally.

export const MOBILE_TABS = [
  { id: 'today', label: 'Today', screen: 'TodayScreen', purpose: 'Daily focus and continuity' },
  { id: 'paths', label: 'Paths', screen: 'PathsScreen', purpose: 'Joined and owned paths' },
  { id: 'discover', label: 'Discover', screen: 'DiscoverScreen', purpose: 'Public path discovery' },
  { id: 'progress', label: 'Progress', screen: 'ProgressScreen', purpose: 'Proof-backed progress' },
  { id: 'profile', label: 'Profile', screen: 'ProfileScreen', purpose: 'Account and privacy' },
];

export default MOBILE_TABS;
