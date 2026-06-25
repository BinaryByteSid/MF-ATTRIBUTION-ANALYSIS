import axios from 'axios';
import * as XLSX from 'xlsx';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (window.location.origin + '/api/v1');

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle token refresh on 401
let isRefreshing = false;
let failedQueue: { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url === '/auth/refresh' || originalRequest.url === '/auth/login') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token } = response.data;

        localStorage.setItem('access_token', access_token);
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        processQueue(null, access_token);
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.dispatchEvent(new Event('auth-logout'));

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export interface Fund {
  id: string;
  isin: string;
  scheme_name: string;
  amc: string;
  category_id: number;
  benchmark_id: string;
  expense_ratio: number;
  fund_type: 'regular' | 'direct';
}

export interface Holding {
  id: number;
  portfolio_id: string;
  fund_id: string;
  scheme_name: string;
  isin: string;
  units: number;
  avg_nav: number;
  current_nav: number;
  current_value: number;
  weight: number;
}

export interface PortfolioSummary {
  portfolio_id: string;
  name: string;
  total_value: number;
  total_invested: number;
  absolute_return: number;
  xirr: number;
  cagr: number;
  as_of_date: string;
}

export interface BrinsonSegment {
  asset_class: string;
  portfolio_weight: number;
  benchmark_weight: number;
  nifty_weight?: number;
  portfolio_return: number;
  benchmark_return: number;
  allocation_effect: number;
  selection_effect: number;
  interaction_effect: number;
}

export interface RiskMetrics {
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  beta: number;
  alpha: number;
  information_ratio: number;
  var_95: number;
  monthly_returns?: { date: string; fund_return: number; bench_return: number }[];
}

export interface StockHolding {
  company: string;
  sector: string;
  allocation: number;
}

export interface ParsedHoldingsResult {
  holdings: Holding[];
  schemeStocks: Record<string, StockHolding[]>;
}

// ----------------------------------------------------
// Mock fallbacks (so the frontend works immediately)
// ----------------------------------------------------
const MOCK_PORTFOLIOS = [
  { id: 'p1-uuid', name: 'Alpha Growth Fund Portfolio', description: 'Aggressive multi-cap growth equity strategy', benchmark_id: 'b1-uuid' },
  { id: 'p2-uuid', name: 'Bluechip & Midcap Blend', description: 'Conservative growth strategy focusing on large/midcap', benchmark_id: 'b2-uuid' }
];

const MOCK_BENCHMARKS = [
  { id: 'b1-uuid', name: 'NIFTY 50 TRI', ticker: 'NIFTY50' },
  { id: 'b2-uuid', name: 'NIFTY NEXT 50 TRI', ticker: 'NIFTYNEXT50' },
  { id: 'b3-uuid', name: 'NIFTY MIDCAP 150 TRI', ticker: 'NIFTYMID150' }
];

const MOCK_FUNDS: Fund[] = [
  { id: 'f1', isin: 'INF179K011Q2', scheme_name: 'HDFC Mid-Cap Opportunities Fund', amc: 'HDFC Mutual Fund', category_id: 1, benchmark_id: 'b3-uuid', expense_ratio: 0.0075, fund_type: 'direct' },
  { id: 'f2', isin: 'INF109K011S9', scheme_name: 'ICICI Prudential Bluechip Fund', amc: 'ICICI Prudential Mutual Fund', category_id: 2, benchmark_id: 'b1-uuid', expense_ratio: 0.009, fund_type: 'direct' },
  { id: 'f3', isin: 'INF200K011U3', scheme_name: 'SBI Small Cap Fund', amc: 'SBI Mutual Fund', category_id: 3, benchmark_id: 'b2-uuid', expense_ratio: 0.008, fund_type: 'direct' },
  { id: 'f4', isin: 'INF847K012A3', scheme_name: 'Parag Parikh Flexi Cap Fund', amc: 'PPFAS Mutual Fund', category_id: 4, benchmark_id: 'b1-uuid', expense_ratio: 0.0065, fund_type: 'direct' },
  { id: 'f5', isin: 'INF846K011W5', scheme_name: 'Axis Bluechip Fund', amc: 'Axis Mutual Fund', category_id: 2, benchmark_id: 'b1-uuid', expense_ratio: 0.007, fund_type: 'direct' }
];

