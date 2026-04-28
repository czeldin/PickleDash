import { DashboardData } from '@/types/dashboard';

// Last-computed dashboard data (used for initial render before nights are selected)
let _data: DashboardData | null = null;
export function setDashboardData(d: DashboardData) { _data = d; }
export function getDashboardData(): DashboardData | null { return _data; }
