import axios, { AxiosInstance } from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const tokens = {
  get access()  { return typeof window !== 'undefined' ? localStorage.getItem('so_access')  : null; },
  get refresh() { return typeof window !== 'undefined' ? localStorage.getItem('so_refresh') : null; },
  set(a: string, r: string) { localStorage.setItem('so_access', a); localStorage.setItem('so_refresh', r); },
  clear() { localStorage.removeItem('so_access'); localStorage.removeItem('so_refresh'); },
};

export const api: AxiosInstance = axios.create({ baseURL: BASE, timeout: 15000 });

api.interceptors.request.use(cfg => {
  if (tokens.access) cfg.headers.Authorization = `Bearer ${tokens.access}`;
  return cfg;
});

let refreshing = false;
api.interceptors.response.use(r => r, async err => {
  const orig = err.config as any;
  if (err.response?.status === 401 && !orig._retry && tokens.refresh) {
    if (refreshing) return Promise.reject(err);
    orig._retry = true; refreshing = true;
    try {
      const { data } = await axios.post(`${BASE}/api/auth/refresh`, { refresh_token: tokens.refresh });
      tokens.set(data.data.access_token, data.data.refresh_token);
      orig.headers.Authorization = `Bearer ${data.data.access_token}`;
      return api(orig);
    } catch { tokens.clear(); if (typeof window !== 'undefined') window.location.href = '/login'; }
    finally { refreshing = false; }
  }
  return Promise.reject(err);
});

export const authAPI = {
  login:   (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  logout:  () => api.post('/api/auth/logout'),
  refresh: (r: string) => api.post('/api/auth/refresh', { refresh_token: r }),
};
export const hrAPI = {
  dashboard:      () => api.get('/api/hr/dashboard'),
  employees:      (p?: any) => api.get('/api/hr/employees', { params: p }),
  employee:       (id: string) => api.get(`/api/hr/employees/${id}`),
  createEmployee: (d: any) => api.post('/api/hr/employees', d),
  performance:    (id: string, weeks?: number) => api.get(`/api/hr/employees/${id}/performance`, { params: { weeks } }),
  issueWarning:   (d: any) => api.post('/api/hr/warnings', d),
  warnings:       (employeeId: string) => api.get('/api/hr/warnings', { params: { employee_id: employeeId } }),
  tasks:          (p?: any) => api.get('/api/hr/tasks', { params: p }),
  createTask:     (d: any) => api.post('/api/hr/tasks', d),
  updateTask:     (id: string, d: any) => api.patch(`/api/hr/tasks/${id}`, d),
  checkIn:        () => api.post('/api/hr/attendance/checkin'),
  checkOut:       () => api.post('/api/hr/attendance/checkout'),
  requestLeave:   (d: any) => api.post('/api/hr/leave', d),
  approveLeave:   (id: string, status: string) => api.patch(`/api/hr/leave/${id}/approve`, { status }),
  weeklyReport:   (w?: string) => api.get('/api/hr/reports/weekly', { params: { week_start: w } }),
};
export const salesAPI = {
  contractors:  () => api.get('/api/sales/contractors'),
  activity:     (p?: any) => api.get('/api/sales/activity', { params: p }),
  logActivity:  (d: any) => api.post('/api/sales/activity', d),
  clients:      () => api.get('/api/sales/clients'),
  createClient: (d: any) => api.post('/api/sales/clients', d),
  createQuote:  (d: any) => api.post('/api/sales/quotes', d),
  acceptQuote:  (id: string) => api.patch(`/api/sales/quotes/${id}/accept`),
  commissions:  () => api.get('/api/sales/commissions'),
};
export const logisticsAPI = {
  shipments:       (p?: any) => api.get('/api/logistics/shipments', { params: p }),
  createShipment:  (d: any) => api.post('/api/logistics/shipments', d),
  updateStatus:    (id: string, d: any) => api.patch(`/api/logistics/shipments/${id}/status`, d),
  createLoadJob:   (d: any) => api.post('/api/logistics/loading-jobs', d),
  completeLoadJob: (id: string, d: any) => api.patch(`/api/logistics/loading-jobs/${id}/complete`, d),
  createPortCharge:(d: any) => api.post('/api/logistics/port-charges', d),
  closePortCharge: (id: string) => api.patch(`/api/logistics/port-charges/${id}/close`),
};
export const financeAPI = {
  escrows:        (p?: any) => api.get('/api/finance/escrows', { params: p }),
  createEscrow:   (d: any) => api.post('/api/finance/escrows', d),
  openEscrow:     (id: string) => api.patch(`/api/finance/escrows/${id}/open`),
  signEscrow:     (id: string) => api.patch(`/api/finance/escrows/${id}/sign`),
  invoices:       (p?: any) => api.get('/api/finance/invoices', { params: p }),
  createInvoice:  (d: any) => api.post('/api/finance/invoices', d),
  approveInvoice: (id: string) => api.patch(`/api/finance/invoices/${id}/approve`),
  addInsurance:   (d: any) => api.post('/api/finance/insurance', d),
};
export const procurementAPI = {
  pos:       (p?: any) => api.get('/api/procurement/pos', { params: p }),
  createPO:  (d: any) => api.post('/api/procurement/pos', d),
  approvePO: (id: string) => api.patch(`/api/procurement/pos/${id}/approve`),
};
export const manufacturingAPI = {
  batches:    () => api.get('/api/manufacturing/batches'),
  markReady:  (id: string, d: any) => api.patch(`/api/manufacturing/batches/${id}/ready`, d),
  agents:     () => api.get('/api/manufacturing/agents'),
  createTask: (d: any) => api.post('/api/manufacturing/agent-tasks', d),
};
export const paperworkAPI = {
  documents:       (p?: any) => api.get('/api/paperwork/documents', { params: p }),
  document:        (id: string) => api.get(`/api/paperwork/documents/${id}`),
  createDocument:  (d: FormData) => api.post('/api/paperwork/documents', d, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadFile:      (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/api/paperwork/documents/${id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  updateDocument:  (id: string, d: any) => api.patch(`/api/paperwork/documents/${id}`, d),
  sgsInspections:  (p?: any) => api.get('/api/paperwork/sgs-inspections', { params: p }),
  createSGS:       (d: any) => api.post('/api/paperwork/sgs-inspections', d),
  expiryCalendar:  (withinDays?: number) => api.get('/api/paperwork/expiry-calendar', { params: { within_days: withinDays } }),
};