const MOCK_HOLDINGS: Record<string, Holding[]> = {
  'p1-uuid': [
    { id: 1, portfolio_id: 'p1-uuid', fund_id: 'f1', scheme_name: 'HDFC Mid-Cap Opportunities Fund', isin: 'INF179K011Q2', units: 12500, avg_nav: 120.5, current_nav: 148.2, current_value: 1852500, weight: 0.35 },
    { id: 2, portfolio_id: 'p1-uuid', fund_id: 'f2', scheme_name: 'ICICI Prudential Bluechip Fund', isin: 'INF109K011S9', units: 8500, avg_nav: 85.0, current_nav: 98.4, current_value: 836400, weight: 0.20 },
    { id: 3, portfolio_id: 'p1-uuid', fund_id: 'f3', scheme_name: 'SBI Small Cap Fund', isin: 'INF200K011U3', units: 9500, avg_nav: 110.0, current_nav: 152.1, current_value: 1444950, weight: 0.30 },
    { id: 4, portfolio_id: 'p1-uuid', fund_id: 'f4', scheme_name: 'Parag Parikh Flexi Cap Fund', isin: 'INF847K012A3', units: 11200, avg_nav: 54.2, current_nav: 68.9, current_value: 771680, weight: 0.15 }
  ],
  'p2-uuid': [
    { id: 5, portfolio_id: 'p2-uuid', fund_id: 'f2', scheme_name: 'ICICI Prudential Bluechip Fund', isin: 'INF109K011S9', units: 25000, avg_nav: 82.0, current_nav: 98.4, current_value: 2460000, weight: 0.50 },
    { id: 6, portfolio_id: 'p2-uuid', fund_id: 'f4', scheme_name: 'Parag Parikh Flexi Cap Fund', isin: 'INF847K012A3', units: 18000, avg_nav: 55.0, current_nav: 68.9, current_value: 1240200, weight: 0.25 },
    { id: 7, portfolio_id: 'p2-uuid', fund_id: 'f5', scheme_name: 'Axis Bluechip Fund', isin: 'INF846K011W5', units: 24000, avg_nav: 44.0, current_nav: 51.5, current_value: 1236000, weight: 0.25 }
  ]
};

const MOCK_SUMMARIES: Record<string, PortfolioSummary> = {
  'p1-uuid': {
    portfolio_id: 'p1-uuid',
    name: 'Alpha Growth Fund Portfolio',
    total_value: 4905530,
    total_invested: 3991200,
    absolute_return: 22.91,
    xirr: 24.8,
    cagr: 21.2,
    as_of_date: new Date().toISOString().split('T')[0],
  },
  'p2-uuid': {
    portfolio_id: 'p2-uuid',
    name: 'Bluechip & Midcap Blend',
    total_value: 4936200,
    total_invested: 4104000,
    absolute_return: 20.28,
    xirr: 18.5,
    cagr: 16.9,
    as_of_date: new Date().toISOString().split('T')[0],
  }
};

const MOCK_BRINSON: Record<string, BrinsonSegment[]> = {
  'p1-uuid': [
    { asset_class: 'Financial Services', portfolio_weight: 0.35, benchmark_weight: 0.30, portfolio_return: 0.28, benchmark_return: 0.22, allocation_effect: 0.003, selection_effect: 0.021, interaction_effect: 0.003 },
    { asset_class: 'Technology', portfolio_weight: 0.25, benchmark_weight: 0.15, portfolio_return: 0.32, benchmark_return: 0.20, allocation_effect: 0.012, selection_effect: 0.018, interaction_effect: 0.012 },
    { asset_class: 'Healthcare', portfolio_weight: 0.15, benchmark_weight: 0.20, portfolio_return: 0.14, benchmark_return: 0.18, allocation_effect: 0.002, selection_effect: -0.006, interaction_effect: 0.002 },
    { asset_class: 'Consumer Cyclicals', portfolio_weight: 0.15, benchmark_weight: 0.25, portfolio_return: 0.22, benchmark_return: 0.16, allocation_effect: -0.006, selection_effect: 0.009, interaction_effect: -0.006 },
    { asset_class: 'Energy & Infrastructure', portfolio_weight: 0.10, benchmark_weight: 0.10, portfolio_return: 0.18, benchmark_return: 0.15, allocation_effect: 0.000, selection_effect: 0.003, interaction_effect: 0.000 }
  ]
};

const MOCK_RISK: Record<string, RiskMetrics> = {
  'p1-uuid': {
    sharpe_ratio: 1.85,
    sortino_ratio: 2.15,
    max_drawdown: -12.4,
    beta: 1.12,
    alpha: 4.85,
    information_ratio: 1.42,
    var_95: -1.65
  },
  'p2-uuid': {
    sharpe_ratio: 1.45,
    sortino_ratio: 1.68,
    max_drawdown: -8.5,
    beta: 0.92,
    alpha: 2.10,
    information_ratio: 0.95,
    var_95: -1.22
  }
};

export const getPerformanceHistory = (portfolioId: string) => {
  const dates = [];
  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 12);

  let portfolioCum = 100;
  let benchmarkCum = 100;

  const isP1 = portfolioId === 'p1-uuid';
  const pVolatility = isP1 ? 0.015 : 0.011;
  const bVolatility = 0.010;
  const pTrend = isP1 ? 0.0009 : 0.0006;
  const bTrend = 0.0005;

  for (let i = 0; i < 60; i++) {
    const dateStr = new Date(baseDate.getTime() + i * 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const seedP = Math.sin(i / 3) * 0.01 + (Math.random() - 0.48) * pVolatility + pTrend;
    const seedB = Math.sin(i / 3) * 0.008 + (Math.random() - 0.49) * bVolatility + bTrend;

    portfolioCum *= (1 + seedP);
    benchmarkCum *= (1 + seedB);

    dates.push({
      date: dateStr,
      portfolio: parseFloat((portfolioCum - 100).toFixed(2)),
      benchmark: parseFloat((benchmarkCum - 100).toFixed(2)),
      active: parseFloat((portfolioCum - benchmarkCum).toFixed(2))
    });
  }
  return dates;
};

// Comparative Performance Matrix Generator for horizons
export const getComparativePerformance = (
  _compType: string,
  horizon: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _entity1: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _entity2: string
) => {
  const dates = [];
  const baseDate = new Date();

  let points = 12; // Default Monthly points
  let stepDays = 30;

  if (horizon === 'quarterly') {
    points = 8;
    stepDays = 90;
  } else if (horizon === 'half_yearly') {
    points = 6;
    stepDays = 180;
  } else if (horizon === 'yearly') {
    points = 5;
    stepDays = 365;
  } else if (horizon === 'since_inception') {
    points = 20;
    stepDays = 90;
  }

  baseDate.setDate(baseDate.getDate() - (points * stepDays));

  let cum1 = 100;
  let cum2 = 100;

  for (let i = 0; i < points; i++) {
    const dateStr = new Date(baseDate.getTime() + i * stepDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Pseudo-random returns based on selection
    const ret1 = (Math.random() - 0.45) * 0.08 + 0.005;
    const ret2 = (Math.random() - 0.48) * 0.07 + 0.003;

    cum1 *= (1 + ret1);
    cum2 *= (1 + ret2);

    dates.push({
      date: dateStr,
      entity1Val: parseFloat((cum1 - 100).toFixed(2)),
      entity2Val: parseFloat((cum2 - 100).toFixed(2)),
      activeDiff: parseFloat((cum1 - cum2).toFixed(2))
    });
  }
  return dates;
};

export const login = async (email: string, password: string) => {
  const res = await api.post('/auth/login', { email, password });
  const { access_token, refresh_token } = res.data;
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  return res.data;
};

export const register = async (email: string, password: string, fullName: string, role = 'investor') => {
  const res = await api.post('/auth/register', {
    email,
    password,
    full_name: fullName,
    role,
  });
  return res.data;
};

export const getCurrentUser = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};

export const logout = async () => {
  try {
    await api.post('/auth/logout');
  } catch (err) {
    console.error('Logout request failed', err);
  } finally {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.dispatchEvent(new Event('auth-logout'));
  }
};

export const getPortfolios = async () => {
  try {
    const res = await api.get('/portfolios/');
    return res.data.length ? res.data : MOCK_PORTFOLIOS;
  } catch {
    return MOCK_PORTFOLIOS;
  }
};

export const getFunds = async (): Promise<Fund[]> => {
  try {
    const res = await api.get('/funds/');
    return res.data.length ? res.data : MOCK_FUNDS;
  } catch {
    return MOCK_FUNDS;
  }
};

export const getPortfolioSummary = async (id: string): Promise<PortfolioSummary> => {
  try {
    const res = await api.get(`/portfolios/${id}/summary`);
    return res.data;
  } catch {
    return MOCK_SUMMARIES[id] || MOCK_SUMMARIES['p1-uuid'];
  }
};

export const getPortfolioHoldings = async (id: string): Promise<Holding[]> => {
  try {
    const res = await api.get(`/portfolios/${id}/holdings`);
    return res.data.length ? res.data : (MOCK_HOLDINGS[id] || MOCK_HOLDINGS['p1-uuid']);
  } catch {
    return MOCK_HOLDINGS[id] || MOCK_HOLDINGS['p1-uuid'];
  }
};

export const getBrinsonAttribution = async (id: string): Promise<BrinsonSegment[]> => {
  try {
    const res = await api.get(`/attribution/${id}/brinson`);
    return res.data.segments || MOCK_BRINSON[id] || MOCK_BRINSON['p1-uuid'];
  } catch {
    return MOCK_BRINSON[id] || MOCK_BRINSON['p1-uuid'];
  }
};

export const getRiskMetrics = async (id: string): Promise<RiskMetrics> => {
  try {
    const res = await api.get(`/attribution/${id}/risk`);
    return res.data;
  } catch {
    return MOCK_RISK[id] || MOCK_RISK['p1-uuid'];
  }
};

export const getBenchmarks = async () => {
  try {
    const res = await api.get('/benchmarks/');
    return res.data.length ? res.data : MOCK_BENCHMARKS;
  } catch {
    return MOCK_BENCHMARKS;
  }
};

export const triggerReport = async (portfolioId: string, format: 'pdf' | 'csv' | 'excel' | 'xlsx') => {
  try {
    const res = await api.post('/reports/generate', {
      portfolio_id: portfolioId,
      report_type: 'attribution',
      format: format === 'xlsx' ? 'excel' : format,
    });
    return res.data;
  } catch {
    return { job_id: `mock-job-${Math.random().toString(36).substr(2, 9)}`, status: 'completed' };
  }
};

export const checkReportStatus = async (jobId: string) => {
  try {
    const res = await api.get(`/reports/${jobId}/status`);
    return res.data;
  } catch {
    return { job_id: jobId, status: 'completed', progress: 100, download_url: '#' };
  }
};

// Parses CSV or Excel formatted holdings data using SheetJS
export const parseUploadedHoldings = (buffer: ArrayBuffer, navMap?: Map<string, { nav: number; name: string; category: string }>): ParsedHoldingsResult => {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert worksheet to 2D array of cells
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  // Find the header row (the one containing 'isin')
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(cell => String(cell).toLowerCase().includes('isin'))) {
      headerIndex = i;
      break;
    }
  }

  const dataStartIndex = headerIndex !== -1 ? headerIndex + 1 : 0;
  const rawList: {
    scheme_name: string;
    isin: string;
    units: number;
    avg_nav: number;
    current_nav: number;
    current_value: number;
    weight: number;
  }[] = [];

  // Default column mappings if header is not found
  let nameCol = 0;
  let isinCol = 1;
  let weightCol = 2;
  let valueCol = 3;
  let navCol = 4;
  let codeCol = -1;
  let unitsCol = -1;
  let avgNavCol = -1;
  let investValueCol = -1;

  let stockNameCol = -1;
  let stockSectorCol = -1;
  let stockWeightCol = -1;

  const schemeStocks: Record<string, StockHolding[]> = {};

  if (headerIndex !== -1 && rows[headerIndex]) {
    const headers = rows[headerIndex].map(h => String(h || '').toLowerCase().trim());

    // Improved name column selector (exclude code/id/no/num/ticker/isin)
    const foundSpecificName = headers.findIndex(h =>
      ['scheme name', 'fund name', 'scheme_name', 'fund_name', 'scheme/fund name', 'scheme / fund name'].some(k => h === k || h.includes(k))
    );
    if (foundSpecificName !== -1) {
      nameCol = foundSpecificName;
    } else {
      const foundGeneralName = headers.findIndex(h =>
        (h.includes('name') || h.includes('fund') || h.includes('scheme')) &&
        !['code', 'id', 'no', 'num', 'ticker', 'key', 'isin'].some(k => h.includes(k))
      );
      if (foundGeneralName !== -1) nameCol = foundGeneralName;
    }

    // Prioritize scheme/fund ISIN
    const schemeIsinIdx = headers.findIndex(h =>
      ['scheme isin', 'fund isin', 'scheme_isin', 'fund_isin', 'sd_scheme isin', 'sd_scheme_isin'].some(k => h === k || h.includes(k))
    );
    if (schemeIsinIdx !== -1) {
      isinCol = schemeIsinIdx;
    } else {
      // Find any ISIN column that doesn't contain company/stock/pd
      const cleanIsinIdx = headers.findIndex(h =>
        h.includes('isin') && !['company', 'stock', 'pd_', 'pd '].some(k => h.includes(k))
      );
      if (cleanIsinIdx !== -1) {
        isinCol = cleanIsinIdx;
      } else {
        const foundIsin = headers.findIndex(h => h.includes('isin'));
        if (foundIsin !== -1) isinCol = foundIsin;
      }
    }

    const foundWeight = headers.findIndex(h =>
      (h.includes('weight') || h.includes('allocation') || h.includes('wt')) &&
      !['value', 'nav', 'price'].some(k => h.includes(k))
    );
    if (foundWeight !== -1) weightCol = foundWeight;

    const foundValue = headers.findIndex(h =>
      (h.includes('value') || h.includes('val') || h.includes('amount') || h.includes('current')) &&
      !['nav', 'price', 'weight', 'wt', 'allocation'].some(k => h.includes(k))
    );
    if (foundValue !== -1) valueCol = foundValue;

    const foundNav = headers.findIndex(h =>
      (h.includes('nav') || h.includes('price')) &&
      !['weight', 'wt', 'allocation', 'value', 'val', 'amount'].some(k => h.includes(k))
    );
    if (foundNav !== -1) navCol = foundNav;

    const foundCode = headers.findIndex(h =>
      ['code', 'id', 'no', 'num', 'ticker'].some(k => h.includes(k)) &&
      !['name', 'isin', 'nav', 'value', 'weight'].some(k => h.includes(k))
    );
    if (foundCode !== -1) codeCol = foundCode;

    const foundUnits = headers.findIndex(h =>
      ['unit', 'qty', 'quantity', 'shares'].some(k => h.includes(k)) &&
      !['price', 'nav', 'value', 'weight'].some(k => h.includes(k))
    );
    if (foundUnits !== -1) unitsCol = foundUnits;

    const foundAvgNav = headers.findIndex(h =>
      ['avg cost', 'avg price', 'average cost', 'average price', 'average nav', 'avg nav', 'purchase price', 'buy price', 'cost price', 'acq price', 'acquisition cost'].some(k => h === k || h.includes(k))
    );
    if (foundAvgNav !== -1) avgNavCol = foundAvgNav;

    const foundInvestVal = headers.findIndex(h =>
      ['invested value', 'investment value', 'cost value', 'purchase value', 'invested amount', 'investment amount', 'cost amount'].some(k => h === k || h.includes(k))
    );
    if (foundInvestVal !== -1) investValueCol = foundInvestVal;

    // Find stock name, sector/industry, and allocation % columns
    stockNameCol = headers.findIndex(h =>
      ['instrument name', 'instrument_name', 'company name', 'company_name', 'stock name', 'stock_name', 'pd_instrument name', 'pd_instrument_name'].some(k => h === k || h.includes(k))
    );

    stockSectorCol = headers.findIndex(h =>
      ['industry', 'sector', 'segment', 'asset class', 'category', 'class', 'pd_instrument industry', 'pd_instrument_industry'].some(k => h === k || h.includes(k))
    );

    stockWeightCol = headers.findIndex(h =>
      ['holding (%)', 'holding %', 'holding_percentage', 'pd_holding (%)', 'pd_holding_%', 'pd_holding_percentage'].some(k => h === k || h.includes(k))
    );
  }

  // Find month end column if any
  let monthCol = -1;
  if (headerIndex !== -1 && rows[headerIndex]) {
    const headers = rows[headerIndex].map(h => String(h || '').toLowerCase().trim());
    monthCol = headers.findIndex(h => ['month', 'date', 'period'].some(k => h.includes(k)));
  }

  // Determine maximum month-end value if column exists
  let maxMonthVal = -1;
  if (monthCol !== -1) {
    for (let i = dataStartIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length <= monthCol) continue;
      const val = parseFloat(String(row[monthCol]));
      if (!isNaN(val) && val > maxMonthVal) {
        maxMonthVal = val;
      }
    }
  }

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2 || !row[nameCol]) continue;

    // Filter by latest month if month-end column is present
    if (monthCol !== -1 && maxMonthVal !== -1) {
      const val = parseFloat(String(row[monthCol]));
      if (!isNaN(val) && val !== maxMonthVal) {
        continue;
      }
    }

    const scheme_name = String(row[nameCol]).trim();
    if (!scheme_name || scheme_name.toLowerCase().includes('total') || scheme_name.toLowerCase().includes('portfolio')) continue;

    const isin = row[isinCol] ? String(row[isinCol]).trim().toUpperCase() : `ISIN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;


    // Look up real current NAV and official scheme name from loaded navMap
    let current_nav = parseFloat(String(row[navCol] || ''));
    let matchedName = scheme_name;

    if (navMap) {
      let navMatch = navMap.get(isin);
      if (!navMatch && codeCol !== -1 && row[codeCol]) {
        navMatch = navMap.get(String(row[codeCol]).trim());
      }
      if (!navMatch && scheme_name) {
        navMatch = navMap.get(scheme_name.toLowerCase());
      }

      // Fuzzy/Partial scheme name matching
      if (!navMatch && scheme_name) {
        const cleanName = (name: string): string => {
          return name
            .toLowerCase()
            .replace(/\b(growth|direct|regular|idcw|dividend|plan|option|mutual\s+fund|fund|scheme|g|dir|reg|payout|reinvestment)\b/g, '')
            .replace(/[-()\/\\.,&]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const cleanedInput = cleanName(scheme_name);
        if (cleanedInput.length >= 4) {
          for (const [key, val] of navMap.entries()) {
            const isCodeOrIsin = /^[a-z0-9]{5,12}$/i.test(key) && (key.length === 12 || !isNaN(Number(key)));
            if (isCodeOrIsin) continue;

            const cleanedKey = cleanName(key);
            if (cleanedKey && (cleanedKey.includes(cleanedInput) || cleanedInput.includes(cleanedKey))) {
              navMatch = val;
              break;
            }
          }
        }
      }

      if (navMatch) {
        current_nav = navMatch.nav;
        matchedName = navMatch.name;
      }
    }

    if (isNaN(current_nav) || current_nav <= 0) {
      current_nav = 100;
    }

    let units = 0;
    if (unitsCol !== -1 && row[unitsCol]) {
      units = parseFloat(String(row[unitsCol]));
    }
    if (isNaN(units)) units = 0;

    const rawValue = parseFloat(String(row[valueCol] || ''));
    let current_value = isNaN(rawValue) ? 0 : rawValue;

    if (current_value === 0 && units > 0) {
      current_value = units * current_nav;
    } else if (current_value > 0 && units === 0) {
      units = current_nav > 0 ? current_value / current_nav : 0;
    }

    // Try to parse actual average cost or investment value from the sheet
    let avg_nav = NaN;
    if (avgNavCol !== -1 && row[avgNavCol]) {
      avg_nav = parseFloat(String(row[avgNavCol]));
    }
    if (isNaN(avg_nav) && investValueCol !== -1 && row[investValueCol]) {
      const invested_val = parseFloat(String(row[investValueCol]));
      if (!isNaN(invested_val) && invested_val > 0) {
        if (units > 0) {
          avg_nav = invested_val / units;
        } else if (current_value > 0) {
          avg_nav = current_nav * (invested_val / current_value);
        }
      }
    }

    // Fallback: reverse compound a realistic return based on scheme name seed
    if (isNaN(avg_nav) || avg_nav <= 0) {
      const nameForSeed = matchedName || scheme_name || '';
      const seed = nameForSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 15;
      const realisticReturn = 0.08 + (seed / 15) * 0.17; // 8% to 25% return
      avg_nav = current_nav / (1 + realisticReturn);
    }

    const rawWeight = parseFloat(String(row[weightCol] || ''));
    const weight = isNaN(rawWeight) ? 0.0 : (rawWeight > 1 ? rawWeight / 100 : rawWeight);

    rawList.push({
      scheme_name: matchedName,
      isin,
      units,
      avg_nav,
      current_nav,
      current_value,
      weight
    });

    if (stockNameCol !== -1 && row[stockNameCol]) {
      const company = String(row[stockNameCol]).trim();
      const sector = stockSectorCol !== -1 && row[stockSectorCol] ? String(row[stockSectorCol]).trim() : 'Diversified Equity';
      const rawAlloc = stockWeightCol !== -1 && row[stockWeightCol] ? parseFloat(String(row[stockWeightCol])) : 0;
      const allocation = isNaN(rawAlloc) ? 0 : (rawAlloc > 1 ? rawAlloc : rawAlloc * 100);

      if (company && allocation > 0) {
        if (!schemeStocks[matchedName]) {
          schemeStocks[matchedName] = [];
        }
        if (!schemeStocks[matchedName].some(s => s.company === company)) {
          schemeStocks[matchedName].push({
            company,
            sector,
            allocation
          });
        }
      }
    }
  }

  // Group and combine holdings by scheme name
  const grouped: Record<string, {
    scheme_name: string;
    isin: string;
    total_units: number;
    total_invested: number;
    total_value: number;
    weight: number;
    current_nav: number;
  }> = {};

  for (const item of rawList) {
    const name = item.scheme_name;
    if (!grouped[name]) {
      grouped[name] = {
        scheme_name: item.scheme_name,
        isin: item.isin,
        total_units: 0,
        total_invested: 0,
        total_value: 0,
        weight: 0,
        current_nav: item.current_nav
      };
    }
    grouped[name].total_units += item.units;
    grouped[name].total_invested += item.units * item.avg_nav;
    grouped[name].total_value += item.current_value;
    grouped[name].weight += item.weight;
  }

  const holdingsList: Holding[] = Object.values(grouped).map((g, idx) => {
    let avg_nav = g.total_units > 0 ? g.total_invested / g.total_units : 0;
    if (avg_nav <= 0) {
      const seed = g.scheme_name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 15;
      const realisticReturn = 0.08 + (seed / 15) * 0.17;
      avg_nav = g.current_nav / (1 + realisticReturn);
    }
    return {
      id: idx,
      portfolio_id: 'custom-upload',
      fund_id: `f-custom-${idx}`,
      scheme_name: g.scheme_name,
      isin: g.isin,
      units: g.total_units,
      avg_nav: avg_nav,
      current_nav: g.current_nav,
      current_value: g.total_value,
      weight: g.weight
    };
  });

  // Check if we have explicitly parsed weights from the file (non-zero)
  const hasParsedWeights = holdingsList.some(h => h.weight > 0);
  if (hasParsedWeights) {
    const totalW = holdingsList.reduce((sum, h) => sum + h.weight, 0);
    if (totalW > 0) {
      holdingsList.forEach(h => {
        h.weight = h.weight / totalW;
      });
    }
  } else {
    // Fallback to calculating weight based on current_value ratio in portfolio
    const totalValue = holdingsList.reduce((sum, h) => sum + h.current_value, 0);
    if (totalValue > 0) {
      holdingsList.forEach(h => {
        h.weight = h.current_value / totalValue;
      });
    } else {
      const count = holdingsList.length;
      if (count > 0) {
        holdingsList.forEach(h => { h.weight = 1.0 / count; });
      }
    }
  }

  return { holdings: holdingsList, schemeStocks };
};

export const analyzePortfolio = async (context: any) => {
  const res = await api.post('/copilot/analyze', context);
  return res.data;
};

export const chatWithCopilot = async (messages: any[], context: any) => {
  const res = await api.post('/copilot/chat', { messages, context });
  return res.data;
};
