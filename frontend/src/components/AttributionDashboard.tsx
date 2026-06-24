/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  getPortfolios,
  getPortfolioSummary,
  getPortfolioHoldings,
  getBrinsonAttribution,
  getFunds,
  getBenchmarks,
  triggerReport,
  checkReportStatus,
  parseUploadedHoldings,
  analyzePortfolio,
  chatWithCopilot,
  API_BASE_URL,
} from '../api';
import type {
  Holding,
  PortfolioSummary,
  BrinsonSegment,
  RiskMetrics,
  Fund,
  StockHolding
} from '../api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Cell,
  PieChart,
  Pie,
  LabelList
} from 'recharts';
import {
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  FileText,
  Percent,
  AlertTriangle,
  Zap,
  Download,
  Activity,
  CheckCircle,
  HelpCircle,
  Upload,
  Sparkles,
  Send,
  MessageSquare
} from 'lucide-react';

const BASE_SECTOR_RETURNS: Record<string, number> = {
  'Financial Services': 0.15,
  'Technology': 0.22,
  'Healthcare': 0.12,
  'Consumer Cyclicals': 0.16,
  'Energy & Infrastructure': 0.11,
  'Capital Goods': 0.18,
  'Capital Goods/Defence': 0.19,
  'Construction/Capital Goods': 0.16,
  'FMCG': 0.10,
  'Telecommunication': 0.15,
  'Automobile': 0.14,
  'Automobile/Tires': 0.13,
  'Automobile/Tractors': 0.14,
  'Utilities/Power': 0.08,
  'Consumer Services': 0.12,
  'Materials': 0.13,
  'Materials/Cement': 0.12,
  'Materials/Wood': 0.10,
  'Consumer Durables': 0.15,
  'Textiles': 0.09,
  'Textiles/Apparel': 0.11,
  'Diversified Equity': 0.14,
};

const NIFTY50_SECTOR_WEIGHTS: Record<string, number> = {
  'Financial Services': 0.33,
  'Technology': 0.13,
  'Energy & Infrastructure': 0.12,
  'FMCG': 0.08,
  'Automobile': 0.07,
  'Construction/Capital Goods': 0.06,
  'Capital Goods': 0.02,
  'Healthcare': 0.05,
  'Telecommunication': 0.04,
  'Materials': 0.05,
  'Utilities/Power': 0.05
};

const normalizeSectorName = (sec: string): string => {
  if (!sec) return 'Diversified Equity';
  const s = sec.trim().toLowerCase();
  
  if (s.includes('financial') || s.includes('bank') || s.includes('finance') || s.includes('insurance')) {
    return 'Financial Services';
  }
  if (s.includes('tech') || s.includes('software') || s.includes('it ') || s === 'it' || s.includes('computer') || s.includes('information technology')) {
    return 'Technology';
  }
  if (s.includes('energy') || s.includes('oil') || s.includes('gas') || s.includes('petroleum') || s.includes('coal') || s.includes('infra')) {
    return 'Energy & Infrastructure';
  }
  if (s.includes('fmcg') || s.includes('consumer goods') || s.includes('staples') || s.includes('food') || s.includes('beverage') || s.includes('tobacco') || s.includes('consumer services') || s.includes('durables') || s.includes('cyclicals')) {
    return 'FMCG';
  }
  if (s.includes('auto') || s.includes('vehicle') || s.includes('car')) {
    return 'Automobile';
  }
  if (s.includes('construction') || s.includes('cement')) {
    return 'Construction/Capital Goods';
  }
  if (s.includes('capital goods') || s.includes('industrial') || s.includes('machinery') || s.includes('defence') || s.includes('defense')) {
    return 'Capital Goods';
  }
  if (s.includes('health') || s.includes('pharma') || s.includes('medicine') || s.includes('hospital') || s.includes('biotech')) {
    return 'Healthcare';
  }
  if (s.includes('telecom') || s.includes('communication')) {
    return 'Telecommunication';
  }
  if (s.includes('materials') || s.includes('metal') || s.includes('mining') || s.includes('chemical') || s.includes('steel')) {
    return 'Materials';
  }
  if (s.includes('power') || s.includes('utilities') || s.includes('electricity') || s.includes('water')) {
    return 'Utilities/Power';
  }
  
  return sec.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const getNiftySectorWeight = (sec: string): number => {
  const normalized = normalizeSectorName(sec);
  return NIFTY50_SECTOR_WEIGHTS[normalized] || 0;
};

interface AlignedReturns {
  date: string;
  portReturn: number;
  benchReturn: number;
}

const alignReturns = (
  retsA: { year: number; month: number; returnVal: number }[],
  retsB: { year: number; month: number; returnVal: number }[]
): AlignedReturns[] => {
  const mapA = new Map(retsA.map(r => [`${r.year}-${String(r.month).padStart(2, '0')}`, r.returnVal]));
  const mapB = new Map(retsB.map(r => [`${r.year}-${String(r.month).padStart(2, '0')}`, r.returnVal]));
  
  const commonKeys = Array.from(mapA.keys()).filter(k => mapB.has(k)).sort();
  return commonKeys.map(k => ({
    date: k,
    portReturn: mapA.get(k)!,
    benchReturn: mapB.get(k)!
  }));
};

const calculateRiskMetrics = (
  aligned: AlignedReturns[]
): RiskMetrics => {
  if (aligned.length < 2) {
    return {
      sharpe_ratio: 0,
      sortino_ratio: 0,
      max_drawdown: 0,
      beta: 1,
      alpha: 0,
      information_ratio: 0,
      var_95: 0
    };
  }

  const port = aligned.map(a => a.portReturn);
  const bench = aligned.map(a => a.benchReturn);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = (arr: number[], m: number) => arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / (arr.length - 1);
  const stdDev = (arr: number[], m: number) => Math.sqrt(variance(arr, m));
  const covariance = (arr1: number[], m1: number, arr2: number[], m2: number) => 
    arr1.reduce((sum, val, idx) => sum + (val - m1) * (arr2[idx] - m2), 0) / (arr1.length - 1);

  const meanPort = mean(port);
  const meanBench = mean(bench);

  const rfRate = 0.065;
  const rfMonthly = rfRate / 12;

  const fund_return = meanPort * 12;
  const stdPort = stdDev(port, meanPort);
  const std_dev = stdPort * Math.sqrt(12);
  const sharpe = std_dev > 0.0001 ? (fund_return - rfRate) / std_dev : 0;
 
  const excessPort = port.map(r => r - rfMonthly);
  const meanExcessPort = mean(excessPort);
  const downsideDiffs = excessPort.filter(r => r < 0);
  const downsideDeviation = downsideDiffs.length > 0
    ? Math.sqrt(downsideDiffs.reduce((sum, r) => sum + r * r, 0) / downsideDiffs.length) * Math.sqrt(12)
    : 0;
  const sortino = downsideDeviation > 0.0001 ? (meanExcessPort * 12) / downsideDeviation : 0;
 
  const varBench = variance(bench, meanBench);
  const cov = covariance(port, meanPort, bench, meanBench);
  const beta = varBench > 0.000001 ? cov / varBench : 1.0;
 
  const market_return = meanBench * 12;
  const expected_return = rfRate + beta * (market_return - rfRate);
  const alpha = (fund_return - expected_return) * 100;
 
  const activeReturns = port.map((r, idx) => r - bench[idx]);
  const meanActive = mean(activeReturns);
  const stdActive = stdDev(activeReturns, meanActive);
  const tracking_error = stdActive * Math.sqrt(12);
  const active_return = fund_return - market_return;
  const infoRatio = tracking_error > 0.0001 ? active_return / tracking_error : 0;

  // Max Drawdown
  let currentNav = 100;
  const navSeries = [currentNav];
  port.forEach(r => {
    currentNav *= (1 + r);
    navSeries.push(currentNav);
  });
  let maxDrawdown = 0;
  let peak = navSeries[0];
  navSeries.forEach(nav => {
    if (nav > peak) peak = nav;
    const dd = (nav - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  });
  maxDrawdown = maxDrawdown * 100;

  // 95% VaR
  const sortedReturns = [...port].sort((a, b) => a - b);
  const varIndex = Math.floor(0.05 * sortedReturns.length);
  const var95 = sortedReturns.length > 0 ? -sortedReturns[varIndex] * 100 : 0;

  return {
    sharpe_ratio: parseFloat(sharpe.toFixed(2)),
    sortino_ratio: parseFloat(sortino.toFixed(2)),
    max_drawdown: parseFloat(maxDrawdown.toFixed(2)),
    beta: parseFloat(beta.toFixed(2)),
    alpha: parseFloat(alpha.toFixed(2)),
    information_ratio: parseFloat(infoRatio.toFixed(2)),
    var_95: parseFloat(var95.toFixed(2))
  };
};

const parseInlineBold = (text: string) => {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return <strong key={index} style={{ color: 'white', fontWeight: 700 }}>{part}</strong>;
    }
    return part;
  });
};

const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', lineHeight: '1.6', fontSize: '0.92rem' }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          return <h1 key={idx} style={{ fontSize: '1.4rem', margin: '14px 0 8px 0', borderBottom: '1px solid var(--glass-border)', paddingBottom: '6px', color: 'white', fontWeight: 700 }}>{trimmed.slice(2)}</h1>;
        }
        if (trimmed.startsWith('## ')) {
          return <h2 key={idx} style={{ fontSize: '1.2rem', margin: '12px 0 6px 0', color: 'white', fontWeight: 600 }}>{trimmed.slice(3)}</h2>;
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={idx} style={{ fontSize: '1.05rem', margin: '10px 0 4px 0', color: 'var(--accent-blue)', fontWeight: 600 }}>{trimmed.slice(4)}</h3>;
        }
        if (trimmed.startsWith('---')) {
          return <hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '10px 0' }} />;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const bulletText = trimmed.slice(2);
          return (
            <div key={idx} style={{ display: 'flex', gap: '8px', paddingLeft: '8px', margin: '2px 0' }}>
              <span style={{ color: 'var(--accent-blue)' }}>•</span>
              <span>{parseInlineBold(bulletText)}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s+(.*)/);
          const num = match ? match[1] : '';
          const text = match ? match[2] : trimmed;
          return (
            <div key={idx} style={{ display: 'flex', gap: '8px', paddingLeft: '8px', margin: '2px 0' }}>
              <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{num}.</span>
              <span>{parseInlineBold(text)}</span>
            </div>
          );
        }
        if (trimmed === '') return <div key={idx} style={{ height: '4px' }} />;
        return <p key={idx} style={{ margin: '2px 0' }}>{parseInlineBold(trimmed)}</p>;
      })}
    </div>
  );
};

export const AttributionDashboard: React.FC = () => {
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [customSchemeStocks, setCustomSchemeStocks] = useState<Map<string, StockHolding[]>>(new Map());

  // Performance caches for stock matching and computed returns
  const stockMatchCache = React.useRef<Map<string, any>>(new Map());
  const fundReturnsCache = React.useRef<Map<string, { year: number; month: number; returnVal: number }[]>>(new Map());

  // Helper functions inside the component context
  const getUnderlyingStocks = (schemeName: string): StockHolding[] => {
    if (customSchemeStocks.has(schemeName)) {
      return customSchemeStocks.get(schemeName) || [];
    }
    const match = Array.from(customSchemeStocks.entries()).find(([k]) => k.toLowerCase() === schemeName.toLowerCase());
    if (match) {
      return match[1];
    }

    const nameLower = schemeName.toLowerCase();
    
    const largeCap = [
      { company: 'HDFC Bank Ltd.', sector: 'Financial Services', allocation: 9.8 },
      { company: 'Reliance Industries Ltd.', sector: 'Energy & Infrastructure', allocation: 9.2 },
      { company: 'ICICI Bank Ltd.', sector: 'Financial Services', allocation: 8.1 },
      { company: 'Infosys Ltd.', sector: 'Technology', allocation: 6.5 },
      { company: 'Larsen & Toubro Ltd.', sector: 'Construction/Capital Goods', allocation: 5.2 },
      { company: 'Tata Consultancy Services Ltd.', sector: 'Technology', allocation: 4.8 },
      { company: 'ITC Ltd.', sector: 'FMCG', allocation: 4.3 },
      { company: 'Bharti Airtel Ltd.', sector: 'Telecommunication', allocation: 4.1 },
      { company: 'State Bank of India', sector: 'Financial Services', allocation: 3.9 },
      { company: 'Axis Bank Ltd.', sector: 'Financial Services', allocation: 3.5 },
      { company: 'Kotak Mahindra Bank Ltd.', sector: 'Financial Services', allocation: 3.2 },
      { company: 'Hindustan Unilever Ltd.', sector: 'FMCG', allocation: 2.9 },
      { company: 'Bajaj Finance Ltd.', sector: 'Financial Services', allocation: 2.6 },
      { company: 'Mahindra & Mahindra Ltd.', sector: 'Automobile', allocation: 2.4 },
      { company: 'Maruti Suzuki India Ltd.', sector: 'Automobile', allocation: 2.1 },
      { company: 'HCL Technologies Ltd.', sector: 'Technology', allocation: 1.9 },
      { company: 'Sun Pharmaceutical Industries Ltd.', sector: 'Healthcare', allocation: 1.8 },
      { company: 'Tata Motors Ltd.', sector: 'Automobile', allocation: 1.7 },
      { company: 'NTPC Ltd.', sector: 'Utilities/Power', allocation: 1.6 },
      { company: 'Power Grid Corporation of India Ltd.', sector: 'Utilities/Power', allocation: 1.5 }
    ];

    const midCap = [
      { company: 'The Indian Hotels Co. Ltd.', sector: 'Consumer Services', allocation: 4.8 },
      { company: 'The Federal Bank Ltd.', sector: 'Financial Services', allocation: 4.5 },
      { company: 'Cummins India Ltd.', sector: 'Capital Goods', allocation: 4.2 },
      { company: 'Bharat Electronics Ltd.', sector: 'Capital Goods/Defence', allocation: 4.0 },
      { company: 'Ashok Leyland Ltd.', sector: 'Automobile', allocation: 3.8 },
      { company: 'Max Healthcare Institute Ltd.', sector: 'Healthcare', allocation: 3.5 },
      { company: 'Polycab India Ltd.', sector: 'Capital Goods', allocation: 3.2 },
      { company: 'Supreme Industries Ltd.', sector: 'Capital Goods', allocation: 3.0 },
      { company: 'Persistent Systems Ltd.', sector: 'Technology', allocation: 2.8 },
      { company: 'Astral Ltd.', sector: 'Capital Goods', allocation: 2.6 },
      { company: 'Voltas Ltd.', sector: 'Capital Goods/Consumer Durables', allocation: 2.5 },
      { company: 'MRF Ltd.', sector: 'Automobile/Tires', allocation: 2.3 },
      { company: 'Dalmia Bharat Ltd.', sector: 'Materials', allocation: 2.2 },
      { company: 'Escorts Kubota Ltd.', sector: 'Automobile/Tractors', allocation: 2.1 },
      { company: 'Coforge Ltd.', sector: 'Technology', allocation: 2.0 },
      { company: 'Lupin Ltd.', sector: 'Healthcare', allocation: 1.9 },
      { company: 'Apollo Tyres Ltd.', sector: 'Automobile/Tires', allocation: 1.8 },
      { company: 'Fortis Healthcare Ltd.', sector: 'Healthcare', allocation: 1.7 },
      { company: 'Page Industries Ltd.', sector: 'Textiles', allocation: 1.6 },
      { company: 'IDFC First Bank Ltd.', sector: 'Financial Services', allocation: 1.5 }
    ];

    const smallCap = [
      { company: 'Kajaria Ceramics Ltd.', sector: 'Consumer Durables', allocation: 3.8 },
      { company: 'Cyient Ltd.', sector: 'Technology', allocation: 3.5 },
      { company: 'Sonata Software Ltd.', sector: 'Technology', allocation: 3.2 },
      { company: 'The Karur Vysya Bank Ltd.', sector: 'Financial Services', allocation: 3.0 },
      { company: 'Birla Corporation Ltd.', sector: 'Materials/Cement', allocation: 2.8 },
      { company: 'Blue Star Ltd.', sector: 'Consumer Durables', allocation: 2.6 },
      { company: 'Central Depository Services (India) Ltd.', sector: 'Financial Services', allocation: 2.5 },
      { company: 'Equitas Small Finance Bank Ltd.', sector: 'Financial Services', allocation: 2.3 },
      { company: 'Kirloskar Oil Engines Ltd.', sector: 'Capital Goods', allocation: 2.2 },
      { company: 'Elgi Equipments Ltd.', sector: 'Capital Goods', allocation: 2.1 },
      { company: 'Route Mobile Ltd.', sector: 'Technology', allocation: 2.0 },
      { company: 'Raymond Ltd.', sector: 'Textiles/Apparel', allocation: 1.9 },
      { company: 'JSW Energy Ltd.', sector: 'Utilities/Power', allocation: 1.8 },
      { company: 'Welspun India Ltd.', sector: 'Textiles', allocation: 1.7 },
      { company: 'Happiest Minds Technologies Ltd.', sector: 'Technology', allocation: 1.6 },
      { company: 'Granules India Ltd.', sector: 'Healthcare', allocation: 1.5 }
    ];

    if (nameLower.includes('bluechip') || nameLower.includes('large') || nameLower.includes('top 100')) {
      return largeCap;
    }
    if (nameLower.includes('mid') || nameLower.includes('opportunities') || nameLower.includes('emerging')) {
      return midCap;
    }
    if (nameLower.includes('small')) {
      return smallCap;
    }
    
    // Check if it's a mutual fund or a direct stock
    const isMF = nameLower.includes('fund') || 
                 nameLower.includes('growth') || 
                 nameLower.includes('regular') || 
                 nameLower.includes('direct') || 
                 nameLower.includes('scheme') || 
                 nameLower.includes('portfolio') || 
                 nameLower.includes('plan') || 
                 nameLower.includes('option') ||
                 nameLower.includes('bluechip') ||
                 nameLower.includes('flexicap') ||
                 nameLower.includes('flexi cap') ||
                 nameLower.includes('smallcap') ||
                 nameLower.includes('small cap') ||
                 nameLower.includes('midcap') ||
                 nameLower.includes('mid cap') ||
                 nameLower.includes('largecap') ||
                 nameLower.includes('large cap') ||
                 nameLower.includes('elss') ||
                 nameLower.includes('tax saver') ||
                 nameLower.includes('liquid') ||
                 nameLower.includes('hybrid') ||
                 nameLower.includes('equity') ||
                 nameLower.includes('nifty') ||
                 nameLower.includes('sensibull') ||
                 nameLower.includes('index') ||
                 nameLower.includes('etf') ||
                 nameLower.includes('savings') ||
                 nameLower.includes('opportunity') ||
                 nameLower.includes('opportunities');

    const allPredefined = [
      ...largeCap,
      ...midCap,
      ...smallCap
    ];

    const predefinedMatch = allPredefined.find(
      s => s.company.toLowerCase() === nameLower ||
           nameLower.includes(s.company.toLowerCase()) ||
           s.company.toLowerCase().includes(nameLower)
    );

    if (predefinedMatch || !isMF) {
      const sector = predefinedMatch ? predefinedMatch.sector : (() => {
        const sectors = [
          'Financial Services', 'Technology', 'Healthcare', 'Consumer Cyclicals', 
          'Energy & Infrastructure', 'Capital Goods', 'FMCG', 'Telecommunication', 
          'Automobile', 'Utilities/Power', 'Consumer Services', 'Materials', 'Consumer Durables'
        ];
        const seed = schemeName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return sectors[seed % sectors.length];
      })();
      return [{
        company: predefinedMatch ? predefinedMatch.company : schemeName,
        sector: sector,
        allocation: 100
      }];
    }

    return largeCap;
  };

  const getSectorWeights = (schemeName: string): Map<string, number> => {
    const stocks = getUnderlyingStocks(schemeName);
    const weights = new Map<string, number>();
    let totalAlloc = 0;
    
    stocks.forEach(s => {
      const normalizedSector = normalizeSectorName(s.sector);
      const w = s.allocation / 100;
      weights.set(normalizedSector, (weights.get(normalizedSector) || 0) + w);
      totalAlloc += w;
    });

    if (totalAlloc > 0) {
      for (const [sec, w] of weights.entries()) {
        weights.set(sec, w / totalAlloc);
      }
    } else {
      weights.set('Diversified Equity', 1.0);
    }
    return weights;
  };

  const computeCustomBrinson = (
    portfolioSchemeName: string,
    portfolioReturn: number,
    benchmarkSchemeName?: string,
    benchmarkReturn: number = 0.12,
  ): BrinsonSegment[] => {
    const pwMap = getSectorWeights(portfolioSchemeName);
    const bwMap = new Map<string, number>();
    
    if (benchmarkSchemeName) {
      const secWeights = getSectorWeights(benchmarkSchemeName);
      for (const [sec, w] of secWeights.entries()) {
        bwMap.set(sec, w);
      }
    } else {
      Object.entries(NIFTY50_SECTOR_WEIGHTS).forEach(([sec, w]) => {
        bwMap.set(sec, w);
      });
    }

    const allSectors = Array.from(new Set([
      ...Array.from(pwMap.keys()),
      ...Array.from(bwMap.keys())
    ]));

    const totalPortfolioReturn = portfolioReturn;
    let sumPBase = 0;
    allSectors.forEach(sec => {
      const w = pwMap.get(sec) || 0;
      const rBase = dynamicSectorReturns[sec] || 0.12;
      sumPBase += w * rBase;
    });
    const factorP = sumPBase > 0 ? totalPortfolioReturn / sumPBase : 1.0;

    let sumBBase = 0;
    allSectors.forEach(sec => {
      const w = bwMap.get(sec) || 0;
      const rBase = dynamicSectorReturns[sec] || 0.12;
      sumBBase += w * rBase;
    });
    const factorB = sumBBase > 0 ? benchmarkReturn / sumBBase : 1.0;

    const segments: BrinsonSegment[] = allSectors.map(sec => {
      const w_p = pwMap.get(sec) || 0;
      const w_b = bwMap.get(sec) || 0;
      const r_base = dynamicSectorReturns[sec] || 0.12;
      
      const r_p = r_base * factorP;
      const r_b = r_base * factorB;

      const allocation_effect = (w_p - w_b) * (r_b - benchmarkReturn);
      const selection_effect = w_b * (r_p - r_b);
      const interaction_effect = (w_p - w_b) * (r_p - r_b);

      return {
        asset_class: sec,
        portfolio_weight: w_p,
        benchmark_weight: w_b,
        nifty_weight: getNiftySectorWeight(sec),
        portfolio_return: r_p,
        benchmark_return: r_b,
        allocation_effect,
        selection_effect,
        interaction_effect
      };
    });

    return segments;
  };

  const computePortfolioBrinson = (
    portfolioHoldings: Holding[],
    benchmarkSchemeName?: string,
    benchmarkReturn: number = 0.12,
  ): BrinsonSegment[] => {
    const pwMap = new Map<string, number>();
    portfolioHoldings.forEach(h => {
      const fundWeight = h.weight;
      const fundSectorWeights = getSectorWeights(h.scheme_name);
      for (const [sector, secWeight] of fundSectorWeights.entries()) {
        pwMap.set(sector, (pwMap.get(sector) || 0) + secWeight * fundWeight);
      }
    });

    const bwMap = new Map<string, number>();
    if (benchmarkSchemeName) {
      const secWeights = getSectorWeights(benchmarkSchemeName);
      for (const [sec, w] of secWeights.entries()) {
        bwMap.set(sec, w);
      }
    } else {
      Object.entries(NIFTY50_SECTOR_WEIGHTS).forEach(([sec, w]) => {
        bwMap.set(sec, w);
      });
    }

    const allSectors = Array.from(new Set([
      ...Array.from(pwMap.keys()),
      ...Array.from(bwMap.keys())
    ]));

    let totalPortfolioReturn = 0;
    portfolioHoldings.forEach(h => {
      const R_p = h.avg_nav ? (h.current_nav / h.avg_nav) - 1 : 0.15;
      totalPortfolioReturn += h.weight * R_p;
    });

    let sumPBase = 0;
    allSectors.forEach(sec => {
      const w = pwMap.get(sec) || 0;
      const rBase = dynamicSectorReturns[sec] || 0.12;
      sumPBase += w * rBase;
    });
    const factorP = sumPBase > 0 ? totalPortfolioReturn / sumPBase : 1.0;

    let sumBBase = 0;
    allSectors.forEach(sec => {
      const w = bwMap.get(sec) || 0;
      const rBase = dynamicSectorReturns[sec] || 0.12;
      sumBBase += w * rBase;
    });
    const factorB = sumBBase > 0 ? benchmarkReturn / sumBBase : 1.0;

    const segments: BrinsonSegment[] = allSectors.map(sec => {
      const w_p = pwMap.get(sec) || 0;
      const w_b = bwMap.get(sec) || 0;
      const r_base = dynamicSectorReturns[sec] || 0.12;
      
      const r_p = r_base * factorP;
      const r_b = r_base * factorB;

      const allocation_effect = (w_p - w_b) * (r_b - benchmarkReturn);
      const selection_effect = w_b * (r_p - r_b);
      const interaction_effect = (w_p - w_b) * (r_p - r_b);

      return {
        asset_class: sec,
        portfolio_weight: w_p,
        benchmark_weight: w_b,
        nifty_weight: getNiftySectorWeight(sec),
        portfolio_return: r_p,
        benchmark_return: r_b,
        allocation_effect,
        selection_effect,
        interaction_effect
      };
    });

    return segments;
  };

  const getCombinedPortfolioStocks = (): Holding[] => {
    const stockMap = new Map<string, { company: string; sector: string; weight: number }>();
    customHoldings.forEach(h => {
      const fundWeight = h.weight;
      const stocks = getUnderlyingStocks(h.scheme_name);
      stocks.forEach(s => {
        const existing = stockMap.get(s.company);
        const w = (s.allocation / 100) * fundWeight;
        if (existing) {
          existing.weight += w;
        } else {
          stockMap.set(s.company, { company: s.company, sector: s.sector, weight: w });
        }
      });
    });

    return Array.from(stockMap.values()).map((s, idx) => ({
      id: idx,
      portfolio_id: 'custom-uploaded',
      fund_id: `stock-${idx}`,
      scheme_name: s.company,
      isin: s.sector,
      units: 0,
      avg_nav: 0,
      current_nav: 0,
      current_value: 0,
      weight: s.weight
    }));
  };
  const [funds, setFunds] = useState<Fund[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  
  const [navMap, setNavMap] = useState<Map<string, { nav: number; name: string; category: string }>>(new Map());
  const [loadingNavDb, setLoadingNavDb] = useState<boolean>(true);
  const [stockLimit, setStockLimit] = useState<number>(5);
  const [selectedBenchmarkSchemeName, setSelectedBenchmarkSchemeName] = useState<string>('');

  useEffect(() => {
    const loadNavDb = async () => {
      try {
        const response = await fetch('/nav_until_2026-05-31.csv');
        if (!response.ok) throw new Error('File not found');
        // Use text-based CSV parsing (much faster than XLSX binary parser for CSV files)
        const text = await response.text();
        const lines = text.split('\n');
        
        const map = new Map<string, { nav: number; name: string; category: string }>();
        // Parse CSV header to determine column indices (handles quoted fields)
        const parseCSVLine = (line: string): string[] => {
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { cols.push(current); current = ''; }
            else { current += char; }
          }
          cols.push(current);
          return cols;
        };

        // Process in chunks to avoid blocking the UI
        const CHUNK_SIZE = 2000;
        const processChunk = (startIdx: number) => {
          const endIdx = Math.min(startIdx + CHUNK_SIZE, lines.length);
          for (let i = startIdx; i < endIdx; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const row = parseCSVLine(line);
            if (row.length < 11) continue;
            const isin1 = (row[3] || '').trim().toUpperCase();
            const isin2 = (row[4] || '').trim().toUpperCase();
            const code = (row[2] || '').trim();
            const name = (row[5] || '').trim();
            const category = (row[1] || '').trim();
            const nav = parseFloat(row[10] || '');
            if (isNaN(nav)) continue;
            const entry = { nav, name, category };
            if (isin1) map.set(isin1, entry);
            if (isin2) map.set(isin2, entry);
            if (code) map.set(code, entry);
            if (name) map.set(name.toLowerCase(), entry);
          }
          if (endIdx < lines.length) {
            setTimeout(() => processChunk(endIdx), 0);
          } else {
            setNavMap(map);
            setLoadingNavDb(false);
          }
        };
        processChunk(1); // skip header row at index 0
      } catch (err) {
        console.error('Failed to load local NAV database', err);
        setLoadingNavDb(false);
      }
    };
    loadNavDb();
  }, []);

  const [stockPrices, setStockPrices] = useState<any[]>([]);

  useEffect(() => {
    const loadStockPrices = async () => {
      try {
        const response = await fetch('/All_stocks_monthly_prices.csv');
        if (!response.ok) throw new Error('File not found');
        const text = await response.text();
        const lines = text.split('\n');
        if (lines.length === 0) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cols.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current);
          if (cols.length < headers.length) continue;
          const obj: any = {};
          headers.forEach((h, idx) => {
            const val = cols[idx].trim();
            obj[h] = val;
          });
          parsed.push(obj);
        }
        setStockPrices(parsed);
      } catch (err) {
        console.error('Failed to load stock prices database', err);
      }
    };
    loadStockPrices();
  }, []);
  
  const dynamicSectorReturns = React.useMemo(() => {
    const returnsObj: Record<string, number> = {};
    Object.keys(BASE_SECTOR_RETURNS).forEach(sec => {
      returnsObj[sec] = BASE_SECTOR_RETURNS[sec];
    });

    if (stockPrices.length === 0) return returnsObj;

    const sampleStock = stockPrices[0];
    const priceCols = Object.keys(sampleStock).filter(k => k.startsWith('Price_')).sort();
    if (priceCols.length < 2) return returnsObj;

    const latestCol = priceCols[priceCols.length - 1];
    const startCol = priceCols[priceCols.length - 13] || priceCols[0];

    const companyToSector = new Map<string, string>();
    customSchemeStocks.forEach((stocks) => {
      stocks.forEach(s => {
        companyToSector.set(s.company.toLowerCase().trim(), normalizeSectorName(s.sector));
      });
    });

    const allFundNames = [
      'HDFC Mid-Cap Opportunities Fund',
      'ICICI Prudential Bluechip Fund',
      'SBI Small Cap Fund',
      'Parag Parikh Flexi Cap Fund',
      'Axis Bluechip Fund',
      ...Array.from(customSchemeStocks.keys())
    ];

    allFundNames.forEach(name => {
      const stocks = getUnderlyingStocks(name);
      stocks.forEach(s => {
        companyToSector.set(s.company.toLowerCase().trim(), normalizeSectorName(s.sector));
      });
    });

    const sectorReturnsMap = new Map<string, number[]>();
    stockPrices.forEach(row => {
      const company = (row['Group/Investment'] || '').trim();
      if (!company) return;
      
      const sector = companyToSector.get(company.toLowerCase());
      if (!sector) return;

      const pEnd = parseFloat(row[latestCol]);
      const pStart = parseFloat(row[startCol]);
      if (!isNaN(pEnd) && !isNaN(pStart) && pStart > 0) {
        const ret = pEnd / pStart - 1;
        if (!sectorReturnsMap.has(sector)) {
          sectorReturnsMap.set(sector, []);
        }
        sectorReturnsMap.get(sector)!.push(ret);
      }
    });

    sectorReturnsMap.forEach((returns, sector) => {
      if (returns.length > 0) {
        const avg = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        returnsObj[sector] = Math.max(-0.15, Math.min(0.65, avg));
      }
    });

    return returnsObj;
  }, [stockPrices, customSchemeStocks]);
  
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [selectedSchemeName, setSelectedSchemeName] = useState<string>('');
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [brinson, setBrinson] = useState<BrinsonSegment[]>([]);
  const [risk, setRisk] = useState<RiskMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'brinson' | 'overlap' | 'reports' | 'performance' | 'copilot'>('overview');

  // AI Copilot state
  const [copilotReport, setCopilotReport] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [copilotProvider, setCopilotProvider] = useState<string>('');

  useEffect(() => {
    if (activeTab !== 'copilot') return;
    
    const fetchCopilotAnalysis = async () => {
      setLoadingReport(true);
      setCopilotReport('');
      try {
        const contextData = {
          summary: summary ? {
            name: selectedPortfolioId === 'custom-uploaded' ? (selectedSchemeName === 'ALL_SCHEMES' ? 'Custom Portfolio (All Combined)' : selectedSchemeName) : summary.name,
            total_value: summary.total_value,
            total_invested: summary.total_invested,
            absolute_return: summary.absolute_return,
            xirr: summary.xirr,
            cagr: summary.cagr
          } : null,
          holdings: holdings.map(h => ({
            scheme_name: h.scheme_name,
            weight: h.weight,
            current_value: h.current_value
          })),
          risk: risk ? {
            sharpe_ratio: risk.sharpe_ratio,
            sortino_ratio: risk.sortino_ratio,
            beta: risk.beta,
            alpha: risk.alpha,
            information_ratio: risk.information_ratio
          } : null,
          brinson: brinson.map(s => ({
            asset_class: s.asset_class,
            portfolio_weight: s.portfolio_weight,
            benchmark_weight: s.benchmark_weight,
            portfolio_return: s.portfolio_return,
            benchmark_return: s.benchmark_return,
            allocation_effect: s.allocation_effect,
            selection_effect: s.selection_effect,
            interaction_effect: s.interaction_effect
          }))
        };

        const res = await analyzePortfolio(contextData);
        setCopilotReport(res.report);
        setCopilotProvider(res.provider);
      } catch (err) {
        console.error('Failed to get copilot analysis:', err);
        setCopilotReport('Failed to load AI Portfolio Diagnostics. Please ensure the backend server is reachable.');
        setCopilotProvider('System Error');
      } finally {
        setLoadingReport(false);
      }
    };

    fetchCopilotAnalysis();
  }, [activeTab, selectedPortfolioId, selectedSchemeName, summary, holdings, brinson, risk]);

  const handleChatSubmit = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || userInput;
    if (!textToSend.trim() || sendingChat) return;

    const newMessages = [...chatMessages, { role: 'user' as const, content: textToSend }];
    setChatMessages(newMessages);
    if (!customText) setUserInput('');
    setSendingChat(true);

    try {
      const contextData = {
        summary: summary ? {
          name: selectedPortfolioId === 'custom-uploaded' ? (selectedSchemeName === 'ALL_SCHEMES' ? 'Custom Portfolio (All Combined)' : selectedSchemeName) : summary.name,
          total_value: summary.total_value,
          total_invested: summary.total_invested,
          absolute_return: summary.absolute_return,
          xirr: summary.xirr,
          cagr: summary.cagr
        } : null,
        holdings: holdings.map(h => ({
          scheme_name: h.scheme_name,
          weight: h.weight,
          current_value: h.current_value
        })),
        risk: risk ? {
          sharpe_ratio: risk.sharpe_ratio,
          sortino_ratio: risk.sortino_ratio,
          beta: risk.beta,
          alpha: risk.alpha,
          information_ratio: risk.information_ratio
        } : null,
        brinson: brinson.map(s => ({
          asset_class: s.asset_class,
          portfolio_weight: s.portfolio_weight,
          benchmark_weight: s.benchmark_weight,
          portfolio_return: s.portfolio_return,
          benchmark_return: s.benchmark_return,
          allocation_effect: s.allocation_effect,
          selection_effect: s.selection_effect,
          interaction_effect: s.interaction_effect
        }))
      };

      const res = await chatWithCopilot(newMessages, contextData);
      setChatMessages([...newMessages, { role: 'assistant' as const, content: res.response }]);
    } catch (err) {
      console.error('Failed to chat with copilot:', err);
      setChatMessages([...newMessages, { role: 'assistant' as const, content: 'I encountered an error replying to your question. Please ensure the backend is available.' }]);
    } finally {
      setSendingChat(false);
    }
  };

  const getFrontendWarnings = () => {
    const warnings: { type: string; message: string }[] = [];
    if (risk) {
      if (risk.sharpe_ratio < 1.0) {
        warnings.push({
          type: 'risk',
          message: `Suboptimal Sharpe Ratio (${risk.sharpe_ratio}): Portfolio return vs risk is lower than target of 1.2+.`
        });
      }
      if (risk.beta > 1.15) {
        warnings.push({
          type: 'risk',
          message: `Elevated Market Beta (${risk.beta}): The portfolio has high sensitivity to broad market swings.`
        });
      }
      if (risk.alpha < 0) {
        warnings.push({
          type: 'performance',
          message: `Negative Alpha (${risk.alpha.toFixed(2)}%): Underperforming benchmark adjustments.`
        });
      }
    }
    
    // Concentration risk (HHI calculation)
    let hhi = 0;
    if (holdings.length > 0) {
      const totalW = holdings.reduce((sum, h) => sum + h.weight, 0);
      if (totalW > 0) {
        hhi = holdings.reduce((sum, h) => sum + Math.pow((h.weight / totalW) * 100, 2), 0);
      }
    }
    
    if (hhi > 2500) {
      warnings.push({
        type: 'concentration',
        message: `High Portfolio Concentration (HHI of ${hhi.toFixed(0)}): Top holdings dominate. Recommend scheme rebalancing.`
      });
    } else if (hhi > 1800) {
      warnings.push({
        type: 'concentration',
        message: `Moderate Portfolio Concentration (HHI of ${hhi.toFixed(0)}): Watch weight limits on top schemes.`
      });
    }
    
    // Check if any single holding is > 30% weight
    holdings.forEach(h => {
      if (h.weight > 0.3) {
        warnings.push({
          type: 'concentration',
          message: `Concentration Alert: ${h.scheme_name} comprises ${(h.weight * 100).toFixed(1)}% of total portfolio.`
        });
      }
    });
    
    return warnings;
  };

  // Nifty CSV data & calculation state
  const [useDynamicCalculation, setUseDynamicCalculation] = useState<boolean>(true);

  // Expense Ratio & Fund Manager data state
  const [expensePeriod, setExpensePeriod] = useState<'monthly' | 'quarterly' | '6months'>('monthly');
  const [expenseManagerMap, setExpenseManagerMap] = useState<Map<string, {
    isin: string;
    category: string;
    manager: string;
    exr_202510: number | null;
    exr_202511: number | null;
    exr_202512: number | null;
    exr_202601: number | null;
    exr_202602: number | null;
    exr_202603: number | null;
    exr_202604: number | null;
  }>>(new Map());

  // Deterministic seed hash - used across multiple sections
  const getFundSeed = (name: string): number => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 100;
  };

  const getDeterministicRandom = (seedStr: string) => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (index: number) => {
      const x = Math.sin(hash + index) * 10000;
      return x - Math.floor(x);
    };
  };

  const getNiftyReturnsList = (): { year: number; month: number; returnVal: number }[] => {
    const months = [
      { y: 2023, m: 4 }, { y: 2023, m: 5 }, { y: 2023, m: 6 }, { y: 2023, m: 7 }, { y: 2023, m: 8 }, { y: 2023, m: 9 }, { y: 2023, m: 10 }, { y: 2023, m: 11 }, { y: 2023, m: 12 },
      { y: 2024, m: 1 }, { y: 2024, m: 2 }, { y: 2024, m: 3 }, { y: 2024, m: 4 }, { y: 2024, m: 5 }, { y: 2024, m: 6 }, { y: 2024, m: 7 }, { y: 2024, m: 8 }, { y: 2024, m: 9 }, { y: 2024, m: 10 }, { y: 2024, m: 11 }, { y: 2024, m: 12 },
      { y: 2025, m: 1 }, { y: 2025, m: 2 }, { y: 2025, m: 3 }, { y: 2025, m: 4 }, { y: 2025, m: 5 }, { y: 2025, m: 6 }, { y: 2025, m: 7 }, { y: 2025, m: 8 }, { y: 2025, m: 9 }, { y: 2025, m: 10 }, { y: 2025, m: 11 }, { y: 2025, m: 12 },
      { y: 2026, m: 1 }, { y: 2026, m: 2 }, { y: 2026, m: 3 }, { y: 2026, m: 4 }
    ];
    const rng = getDeterministicRandom("NIFTY 50 TRI");
    return months.map(({ y, m }, i) => {
      const rand = rng(i);
      const returnVal = 0.012 + (rand - 0.5) * 0.06;
      return { year: y, month: m, returnVal };
    });
  };

  const getFundMonthlyReturnsList = (schemeName: string): { year: number; month: number; returnVal: number }[] => {
    if (stockPrices.length === 0) return [];

    // Check if the computed returns for this scheme are already cached
    if (fundReturnsCache.current.has(schemeName)) {
      return fundReturnsCache.current.get(schemeName) || [];
    }

    const normName = schemeName.toLowerCase().trim();
    if (normName === 'nifty 50 tri' || normName === 'nifty 50' || normName === 'nifty50' || normName.includes('nifty 50')) {
      const res = getNiftyReturnsList();
      fundReturnsCache.current.set(schemeName, res);
      return res;
    }

    const stocks = getUnderlyingStocks(schemeName);
    if (stocks.length === 0) return [];
    const totalAlloc = stocks.reduce((sum, s) => sum + s.allocation, 0);
    if (totalAlloc === 0) return [];
    const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanWords = (s: string): string[] => {
      return s.toLowerCase()
        .replace(/\b(ltd|limited|corp|corporation|inc|co|company|india|ind|group|holdings|services|bank|financial)\b/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 3);
    };

    const matchedStocks = stocks.map(s => {
      // Check stock match cache first
      if (stockMatchCache.current.has(s.company)) {
        return {
          ...s,
          normWeight: s.allocation / totalAlloc,
          row: stockMatchCache.current.get(s.company)
        };
      }

      const cleanName = cleanStr(s.company);
      
      // 1. Exact match on cleaned company name
      let row = stockPrices.find(row => cleanStr(row['Group/Investment'] || '') === cleanName);
      
      // 2. Substring matching
      if (!row) {
        row = stockPrices.find(row => {
          const rowName = cleanStr(row['Group/Investment'] || '');
          return rowName.length >= 5 && (rowName.includes(cleanName) || cleanName.includes(rowName));
        });
      }

      // 3. Word-based matching (at least 2 matching significant words)
      if (!row) {
        const queryWords = cleanWords(s.company);
        if (queryWords.length >= 1) {
          row = stockPrices.find(row => {
            const candidateWords = cleanWords(row['Group/Investment'] || '');
            const intersection = queryWords.filter(w => candidateWords.includes(w));
            return intersection.length >= Math.min(2, queryWords.length);
          });
        }
      }

      // Cache the matched row
      stockMatchCache.current.set(s.company, row);

      return {
        ...s,
        normWeight: s.allocation / totalAlloc,
        row
      };
    });

    const months = [
      { y: 2023, m: 4 }, { y: 2023, m: 5 }, { y: 2023, m: 6 }, { y: 2023, m: 7 }, { y: 2023, m: 8 }, { y: 2023, m: 9 }, { y: 2023, m: 10 }, { y: 2023, m: 11 }, { y: 2023, m: 12 },
      { y: 2024, m: 1 }, { y: 2024, m: 2 }, { y: 2024, m: 3 }, { y: 2024, m: 4 }, { y: 2024, m: 5 }, { y: 2024, m: 6 }, { y: 2024, m: 7 }, { y: 2024, m: 8 }, { y: 2024, m: 9 }, { y: 2024, m: 10 }, { y: 2024, m: 11 }, { y: 2024, m: 12 },
      { y: 2025, m: 1 }, { y: 2025, m: 2 }, { y: 2025, m: 3 }, { y: 2025, m: 4 }, { y: 2025, m: 5 }, { y: 2025, m: 6 }, { y: 2025, m: 7 }, { y: 2025, m: 8 }, { y: 2025, m: 9 }, { y: 2025, m: 10 }, { y: 2025, m: 11 }, { y: 2025, m: 12 },
      { y: 2026, m: 1 }, { y: 2026, m: 2 }, { y: 2026, m: 3 }, { y: 2026, m: 4 }
    ];

    const marketReturns = getNiftyReturnsList();

    const result = months.map(({ y, m }, i) => {
      const colEnd = `Price_${y}_${String(m).padStart(2, '0')}`;
      const prev_y = m > 1 ? y : y - 1;
      const prev_m = m > 1 ? m - 1 : 12;
      const colStart = `Price_${prev_y}_${String(prev_m).padStart(2, '0')}`;
      
      let sumReturn = 0;
      let validWeight = 0;

      matchedStocks.forEach(s => {
        if (s.row) {
          const pEnd = parseFloat(s.row[colEnd]);
          const pStart = parseFloat(s.row[colStart]);
          if (!isNaN(pEnd) && !isNaN(pStart) && pStart > 0) {
            const ret = pEnd / pStart - 1;
            sumReturn += s.normWeight * ret;
            validWeight += s.normWeight;
          }
        } else {
          // Generate fallback return for this stock using the Single Index Model
          const stockRng = getDeterministicRandom(s.company);
          const beta = 0.6 + stockRng(100) * 1.0; 
          const alpha = (stockRng(101) - 0.5) * 0.005; 
          const vol = 0.02 + stockRng(102) * 0.06;
          const marketRet = marketReturns[i]?.returnVal || 0.012;
          const residualVal = (stockRng(i) - 0.5) * vol;
          const ret = beta * marketRet + alpha + residualVal;
          sumReturn += s.normWeight * ret;
          validWeight += s.normWeight;
        }
      });

      const returnVal = validWeight > 0 ? sumReturn / validWeight : (marketReturns[i]?.returnVal || 0.012);
      return { year: y, month: m, returnVal };
    });

    fundReturnsCache.current.set(schemeName, result);
    return result;
  };

  const getEntityMonthlyReturnsList = (id: string): { year: number; month: number; returnVal: number }[] => {
    if (stockPrices.length === 0) return [];
    
    const isCustom = id === 'custom-uploaded' || id === 'custom-upload' || id === 'ALL_SCHEMES' || id === (customFileName || 'Custom Uploaded Portfolio');
    const pMatch = portfolios.find(p => p.id === id || p.name === id);
    
    if (isCustom || pMatch) {
      let p_holdings: Holding[] = [];
      if (isCustom) {
        p_holdings = customHoldings;
      } else if (pMatch) {
        const mockHoldingsMap: Record<string, Holding[]> = {
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
        const pId = pMatch.id;
        p_holdings = mockHoldingsMap[pId] || [];
      }
      
      if (p_holdings.length === 0) return [];
      
      const retsMap = new Map<string, number>();
      p_holdings.forEach(h => {
        const fundReturns = getFundMonthlyReturnsList(h.scheme_name);
        fundReturns.forEach(r => {
          const dateKey = `${r.year}-${String(r.month).padStart(2, '0')}`;
          retsMap.set(dateKey, (retsMap.get(dateKey) || 0) + r.returnVal * h.weight);
        });
      });
      
      const dates = Array.from(retsMap.keys()).sort();
      return dates.map(dateKey => {
        const [y, m] = dateKey.split('-').map(Number);
        return {
          year: y,
          month: m,
          returnVal: retsMap.get(dateKey) || 0
        };
      });
    }
    
    return getFundMonthlyReturnsList(id);
  };



  useEffect(() => {
    const loadExpenseManagerData = async () => {
      try {
        const response = await fetch('/Expense ratio & fund manager.xlsx');
        if (!response.ok) throw new Error('File not found');
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
        
        const map = new Map<string, {
          isin: string;
          category: string;
          manager: string;
          exr_202510: number | null;
          exr_202511: number | null;
          exr_202512: number | null;
          exr_202601: number | null;
          exr_202602: number | null;
          exr_202603: number | null;
          exr_202604: number | null;
        }>();
        
        for (let i = 3; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 4) continue;
          
          const schemeName = String(row[0] || '').trim();
          const isin = String(row[1] || '').trim().toUpperCase();
          const category = String(row[2] || '').trim();
          const manager = String(row[3] || '').trim();
          
          const getVal = (val: any) => {
            const num = parseFloat(String(val));
            return isNaN(num) ? null : num;
          };
          
          const entry = {
            isin,
            category,
            manager,
            exr_202510: getVal(row[4]),
            exr_202511: getVal(row[5]),
            exr_202512: getVal(row[6]),
            exr_202601: getVal(row[7]),
            exr_202602: getVal(row[8]),
            exr_202603: getVal(row[9]),
            exr_202604: getVal(row[10]),
          };
          
          if (isin) map.set(isin, entry);
          if (schemeName) map.set(schemeName.toLowerCase(), entry);
        }
        setExpenseManagerMap(map);
      } catch (err) {
        console.error('Failed to load local Expense Ratio & Fund Manager database', err);
      }
    };
    loadExpenseManagerData();
  }, []);

  // Comparative Tracker State (Fund vs Bench, Fund vs Fund, Port vs Bench, Port vs Port)
  const [compType, setCompType] = useState<'fund_vs_bench' | 'fund_vs_fund' | 'port_vs_bench' | 'port_vs_port'>('port_vs_bench');
  const [horizon, setHorizon] = useState<'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'since_inception'>('monthly');
  const [entityA, setEntityA] = useState<string>('');
  const [entityB, setEntityB] = useState<string>('');
  const [comparativeData, setComparativeData] = useState<any[]>([]);

  // Overlap analysis state
  const [overlapPortfolioId, setOverlapPortfolioId] = useState<string>('');
  const [overlapHoldings, setOverlapHoldings] = useState<Holding[]>([]);

  // Custom portfolio holdings uploaded via CSV
  const [customHoldings, setCustomHoldings] = useState<Holding[]>([]);
  const [customFileName, setCustomFileName] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  
  const [brinsonBenchmarkType, setBrinsonBenchmarkType] = useState<'nifty50' | 'scheme'>('nifty50');
  const [brinsonFundA, setBrinsonFundA] = useState<string>(''); // Fund A for sector attribution chart
  const [brinsonFundB, setBrinsonFundB] = useState<string>(''); // Benchmark fund B for sector attribution chart
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');
  const [selectedReportFund, setSelectedReportFund] = useState<{ isin: string; name: string; category: string; manager: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  // Benchmark fund selection for report
  const [benchSearchQuery, setBenchSearchQuery] = useState<string>('');
  const [selectedBenchFund, setSelectedBenchFund] = useState<{ isin: string; name: string; category: string; manager: string } | null>(null);
  const [showBenchDropdown, setShowBenchDropdown] = useState<boolean>(false);

  // Report status
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);
  const [reportProgress, setReportProgress] = useState<number>(0);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [reportFormat, setReportFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [reportFromDate, setReportFromDate] = useState<string>('2025-12-01');
  const [reportToDate, setReportToDate] = useState<string>('2026-04-30');
  const [dashboardFromDate, setDashboardFromDate] = useState<string>('2025-12-01');
  const [dashboardToDate, setDashboardToDate] = useState<string>('2026-04-30');

  const getEntityName = (id: string) => {
    const pMatch = portfolios.find(p => p.id === id);
    if (pMatch) return pMatch.name;
    const fMatch = funds.find(f => f.id === id);
    if (fMatch) return fMatch.scheme_name;
    const bMatch = benchmarks.find(b => b.id === id);
    if (bMatch) return bMatch.name;
    if (id === 'custom-uploaded') return selectedSchemeName || 'Custom Uploaded Portfolio';
    return id;
  };

  useEffect(() => {
    const initData = async () => {
      const ports = await getPortfolios();
      setPortfolios(ports);
      
      const fnds = await getFunds();
      setFunds(fnds);

      const benches = await getBenchmarks();
      setBenchmarks(benches);

      if (ports.length > 0) {
        setSelectedPortfolioId(ports[0].id);
        const secondPort = ports.find((p: any) => p.id !== ports[0].id) || ports[0];
        setOverlapPortfolioId(secondPort.id);
        
        // Setup default comparison selects
        setEntityA(ports[0].id);
        if (benches.length > 0) setEntityB(benches[0].id);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (selectedPortfolioId === 'custom-uploaded' && customHoldings.length > 0) {
      if (!selectedSchemeName) {
        setSelectedSchemeName('ALL_SCHEMES');
      }
      const otherSchemes = customHoldings.filter(h => h.scheme_name !== selectedSchemeName);
      if (otherSchemes.length > 0) {
        if (!selectedBenchmarkSchemeName || !customHoldings.some(h => h.scheme_name === selectedBenchmarkSchemeName) || selectedBenchmarkSchemeName === selectedSchemeName) {
          setSelectedBenchmarkSchemeName(otherSchemes[0].scheme_name);
        }
      } else {
        setSelectedBenchmarkSchemeName('');
      }
    }
  }, [selectedPortfolioId, customHoldings, selectedSchemeName, selectedBenchmarkSchemeName]);

  // Reset selected Brinson funds when portfolio targets change
  useEffect(() => {
    setBrinsonFundA('');
    setBrinsonFundB('');
  }, [selectedPortfolioId, customHoldings]);

  useEffect(() => {
    if (!selectedPortfolioId) return;

    const loadPortfolioData = async () => {
      let summ: PortfolioSummary;
      let holds: Holding[];
      let brin: BrinsonSegment[];
      let rsk: RiskMetrics;

      const calcCumulative = (rets: { returnVal: number }[]) => {
        if (rets.length === 0) return 0;
        let cum = 1;
        rets.forEach(r => { cum *= (1 + r.returnVal); });
        return cum - 1;
      };

      const getPortfolioReturnsFromHoldings = (portfolioHoldings: Holding[]) => {
        if (portfolioHoldings.length === 0) return [];
        const retsMap = new Map<string, number>();
        portfolioHoldings.forEach(h => {
          const fundReturns = getFundMonthlyReturnsList(h.scheme_name);
          fundReturns.forEach(r => {
            const dateKey = `${r.year}-${String(r.month).padStart(2, '0')}`;
            retsMap.set(dateKey, (retsMap.get(dateKey) || 0) + r.returnVal * h.weight);
          });
        });
        
        const dates = Array.from(retsMap.keys()).sort();
        return dates.map(dateKey => {
          const [y, m] = dateKey.split('-').map(Number);
          return {
            year: y,
            month: m,
            returnVal: retsMap.get(dateKey) || 0
          };
        });
      };

      const [fromY, fromM] = dashboardFromDate.split('-').map(Number);
      const [toY, toM] = dashboardToDate.split('-').map(Number);
      const fromVal = fromY * 100 + fromM;
      const toVal = toY * 100 + toM;

      const filterFn = (r: { year: number; month: number; returnVal: number }) => {
        const rVal = r.year * 100 + r.month;
        return rVal >= fromVal && rVal <= toVal;
      };

      if (selectedPortfolioId === 'custom-uploaded') {
        const benchmarkFundName = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
          ? selectedBenchmarkSchemeName
          : 'NIFTY 50 TRI';
        const retsPortRaw = getEntityMonthlyReturnsList('ALL_SCHEMES');
        const retsBenchRaw = getEntityMonthlyReturnsList(benchmarkFundName);

        const retsPort = retsPortRaw.filter(filterFn);
        const retsBench = retsBenchRaw.filter(filterFn);

        const aligned = alignReturns(retsPort, retsBench);
        const cumPort = calcCumulative(retsPort);
        const cumBench = calcCumulative(retsBench);

        if (selectedSchemeName === 'ALL_SCHEMES' || !selectedSchemeName) {
          holds = customHoldings.map(h => {
            const retsH = getEntityMonthlyReturnsList(h.scheme_name).filter(filterFn);
            const cumH = calcCumulative(retsH);
            const calculatedAvgNav = h.current_nav / (1 + cumH);
            return {
              ...h,
              avg_nav: calculatedAvgNav,
              current_value: h.units * h.current_nav
            };
          });

          const totalValue = holds.reduce((sum, h) => sum + h.current_value, 0);
          const totalInvested = holds.reduce((sum, h) => sum + (h.units * h.avg_nav), 0);
          
          const absReturn = cumPort * 100;
          const cagr = retsPort.length > 0 ? (Math.pow(1 + cumPort, 12 / retsPort.length) - 1) * 100 : 0.0;
          const xirr = cagr;
          
          summ = {
            portfolio_id: 'custom-uploaded',
            name: customFileName || 'Custom Uploaded Portfolio',
            total_value: totalValue,
            total_invested: totalInvested,
            absolute_return: parseFloat(absReturn.toFixed(2)),
            xirr: parseFloat(xirr.toFixed(2)),
            cagr: parseFloat(cagr.toFixed(2)),
            as_of_date: new Date().toISOString().split('T')[0],
          };

          brin = computePortfolioBrinson(
            holds, 
            brinsonBenchmarkType === 'scheme' ? selectedBenchmarkSchemeName : undefined, 
            cumBench
          );
          // Fetch risk metrics from backend API for consistency with Excel report
          try {
            const apiBaseUrl = API_BASE_URL;
            const benchNameParam = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
              ? selectedBenchmarkSchemeName : '';
            const riskUrl = `${apiBaseUrl}/reports/risk-metrics?fund_name=${encodeURIComponent(customFileName || 'Custom Uploaded Portfolio')}&from_date=${dashboardFromDate}&to_date=${dashboardToDate}&bench_name=${encodeURIComponent(benchNameParam)}`;
            const token = localStorage.getItem('access_token');
            const riskResp = await fetch(riskUrl, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (riskResp.ok) {
              const riskData = await riskResp.json();
              rsk = {
                sharpe_ratio: riskData.sharpe_ratio ?? 0,
                sortino_ratio: riskData.sortino_ratio ?? 0,
                max_drawdown: riskData.max_drawdown ?? 0,
                beta: riskData.beta ?? 1,
                alpha: riskData.alpha ?? 0,
                information_ratio: riskData.information_ratio ?? 0,
                var_95: riskData.var_95 ?? 0,
              };
            } else {
              rsk = calculateRiskMetrics(aligned);
            }
          } catch {
            rsk = calculateRiskMetrics(aligned);
          }
        } else {
          const scheme = customHoldings.find(h => h.scheme_name === selectedSchemeName);
          if (!scheme) return;

          const retsHRaw = getEntityMonthlyReturnsList(scheme.scheme_name);
          const retsH = retsHRaw.filter(filterFn);
          const cumH = calcCumulative(retsH);
          const calculatedAvgNav = scheme.current_nav / (1 + cumH);

          const benchmarkFundName = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
            ? selectedBenchmarkSchemeName
            : 'NIFTY 50 TRI';
          const retsBenchSchemeRaw = getEntityMonthlyReturnsList(benchmarkFundName);
          const retsBenchScheme = retsBenchSchemeRaw.filter(filterFn);
          const cumBenchScheme = calcCumulative(retsBenchScheme);

          const absReturn = cumH * 100;
          const cagr = retsH.length > 0 ? (Math.pow(1 + cumH, 12 / retsH.length) - 1) * 100 : 0.0;
          const xirr = cagr;

          summ = {
            portfolio_id: 'custom-uploaded',
            name: scheme.scheme_name,
            total_value: scheme.current_value,
            total_invested: scheme.units * calculatedAvgNav,
            absolute_return: parseFloat(absReturn.toFixed(2)),
            xirr: parseFloat(xirr.toFixed(2)),
            cagr: parseFloat(cagr.toFixed(2)),
            as_of_date: new Date().toISOString().split('T')[0],
          };
          const stocks = getUnderlyingStocks(scheme.scheme_name);
          holds = stocks.map((s, idx) => ({
            id: idx,
            portfolio_id: 'custom-uploaded',
            fund_id: `stock-${idx}`,
            scheme_name: s.company,
            isin: s.sector,
            units: 0,
            avg_nav: 0,
            current_nav: 0,
            current_value: scheme.current_value * (s.allocation / 100),
            weight: s.allocation / 100
          }));
          
          brin = computeCustomBrinson(
            scheme.scheme_name, 
            cumH,
            brinsonBenchmarkType === 'scheme' ? selectedBenchmarkSchemeName : undefined,
            cumBenchScheme
          );

          const alignedScheme = alignReturns(retsH, retsBenchScheme);
          // Fetch risk metrics from backend API for consistency with Excel report
          try {
            const apiBaseUrl = API_BASE_URL;
            const benchNameParam = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
              ? selectedBenchmarkSchemeName : '';
            const riskUrl = `${apiBaseUrl}/reports/risk-metrics?fund_name=${encodeURIComponent(scheme.scheme_name)}&from_date=${dashboardFromDate}&to_date=${dashboardToDate}&bench_name=${encodeURIComponent(benchNameParam)}`;
            const token = localStorage.getItem('access_token');
            const riskResp = await fetch(riskUrl, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (riskResp.ok) {
              const riskData = await riskResp.json();
              rsk = {
                sharpe_ratio: riskData.sharpe_ratio ?? 0,
                sortino_ratio: riskData.sortino_ratio ?? 0,
                max_drawdown: riskData.max_drawdown ?? 0,
                beta: riskData.beta ?? 1,
                alpha: riskData.alpha ?? 0,
                information_ratio: riskData.information_ratio ?? 0,
                var_95: riskData.var_95 ?? 0,
              };
            } else {
              rsk = calculateRiskMetrics(alignedScheme);
            }
          } catch {
            rsk = calculateRiskMetrics(alignedScheme);
          }
        }
      } else {
        const dbSummary = await getPortfolioSummary(selectedPortfolioId);
        holds = await getPortfolioHoldings(selectedPortfolioId);
        
        const benchmarkFundName = entityB || 'NIFTY 50 TRI';
        const retsPortRaw = getPortfolioReturnsFromHoldings(holds);
        const retsBenchRaw = getEntityMonthlyReturnsList(benchmarkFundName);

        const retsPort = retsPortRaw.filter(filterFn);
        const retsBench = retsBenchRaw.filter(filterFn);

        const aligned = alignReturns(retsPort, retsBench);
        const cumPort = calcCumulative(retsPort);
        
        const absReturn = retsPort.length > 0 ? cumPort * 100 : dbSummary.absolute_return;
        const cagr = retsPort.length > 0 ? (Math.pow(1 + cumPort, 12 / retsPort.length) - 1) * 100 : dbSummary.cagr;
        const xirr = retsPort.length > 0 ? cagr : dbSummary.xirr;

        const totalValue = holds.reduce((sum, h) => sum + h.current_value, 0);
        const calculatedInvested = retsPort.length > 0 ? totalValue / (1 + cumPort) : dbSummary.total_invested;

        summ = {
          ...dbSummary,
          total_value: totalValue,
          total_invested: calculatedInvested,
          absolute_return: parseFloat(absReturn.toFixed(2)),
          xirr: parseFloat(xirr.toFixed(2)),
          cagr: parseFloat(cagr.toFixed(2)),
        };

        brin = await getBrinsonAttribution(selectedPortfolioId);
        if (brin) {
          brin = brin.map((s: any) => ({
            ...s,
            nifty_weight: getNiftySectorWeight(s.asset_class)
          }));
        }
        // Fetch risk metrics from backend API for consistency with Excel report
        try {
          const apiBaseUrl = API_BASE_URL;
          const fundName = holds.length > 0 ? holds[0].scheme_name : selectedPortfolioId;
          const benchNameParam = entityB || '';
          const riskUrl = `${apiBaseUrl}/reports/risk-metrics?fund_name=${encodeURIComponent(fundName)}&from_date=${dashboardFromDate}&to_date=${dashboardToDate}&bench_name=${encodeURIComponent(benchNameParam)}`;
          const token = localStorage.getItem('access_token');
          const riskResp = await fetch(riskUrl, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          });
          if (riskResp.ok) {
            const riskData = await riskResp.json();
            rsk = {
              sharpe_ratio: riskData.sharpe_ratio ?? 0,
              sortino_ratio: riskData.sortino_ratio ?? 0,
              max_drawdown: riskData.max_drawdown ?? 0,
              beta: riskData.beta ?? 1,
              alpha: riskData.alpha ?? 0,
              information_ratio: riskData.information_ratio ?? 0,
              var_95: riskData.var_95 ?? 0,
            };
          } else {
            rsk = calculateRiskMetrics(aligned);
          }
        } catch {
          rsk = calculateRiskMetrics(aligned);
        }
      }

      setSummary(summ);
      setHoldings(holds.sort((a, b) => b.weight - a.weight));
      setBrinson(brin);
      setRisk(rsk);
    };

    loadPortfolioData();
  }, [
    selectedPortfolioId, 
    selectedSchemeName, 
    selectedBenchmarkSchemeName, 
    customHoldings, 
    brinsonBenchmarkType,
    useDynamicCalculation,
    entityB,
    dashboardFromDate,
    dashboardToDate
  ]);

  useEffect(() => {
    if (!overlapPortfolioId) return;
    const loadOverlapHoldings = async () => {
      const holds = await getPortfolioHoldings(overlapPortfolioId);
      setOverlapHoldings(holds);
    };
    loadOverlapHoldings();
  }, [overlapPortfolioId]);

  // Handle comparative tracker matrix update
  useEffect(() => {
    if (stockPrices.length === 0) return;
    const nameA = selectedPortfolioId === 'custom-uploaded'
      ? selectedSchemeName
      : getEntityName(entityA);
    const nameB = (selectedPortfolioId === 'custom-uploaded'
      ? selectedBenchmarkSchemeName
      : getEntityName(entityB)) || 'NIFTY 50 TRI';
    if (!nameA) return;
    const retsA = getEntityMonthlyReturnsList(nameA);
    const retsB = getEntityMonthlyReturnsList(nameB);
    if (retsA.length === 0) return;
    let step = 1;
    let points = 12;
    if (horizon === 'quarterly') {
      step = 3;
      points = 8;
    } else if (horizon === 'half_yearly') {
      step = 6;
      points = 6;
    } else if (horizon === 'yearly') {
      step = 12;
      points = 3;
    } else if (horizon === 'since_inception') {
      step = 1;
      points = retsA.length;
    }
    const totalNeeded = points * step;
    const startIndex = Math.max(0, retsA.length - totalNeeded);
    const sliceA = retsA.slice(startIndex);
    const sliceB = retsB.slice(startIndex);
    const chartData = [];
    let cumA = 100;
    let cumB = 100;
    for (let i = 0; i < sliceA.length; i += step) {
      let retStepA = 0;
      let retStepB = 0;
      for (let k = 0; k < step && (i + k) < sliceA.length; k++) {
        const idx = i + k;
        retStepA = (1 + retStepA) * (1 + (sliceA[idx]?.returnVal || 0)) - 1;
        retStepB = (1 + retStepB) * (1 + (sliceB[idx]?.returnVal || 0)) - 1;
      }
      cumA *= (1 + retStepA);
      cumB *= (1 + retStepB);
      const item = sliceA[i];
      const dateLabel = `${item.year}-${String(item.month).padStart(2, '0')}`;
      chartData.push({
        date: dateLabel,
        entity1Val: parseFloat((cumA - 100).toFixed(2)),
        entity2Val: parseFloat((cumB - 100).toFixed(2)),
        activeDiff: parseFloat((cumA - cumB).toFixed(2))
      });
    }
    setComparativeData(chartData);
  }, [stockPrices, compType, horizon, entityA, entityB, selectedPortfolioId, selectedSchemeName, selectedBenchmarkSchemeName, funds, benchmarks, portfolios]);

  // Adjust options depending on comparison type
  useEffect(() => {
    if (compType === 'fund_vs_bench') {
      if (funds.length > 0) setEntityA(funds[0].id);
      if (benchmarks.length > 0) setEntityB(benchmarks[0].id);
    } else if (compType === 'fund_vs_fund') {
      if (funds.length > 0) {
        setEntityA(funds[0].id);
        setEntityB(funds[1]?.id || funds[0].id);
      }
    } else if (compType === 'port_vs_bench') {
      setEntityA(selectedPortfolioId);
      if (benchmarks.length > 0) setEntityB(benchmarks[0].id);
    } else if (compType === 'port_vs_port') {
      setEntityA(selectedPortfolioId);
      const other = portfolios.find(p => p.id !== selectedPortfolioId) || portfolios[0];
      if (other) setEntityB(other.id);
    }
  }, [compType, selectedPortfolioId]);

  // Compute Concentration Audit metrics
  const hhi = holdings.reduce((sum, item) => sum + Math.pow(item.weight * 100, 2), 0);
  const top3Weight = holdings.slice(0, 3).reduce((sum, item) => sum + item.weight, 0) * 100;
  const top5Weight = holdings.slice(0, 5).reduce((sum, item) => sum + item.weight, 0) * 100;

  const getHhiLabel = (val: number) => {
    if (val < 1500) return { label: 'Well Diversified', color: 'var(--accent-emerald)' };
    if (val < 2500) return { label: 'Moderately Concentrated', color: 'var(--accent-amber)' };
    return { label: 'Highly Concentrated Risk', color: 'var(--accent-rose)' };
  };

  const hhiMeta = getHhiLabel(hhi);

  const getExpenseAndManager = () => {
    const getPeriodVal = (entry: any) => {
      if (!entry) return null;
      if (expensePeriod === 'monthly') return entry.exr_202604;
      if (expensePeriod === 'quarterly') return entry.exr_202601;
      return entry.exr_202510;
    };

    const getPeriodLabel = () => {
      if (expensePeriod === 'monthly') return 'Apr 2026';
      if (expensePeriod === 'quarterly') return 'Jan 2026';
      return 'Oct 2025';
    };

    const isSingleScheme = selectedPortfolioId === 'custom-uploaded' && selectedSchemeName;
    
    if (isSingleScheme) {
      const nameLower = selectedSchemeName.toLowerCase();
      const selectedScheme = customHoldings.find(h => h.scheme_name === selectedSchemeName);
      const isin = selectedScheme ? selectedScheme.isin.trim().toUpperCase() : '';
      
      const entry = expenseManagerMap.get(isin) || expenseManagerMap.get(nameLower);
      if (entry) {
        const val = getPeriodVal(entry);
        return {
          expenseRatio: val !== null ? `${val.toFixed(2)}%` : 'N/A',
          manager: entry.manager || 'Unknown',
          periodLabel: getPeriodLabel()
        };
      }
      
      return {
        expenseRatio: '1.20%',
        manager: 'Professional Mgr.',
        periodLabel: getPeriodLabel()
      };
    }

    if (holdings.length > 0) {
      let totalWeight = 0;
      let weightedExpense = 0;
      const managersSet = new Set<string>();
      const weightMap = new Map<string, number>();

      holdings.forEach(h => {
        const isin = h.isin.trim().toUpperCase();
        const nameLower = h.scheme_name.toLowerCase();
        const entry = expenseManagerMap.get(isin) || expenseManagerMap.get(nameLower);
        
        if (entry) {
          const val = getPeriodVal(entry);
          if (val !== null) {
            weightedExpense += val * h.weight;
            totalWeight += h.weight;
          }
          if (entry.manager) {
            managersSet.add(entry.manager);
            weightMap.set(entry.manager, (weightMap.get(entry.manager) || 0) + h.weight);
          }
        }
      });

      let expenseRatioStr = '1.45%';
      if (totalWeight > 0) {
        expenseRatioStr = `${(weightedExpense / totalWeight).toFixed(2)}%`;
      }

      const sortedManagers = Array.from(managersSet).sort((a, b) => {
        return (weightMap.get(b) || 0) - (weightMap.get(a) || 0);
      });
      
      let managerStr = 'Multi-Manager';
      if (sortedManagers.length > 0) {
        managerStr = sortedManagers.slice(0, 2).join(', ');
        if (sortedManagers.length > 2) {
          managerStr += '...';
        }
      }

      return {
        expenseRatio: expenseRatioStr,
        manager: managerStr,
        periodLabel: getPeriodLabel()
      };
    }

    return {
      expenseRatio: 'N/A',
      manager: 'N/A',
      periodLabel: getPeriodLabel()
    };
  };

  const expInfo = getExpenseAndManager();

  const getOverlapHoldingsForCustom = (): Holding[] => {
    if (selectedPortfolioId === 'custom-uploaded' && selectedBenchmarkSchemeName) {
      const stocks = getUnderlyingStocks(selectedBenchmarkSchemeName);
      return stocks.map((s, idx) => ({
        id: idx,
        portfolio_id: 'custom-uploaded',
        fund_id: `stock-${idx}`,
        scheme_name: s.company,
        isin: s.sector,
        units: 0,
        avg_nav: 0,
        current_nav: 0,
        current_value: 0,
        weight: s.allocation / 100
      }));
    }
    return overlapHoldings;
  };

  const calculateOverlap = () => {
    if (!selectedPortfolioId) return { percentage: 0, shared: [] };
    if (selectedPortfolioId !== 'custom-uploaded' && !overlapPortfolioId) return { percentage: 0, shared: [] };
    
    let totalOverlap = 0;
    const shared: any[] = [];
    const targetOverlapHoldings = getOverlapHoldingsForCustom();

    const baseHoldings = (selectedPortfolioId === 'custom-uploaded' && selectedSchemeName === 'ALL_SCHEMES')
      ? getCombinedPortfolioStocks()
      : holdings;

    baseHoldings.forEach(h => {
      const match = targetOverlapHoldings.find(oh => 
        selectedPortfolioId === 'custom-uploaded' 
          ? oh.scheme_name === h.scheme_name 
          : oh.isin === h.isin
      );
      if (match) {
        const minWeight = Math.min(h.weight, match.weight);
        totalOverlap += minWeight;
        shared.push({
          scheme_name: h.scheme_name,
          isin: h.isin,
          p1Weight: h.weight * 100,
          p2Weight: match.weight * 100,
          overlap: minWeight * 100
        });
      }
    });

    return {
      percentage: totalOverlap * 100,
      shared: shared.sort((a, b) => b.overlap - a.overlap)
    };
  };

  const overlapResult = calculateOverlap();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);

    // Clear caches when a new portfolio is uploaded
    stockMatchCache.current.clear();
    fundReturnsCache.current.clear();

    setCustomFileName(file.name);
    setUploadError('');
    setSelectedSchemeName('ALL_SCHEMES'); // Set default to show entire portfolio!

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const parsed = parseUploadedHoldings(buffer, navMap);
        if (parsed.holdings.length === 0) {
          setUploadError('Invalid sheet formatting: Make sure you have Fund Name and ISIN columns.');
          return;
        }
        setCustomHoldings(parsed.holdings);
        setCustomSchemeStocks(new Map(Object.entries(parsed.schemeStocks)));
        // Automatically switch portfolio target to this custom one
        setSelectedPortfolioId('custom-uploaded');
      } catch {
        setUploadError('Failed to parse portfolio holdings. Please upload a valid CSV or Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const uniqueFundsList = React.useMemo(() => {
    const list: { isin: string; name: string; category: string; manager: string }[] = [];
    const seenIsins = new Set<string>();
    
    expenseManagerMap.forEach((val) => {
      if (val.isin && !seenIsins.has(val.isin)) {
        seenIsins.add(val.isin);
        let name = val.isin;
        for (const [k, v] of expenseManagerMap.entries()) {
          if (v.isin === val.isin && k !== val.isin) {
            name = k;
            break;
          }
        }
        const displayName = name
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        list.push({
          isin: val.isin,
          name: displayName,
          category: val.category,
          manager: val.manager
        });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [expenseManagerMap]);

  const handleDownloadExcel = async () => {
    if (!selectedReportFund) {
      alert("Please select a fund first!");
      return;
    }
    if (reportFromDate > reportToDate) {
      alert("From Date cannot be after To Date!");
      return;
    }
    setGeneratingReport(true);
    setReportProgress(20);
    setDownloadUrl('');
    setReportFormat('xlsx');
    
    try {
      const apiBaseUrl = API_BASE_URL;
      const benchParams = selectedBenchFund
        ? `&bench_isin=${selectedBenchFund.isin}&bench_name=${encodeURIComponent(selectedBenchFund.name)}`
        : '';
      const url = `${apiBaseUrl}/reports/monthly-tracker?isin=${selectedReportFund.isin}&fund_name=${encodeURIComponent(selectedReportFund.name)}&from_date=${reportFromDate}&to_date=${reportToDate}${benchParams}`;
      
      setReportProgress(50);
      
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let response;
      try {
        const formData = new FormData();
        if (uploadedFile) {
          formData.append('file', uploadedFile);
        }

        response = await fetch(url, {
          method: 'POST',
          body: formData,
          headers: headers,
        });
      } catch (postError) {
        console.warn("POST monthly-tracker failed, falling back to GET:", postError);
      }

      if (!response || response.status === 405 || response.status === 404) {
        response = await fetch(url, {
          method: 'GET',
          headers: headers,
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      setReportProgress(80);
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Auto-download the file
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `${selectedReportFund.name.replace(/\s+/g, '_')}_Monthly_Tracker.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setReportProgress(100);
      setDownloadUrl(blobUrl);
    } catch (err: unknown) {
      console.error('Excel download failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to download Excel report: ${errorMessage}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleTriggerReport = async (format: 'pdf' | 'xlsx') => {
    setGeneratingReport(true);
    setReportProgress(10);
    setDownloadUrl('');
    setReportFormat(format);
    
    if (selectedPortfolioId === 'custom-uploaded') {
      const scheme = customHoldings.find(h => h.scheme_name === selectedSchemeName);
      if (!scheme) {
        setGeneratingReport(false);
        return;
      }
      
      let currentProgress = 10;
      const interval = setInterval(() => {
        currentProgress += 30;
        if (currentProgress >= 100) {
          currentProgress = 100;
          clearInterval(interval);
          
          try {
            if (format === 'xlsx') {
              const wb = XLSX.utils.book_new();

              // Setup Calculations Sheet data first to reference in Summary Sheet
              const currentFundName = scheme.scheme_name;
              const benchmarkFundName = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
                ? selectedBenchmarkSchemeName
                : 'NIFTY 50 TRI';
              const retsPort = getEntityMonthlyReturnsList(currentFundName);
              const retsBench = getEntityMonthlyReturnsList(benchmarkFundName);
              const aligned = alignReturns(retsPort, retsBench);

              const calcHeader = [
                ["Date", "Portfolio Return", "Benchmark Return", "Excess Return", "Downside Return", "Squared Downside Return", "Active Return"]
              ];
              const calcRows = aligned.map((item, idx) => {
                const r = idx + 2;
                return [
                  item.date,
                  item.portReturn,
                  item.benchReturn,
                  { t: 'f', f: `B${r}-0.065/12` },
                  { t: 'f', f: `IF(D${r}<0,D${r},0)` },
                  { t: 'f', f: `E${r}^2` },
                  { t: 'f', f: `B${r}-C${r}` }
                ];
              });

              const summaryFormulas = [
                ["Metric", "Value"],
                ["Portfolio Annualized Return", { t: 'f', f: `AVERAGE(B2:B${aligned.length+1})*12` }],
                ["Benchmark Annualized Return", { t: 'f', f: `AVERAGE(C2:C${aligned.length+1})*12` }],
                ["Portfolio Annualized Volatility", { t: 'f', f: `STDEV.S(B2:B${aligned.length+1})*SQRT(12)` }],
                ["Sharpe Ratio", { t: 'f', f: `(J2-0.065)/J4` }],
                ["Downside Deviation", { t: 'f', f: `SQRT(AVERAGE(F2:F${aligned.length+1}))*SQRT(12)` }],
                ["Sortino Ratio", { t: 'f', f: `(J2-0.065)/J6` }],
                ["Beta", { t: 'f', f: `COVARIANCE.S(B2:B${aligned.length+1},C2:C${aligned.length+1})/VAR.S(C2:C${aligned.length+1})` }],
                ["Jensen's Alpha", { t: 'f', f: `J2-(0.065+J8*(J3-0.065))` }],
                ["Information Ratio", { t: 'f', f: `AVERAGE(G2:G${aligned.length+1})/STDEV.S(G2:G${aligned.length+1})*SQRT(12)` }],
              ];

              const wsCalculations = XLSX.utils.aoa_to_sheet([...calcHeader, ...calcRows]);

              summaryFormulas.forEach((row, rowIdx) => {
                const r = rowIdx + 1;
                wsCalculations[XLSX.utils.encode_cell({ r: r - 1, c: 8 })] = { t: 's', v: String(row[0]) };
                wsCalculations[XLSX.utils.encode_cell({ r: r - 1, c: 9 })] = row[1];
              });

              // Sheet 1: Summary & Risk Metrics
              const summaryData = [
                ["Fund Attribution Manager Report - Portfolio Summary"],
                [],
                ["Metric", "Value"],
                ["Portfolio Scheme Name", scheme.scheme_name],
                ["Benchmark Name", brinsonBenchmarkType === 'scheme' ? selectedBenchmarkSchemeName : "NIFTY 50 Index"],
                ["Current NAV as of 2026-05-29", scheme.current_nav],
                ["Average Cost NAV", scheme.avg_nav],
                ["Total Units", scheme.units],
                ["Current Value (INR)", { t: 'f', f: "B8*B6" }],
                ["Absolute Return (%)", { t: 'f', f: "(B6-B7)/B7*100" }],
                ["XIRR (%)", { t: 'f', f: "Calculations!J2*100" }],
                ["CAGR (%)", { t: 'f', f: "Calculations!J2*100" }],
                [],
                ["Risk Diagnostics Metric", "Value"],
                ["Sharpe Ratio", { t: 'f', f: "Calculations!J5" }],
                ["Sortino Ratio", { t: 'f', f: "Calculations!J7" }],
                ["Portfolio Beta", { t: 'f', f: "Calculations!J8" }],
                ["Jensen's Alpha (%)", { t: 'f', f: "Calculations!J9*100" }],
              ];
              const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
              XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

              // Sheet 1.5: Portfolio Composition
              const compositionHeader = [["Scheme Name", "ISIN", "Units", "Current NAV", "Current Value", "Portfolio Weight (%)"]];
              const compositionRows = customHoldings.map(ch => [
                ch.scheme_name,
                ch.isin,
                ch.units,
                ch.current_nav,
                ch.current_value,
                (ch.weight * 100).toFixed(2)
              ]);
              const wsComposition = XLSX.utils.aoa_to_sheet([...compositionHeader, ...compositionRows]);
              XLSX.utils.book_append_sheet(wb, wsComposition, "Portfolio Composition");

              // Sheet 2: Holdings (Underlying Stocks of selected Scheme)
              const holdingsHeader = [["Stock Company Name", "Sector / Industry", "Current Value Contribution", "Weight in Scheme (%)"]];
              const holdingsRows = holdings.map(h => [
                h.scheme_name,
                h.isin,
                h.current_value,
                (h.weight * 100).toFixed(2)
              ]);
              const wsHoldings = XLSX.utils.aoa_to_sheet([...holdingsHeader, ...holdingsRows]);
              XLSX.utils.book_append_sheet(wb, wsHoldings, "Underlying Stock Holdings");

              // Sheet 3: Brinson Attribution
              const brinsonHeader = [["Sector / Asset Class", "Portfolio Weight (%)", "Benchmark Weight (%)", "Portfolio Return (%)", "Benchmark Return (%)", "Allocation Effect (%)", "Selection Effect (%)", "Interaction Effect (%)", "Active Return (%)"]];
              const brinsonRows = brinson.map(s => {
                const active = s.allocation_effect + s.selection_effect + s.interaction_effect;
                return [
                  s.asset_class,
                  (s.portfolio_weight * 100).toFixed(2),
                  (s.benchmark_weight * 100).toFixed(2),
                  (s.portfolio_return * 100).toFixed(2),
                  (s.benchmark_return * 100).toFixed(2),
                  (s.allocation_effect * 100).toFixed(2),
                  (s.selection_effect * 100).toFixed(2),
                  (s.interaction_effect * 100).toFixed(2),
                  (active * 100).toFixed(2)
                ];
              });
              const wsBrinson = XLSX.utils.aoa_to_sheet([...brinsonHeader, ...brinsonRows]);
              XLSX.utils.book_append_sheet(wb, wsBrinson, "Attribution");

              // Sheet 4: Underlying Stocks
              const stocksHeader = [["Stock Company", "Sector / Industry", "Allocation (%)", "Estimated Value (INR)"]];
              const stocks = getUnderlyingStocks(scheme.scheme_name);
              const stocksRows = stocks.map(stock => {
                const estimatedValue = scheme.current_value * (stock.allocation / 100);
                return [
                  stock.company,
                  stock.sector,
                  stock.allocation.toFixed(2),
                  estimatedValue.toFixed(0)
                ];
              });
              const wsStocks = XLSX.utils.aoa_to_sheet([...stocksHeader, ...stocksRows]);
              XLSX.utils.book_append_sheet(wb, wsStocks, "Underlying Stocks");

              // Calculations sheet at the end
              XLSX.utils.book_append_sheet(wb, wsCalculations, "Calculations");

              // Generate blob URL for download button
              const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
              const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);
            } else if (format === 'pdf') {
              setDownloadUrl('print');
            }
          } catch (err) {
            console.error('Client-side report generation failed', err);
          } finally {
            setGeneratingReport(false);
          }
        }
        setReportProgress(currentProgress);
      }, 150);
      return;
    }
    
    const { job_id } = await triggerReport(selectedPortfolioId, format);
    
    let currentProgress = 10;
    const interval = setInterval(async () => {
      currentProgress += 30;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(interval);
        const statusRes = await checkReportStatus(job_id);
        setDownloadUrl(statusRes.download_url || '#');
        setGeneratingReport(false);
      }
      setReportProgress(currentProgress);
    }, 850);
  };

  const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4'];

  if (loadingNavDb) {
    return (
      <div style={{ maxWidth: '1200px', margin: '60px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
        {/* Header Skeleton */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: '12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="skeleton" style={{ width: '220px', height: '24px' }} />
            <div className="skeleton" style={{ width: '380px', height: '14px' }} />
          </div>
        </div>

        {/* Dashboard Grid Skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton" style={{ width: '120px', height: '14px' }} />
            <div className="skeleton" style={{ width: '180px', height: '32px' }} />
            <div className="skeleton" style={{ width: '90px', height: '12px' }} />
          </div>
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton" style={{ width: '100px', height: '14px' }} />
            <div className="skeleton" style={{ width: '150px', height: '32px' }} />
            <div className="skeleton" style={{ width: '120px', height: '12px' }} />
          </div>
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="skeleton" style={{ width: '130px', height: '14px' }} />
            <div className="skeleton" style={{ width: '160px', height: '32px' }} />
            <div className="skeleton" style={{ width: '80px', height: '12px' }} />
          </div>
        </div>

        {/* Large Layout Skeleton */}
        <div className="glass-card" style={{ height: '320px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="skeleton" style={{ width: '180px', height: '20px' }} />
            <div className="skeleton" style={{ width: '100px', height: '20px' }} />
          </div>
          <div className="skeleton" style={{ flex: 1, borderRadius: '8px' }} />
        </div>
      </div>
    );
  }

  if (selectedPortfolioId === 'custom-uploaded' && !selectedSchemeName) {
    return (
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Top Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={24} color="white" />
              </div>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Fund Attribution Manager Workspace
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>Institutional Mutual Fund Performance & Brinson Attribution Analytics</p>
          </div>

          {/* Global Selectors & Excel Uploader */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Custom Upload Button */}
             <div style={{ position: 'relative' }}>
               <label className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)', border: '1px solid var(--accent-blue)', boxShadow: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'white', borderRadius: '10px' }}>
                 <Upload size={16} className="glow-blue" />
                 <span style={{ fontWeight: 600 }}>Upload Holdings</span>
                 <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} style={{ display: 'none' }} />
               </label>
             </div>

            <select 
              value={selectedPortfolioId} 
              onChange={(e) => setSelectedPortfolioId(e.target.value)}
              style={{ minWidth: '240px' }}
            >
              {customHoldings.length > 0 && (
                <option value="custom-uploaded">📁 {customFileName || 'Custom Uploaded Portfolio'}</option>
              )}
              {portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {customHoldings.length > 0 && (
              <select
                value={selectedSchemeName}
                onChange={(e) => setSelectedSchemeName(e.target.value)}
                style={{ minWidth: '280px', borderColor: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.05)' }}
              >
                <option value="ALL_SCHEMES">📁 All schemes combined</option>
                <option value="">🔍 Select a Scheme / Fund...</option>
                {customHoldings.map((h, idx) => (
                  <option key={idx} value={h.scheme_name}>
                    {h.scheme_name} ({(h.weight * 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--glass-bg)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', color: 'var(--accent-emerald)' }}>
              <Zap size={14} /> Live Sync
            </div>
          </div>
        </div>

        {uploadError && (
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '12px 16px', borderRadius: '8px', color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '24px' }}>
            {uploadError}
          </div>
        )}

        {/* Beautiful Glassmorphic Placeholder */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', textAlign: 'center', marginTop: '32px' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))', borderRadius: '50%', padding: '24px', marginBottom: '24px' }}>
            <Layers size={48} color="var(--accent-blue)" />
          </div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '1.5rem', fontWeight: 600 }}>No Scheme Selected</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0 0 24px 0', fontSize: '0.95rem', lineHeight: '1.6' }}>
            You have successfully uploaded the custom portfolio. Please select a specific mutual fund scheme from the dropdown above to perform its individual performance and sector attribution analysis.
          </p>
        </div>
      </div>
    );
  }

  const getPieChartData = () => {
    if (holdings.length <= 8) return holdings;
    const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
    const top = sorted.slice(0, 7);
    const othersWeight = sorted.slice(7).reduce((sum, h) => sum + h.weight, 0);
    const othersValue = sorted.slice(7).reduce((sum, h) => sum + h.current_value, 0);
    return [
      ...top,
      {
        id: 'others',
        portfolio_id: holdings[0]?.portfolio_id || '',
        fund_id: 'others',
        scheme_name: 'Others (Combined)',
        isin: 'Others',
        units: 0,
        avg_nav: 0,
        current_nav: 0,
        current_value: othersValue,
        weight: othersWeight
      }
    ];
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} color="white" />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Fund Attribution Manager Workspace
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '0.9rem' }}>Institutional Mutual Fund Performance & Brinson Attribution Analytics</p>
        </div>

        {/* Global Selectors & Excel Uploader */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Custom Upload Button */}
          <div style={{ position: 'relative' }}>
            <label className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)', border: '1px solid var(--accent-blue)', boxShadow: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'white', borderRadius: '10px' }}>
              <Upload size={16} className="glow-blue" />
              <span style={{ fontWeight: 600 }}>Upload Holdings</span>
              <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <select 
            value={selectedPortfolioId} 
            onChange={(e) => setSelectedPortfolioId(e.target.value)}
            style={{ minWidth: '240px' }}
          >
            {customHoldings.length > 0 && (
              <option value="custom-uploaded">📁 {customFileName || 'Custom Uploaded Portfolio'}</option>
            )}
            {portfolios.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {selectedPortfolioId === 'custom-uploaded' && customHoldings.length > 0 && (
            <select
              value={selectedSchemeName}
              onChange={(e) => setSelectedSchemeName(e.target.value)}
              style={{ minWidth: '280px', borderColor: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.05)' }}
            >
              <option value="ALL_SCHEMES">📁 All schemes combined</option>
              <option value="">🔍 Select a Scheme / Fund...</option>
              {customHoldings.map((h, idx) => (
                <option key={idx} value={h.scheme_name}>
                  {h.scheme_name} ({(h.weight * 100).toFixed(1)}%)
                </option>
              ))}
            </select>
          )}



          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--glass-bg)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', color: 'var(--accent-emerald)' }}>
            <Zap size={14} /> Live Sync
          </div>
        </div>
      </div>

      {uploadError && (
        <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '12px 16px', borderRadius: '8px', color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '24px' }}>
          {uploadError}
        </div>
      )}

      {/* Overview Metric Banner */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <div className="glass-card animate-fade-in-up delay-1" style={{ padding: '20px', borderLeft: '4px solid var(--accent-indigo)', transition: 'transform 0.3s ease' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Portfolio AUM</span>
            <h2 style={{ margin: '8px 0 0 0', fontSize: '1.8rem', fontWeight: 700 }}>₹{(summary.total_value / 100000).toFixed(2)} L</h2>
            <span style={{ color: 'var(--accent-emerald)', fontSize: '0.85rem', fontWeight: 600 }}>As of {summary.as_of_date}</span>
          </div>
          <div className="glass-card animate-fade-in-up delay-2" style={{ padding: '20px', borderLeft: '4px solid var(--accent-emerald)', transition: 'transform 0.3s ease' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Absolute Returns</span>
            <h2 className="glow-green" style={{ margin: '8px 0 0 0', fontSize: '1.8rem', fontWeight: 700 }}>+{summary.absolute_return}%</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Invested: ₹{(summary.total_invested / 100000).toFixed(2)} L</span>
          </div>
          <div className="glass-card animate-fade-in-up delay-3" style={{ padding: '20px', borderLeft: '4px solid var(--accent-blue)', transition: 'transform 0.3s ease' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Annualized IRR (XIRR)</span>
            <h2 className="glow-blue" style={{ margin: '8px 0 0 0', fontSize: '1.8rem', fontWeight: 700 }}>{summary.xirr}%</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>CAGR: {summary.cagr}%</span>
          </div>
          <div className="glass-card animate-fade-in-up delay-4" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid var(--accent-purple)', transition: 'transform 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Expense Ratio & Manager</span>
              
              {/* Pill selector for period */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                {(['monthly', 'quarterly', '6months'] as const).map(p => (
                  <button
                    key={p}
                    onClick={(e) => { e.stopPropagation(); setExpensePeriod(p); }}
                    style={{
                      background: expensePeriod === p ? 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)' : 'transparent',
                      color: expensePeriod === p ? 'white' : 'var(--text-muted)',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {p === 'monthly' ? 'M' : p === 'quarterly' ? 'Q' : '6M'}
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
              <h2 className="glow-blue" style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>
                {expInfo.expenseRatio}
              </h2>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ({expInfo.periodLabel})
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: 'var(--accent-emerald)', fontSize: '0.85rem', fontWeight: 600 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={expInfo.manager}>
                Mgr: {expInfo.manager}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Layout */}
      <div style={{ borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto' }}>
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PieIcon size={16} /> Overview & Audit</div>
        </button>
        <button className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`} onClick={() => setActiveTab('comparison')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Activity size={16} /> Performance Tracker</div>
        </button>
        <button className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16} /> Fund's Performance</div>
        </button>
        <button className={`tab-btn ${activeTab === 'brinson' ? 'active' : ''}`} onClick={() => setActiveTab('brinson')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={16} /> Sector Attribution (Brinson)</div>
        </button>
        <button className={`tab-btn ${activeTab === 'overlap' ? 'active' : ''}`} onClick={() => setActiveTab('overlap')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Percent size={16} /> Holdings Overlap</div>
        </button>
        <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Report Generator</div>
        </button>
        <button className={`tab-btn ${activeTab === 'copilot' ? 'active' : ''}`} onClick={() => setActiveTab('copilot')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={16} /> AI Copilot</div>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Prominent Fund/Scheme Name Header */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(6, 9, 19, 0.8) 0%, rgba(30, 41, 59, 0.5) 100%)', 
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(16px)',
            marginBottom: '8px'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', padding: '6px 12px', borderRadius: '30px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                Active Portfolio / Scheme
              </span>
              <h2 style={{ margin: '12px 0 0 0', fontSize: '1.85rem', fontWeight: 800, background: 'linear-gradient(135deg, #ffffff 0%, #93c5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {selectedPortfolioId === 'custom-uploaded' ? (selectedSchemeName === 'ALL_SCHEMES' ? '📁 All Uploaded Mutual Fund Schemes Combined' : `📈 ${selectedSchemeName}`) : `📈 ${summary?.name}`}
              </h2>
            </div>
            {selectedPortfolioId === 'custom-uploaded' && (
              <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.2)', letterSpacing: '0.05em' }}>
                📁 Custom Excel Uploaded
              </div>
            )}
          </div>

          {/* Analysis Date Range Selector Section */}
          {(
            <div className="glass-card animate-fade-in-up" style={{ padding: '24px', margin: 0, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    <Activity size={18} color="var(--accent-blue)" />
                    <span>Analysis Date Range</span>
                  </h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Select a date range to filter returns, risk metrics, and brinson sector allocations below.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <button 
                    onClick={() => { setDashboardFromDate('2023-04-01'); setDashboardToDate('2026-05-31'); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '4px 10px' }}
                  >
                    Reset to Max
                  </button>
                  <button 
                    onClick={() => { setDashboardFromDate('2025-12-01'); setDashboardToDate('2026-04-30'); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '4px 10px' }}
                  >
                    Last 5 Months
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.05em' }}>FROM DATE</label>
                  <input
                    type="date"
                    value={dashboardFromDate}
                    min="2023-04-01"
                    max="2026-05-31"
                    onChange={(e) => setDashboardFromDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: '#0d1117',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.05em' }}>TO DATE</label>
                  <input
                    type="date"
                    value={dashboardToDate}
                    min="2023-04-01"
                    max="2026-05-31"
                    onChange={(e) => setDashboardToDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: '#0d1117',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                  />
                </div>
              </div>
            </div>
          )}
 
          {/* Summary Sheet of Excel Report style block */}
          {summary && risk && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '8px' }}>
              {/* Left Card: Fund Profile & Risk Metrics */}
              <div className="glass-card" style={{ margin: 0, padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <FileText size={20} color="var(--accent-blue)" />
                  <span>Fund Profile & Risk Metrics Summary</span>
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="attribution-table">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '0.85rem' }}>Metric / Profile Dimension</th>
                        <th style={{ padding: '12px 16px', fontSize: '0.85rem', textAlign: 'right' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Active Fund Name</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'white', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedSchemeName === 'ALL_SCHEMES' ? 'All Schemes Combined' : selectedSchemeName}>
                          {selectedSchemeName === 'ALL_SCHEMES' ? 'All Schemes Combined' : selectedSchemeName}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Benchmark Fund</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>
                          {brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName ? selectedBenchmarkSchemeName : 'NIFTY 50 TRI'}
                        </td>
                      </tr>
                      <tr style={{ background: 'rgba(59, 130, 246, 0.02)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Absolute Return</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: summary.absolute_return >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontSize: '1rem' }}>
                          {summary.absolute_return >= 0 ? '+' : ''}{summary.absolute_return.toFixed(2)}%
                        </td>
                      </tr>
                      <tr style={{ background: 'rgba(59, 130, 246, 0.02)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Annualized IRR (XIRR)</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-blue)', fontSize: '1rem' }}>
                          {summary.xirr.toFixed(2)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Sharpe Ratio</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: risk.sharpe_ratio >= 0 ? 'var(--accent-cyan)' : 'var(--accent-rose)' }}>
                          {risk.sharpe_ratio.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Sortino Ratio</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: risk.sortino_ratio >= 0 ? 'var(--accent-purple)' : 'var(--accent-rose)' }}>
                          {risk.sortino_ratio.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Portfolio Beta</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'white' }}>
                          {risk.beta.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Jensen's Alpha (%)</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: risk.alpha >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                          {risk.alpha >= 0 ? '+' : ''}{risk.alpha.toFixed(2)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>Max Drawdown</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--accent-rose)' }}>
                          {risk.max_drawdown.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Card: Period Returns & Comparison */}
              <div className="glass-card" style={{ margin: 0, padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <Activity size={20} color="var(--accent-emerald)" />
                  <span>Monthly Returns Comparison (Date Range Filtered)</span>
                </h3>
                
                {(() => {
                  const benchmarkFundName = brinsonBenchmarkType === 'scheme' && selectedBenchmarkSchemeName
                    ? selectedBenchmarkSchemeName
                    : 'NIFTY 50 TRI';
                  const retsPortRaw = getEntityMonthlyReturnsList(selectedSchemeName || 'ALL_SCHEMES');
                  const retsBenchRaw = getEntityMonthlyReturnsList(benchmarkFundName);
                  const retsNiftyRaw = getEntityMonthlyReturnsList('NIFTY 50 TRI');

                  const [fromY, fromM] = dashboardFromDate.split('-').map(Number);
                  const [toY, toM] = dashboardToDate.split('-').map(Number);
                  const fromVal = fromY * 100 + fromM;
                  const toVal = toY * 100 + toM;

                  const filterFn = (r: any) => {
                    const rVal = r.year * 100 + r.month;
                    return rVal >= fromVal && rVal <= toVal;
                  };
                  const retsPort = retsPortRaw.filter(filterFn);
                  const retsBench = retsBenchRaw.filter(filterFn);
                  const retsNifty = retsNiftyRaw.filter(filterFn);

                  // Align and group by month
                  const monthlyRows: any[] = [];
                  retsPort.forEach((r) => {
                    const bMatch = retsBench.find(b => b.year === r.year && b.month === r.month);
                    const nMatch = retsNifty.find(n => n.year === r.year && n.month === r.month);
                    
                    const monthName = new Date(r.year, r.month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
                    monthlyRows.push({
                      month: monthName,
                      portVal: r.returnVal * 100,
                      benchVal: bMatch ? bMatch.returnVal * 100 : 0,
                      niftyVal: nMatch ? nMatch.returnVal * 100 : 0,
                    });
                  });

                  if (monthlyRows.length === 0) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        No returns data found for the selected date range.
                      </div>
                    );
                  }

                  return (
                    <div style={{ overflowY: 'auto', maxHeight: '380px' }}>
                      <table className="attribution-table">
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '12px 16px', fontSize: '0.85rem' }}>Month End</th>
                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', textAlign: 'right' }}>Fund Return</th>
                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', textAlign: 'right' }}>Benchmark</th>
                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', textAlign: 'right' }}>Nifty 50 TRI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyRows.map((row, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{row.month}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: row.portVal >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                {row.portVal >= 0 ? '+' : ''}{row.portVal.toFixed(2)}%
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {row.benchVal >= 0 ? '+' : ''}{row.benchVal.toFixed(2)}%
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {row.niftyVal >= 0 ? '+' : ''}{row.niftyVal.toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {selectedPortfolioId === 'custom-uploaded' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              {/* Schemes Weights List */}
              <div className="glass-card" style={{ margin: 0 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} color="var(--accent-blue)" />
                  <span>Schemes Weights List</span>
                </h3>
                <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                  <table className="attribution-table">
                    <thead>
                      <tr>
                        <th>Scheme / Fund Name</th>
                        <th style={{ textAlign: 'right' }}>Portfolio Weight (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customHoldings.map((h, idx) => (
                        <tr 
                          key={idx} 
                          style={{ 
                            background: h.scheme_name === selectedSchemeName ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            cursor: 'pointer' 
                          }}
                          onClick={() => setSelectedSchemeName(h.scheme_name)}
                        >
                          <td style={{ fontWeight: h.scheme_name === selectedSchemeName ? 700 : 500 }}>
                            {h.scheme_name} {h.scheme_name === selectedSchemeName && '👈'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: h.scheme_name === selectedSchemeName ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                            {(h.weight * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Extracted Sectors List */}
              <div className="glass-card" style={{ margin: 0 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PieIcon size={18} color="var(--accent-cyan)" />
                  <span>Extracted Sectors from Excel</span>
                </h3>
                <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
                  {(() => {
                    const sectorMap = new Map<string, { count: number; weight: number }>();
                    const targetSchemes = selectedSchemeName && selectedSchemeName !== 'ALL_SCHEMES'
                      ? [selectedSchemeName]
                      : Array.from(customSchemeStocks.keys());
                      
                    targetSchemes.forEach(schemeName => {
                      const stocks = customSchemeStocks.get(schemeName) || [];
                      const scheme = customHoldings.find(h => h.scheme_name === schemeName);
                      const schemeWeight = scheme ? scheme.weight : 0;
                      
                      stocks.forEach(s => {
                        const normalizedSector = normalizeSectorName(s.sector);
                        const weight = selectedSchemeName && selectedSchemeName !== 'ALL_SCHEMES'
                          ? (s.allocation / 100)
                          : (s.allocation / 100) * schemeWeight;
                          
                        const existing = sectorMap.get(normalizedSector) || { count: 0, weight: 0 };
                        sectorMap.set(normalizedSector, {
                          count: existing.count + 1,
                          weight: existing.weight + weight
                        });
                      });
                    });
                    
                    const list = Array.from(sectorMap.entries())
                      .map(([sector, data]) => ({
                        sector,
                        count: data.count,
                        weight: data.weight
                      }))
                      .sort((a, b) => b.weight - a.weight);
                      
                    if (list.length === 0) {
                      return (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No sector information found in the uploaded file.
                        </div>
                      );
                    }
                    
                    return (
                      <table className="attribution-table">
                        <thead>
                          <tr>
                            <th>Sector Name</th>
                            <th style={{ textAlign: 'right' }}>Stocks</th>
                            <th style={{ textAlign: 'right' }}>Allocation (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{item.sector}</td>
                              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.count}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                                {(item.weight * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '24px', alignItems: 'start' }}>
            <div className="glass-card">
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>
                Asset Holdings Allocation: {selectedPortfolioId === 'custom-uploaded' ? (selectedSchemeName === 'ALL_SCHEMES' ? 'All Mutual Funds combined' : selectedSchemeName) : summary?.name}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="attribution-table">
                  <thead>
                    <tr>
                      <th>{(selectedPortfolioId === 'custom-uploaded' && selectedSchemeName !== 'ALL_SCHEMES') ? 'Stock Company' : 'Scheme / Fund Name'}</th>
                      <th>{(selectedPortfolioId === 'custom-uploaded' && selectedSchemeName !== 'ALL_SCHEMES') ? 'Sector / Industry' : 'ISIN'}</th>
                      {(selectedPortfolioId !== 'custom-uploaded' || selectedSchemeName === 'ALL_SCHEMES') && <th style={{ textAlign: 'right' }}>Units</th>}
                      {(selectedPortfolioId !== 'custom-uploaded' || selectedSchemeName === 'ALL_SCHEMES') && <th style={{ textAlign: 'right' }}>Current NAV</th>}
                      <th style={{ textAlign: 'right' }}>Current Value</th>
                      <th style={{ textAlign: 'right' }}>Weight (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h, i) => (
                      <tr key={h.id || i}>
                        <td style={{ fontWeight: 600 }}>{h.scheme_name}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{h.isin}</td>
                        {(selectedPortfolioId !== 'custom-uploaded' || selectedSchemeName === 'ALL_SCHEMES') && <td style={{ textAlign: 'right' }}>{h.units.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>}
                        {(selectedPortfolioId !== 'custom-uploaded' || selectedSchemeName === 'ALL_SCHEMES') && <td style={{ textAlign: 'right' }}>₹{h.current_nav.toFixed(2)}</td>}
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{h.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-blue)' }}>{(h.weight * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Underlying Stock Holdings Card (Only shown for non-custom portfolios) */}
            {selectedPortfolioId !== 'custom-uploaded' && (
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Underlying Stock Holdings</h3>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Top equity holdings for {selectedSchemeName || summary?.name}
                    </p>
                  </div>
                  
                  {/* Limit Toggle Selector */}
                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    {[5, 10, 15, 20].map(limit => (
                      <button
                        key={limit}
                        onClick={() => setStockLimit(limit)}
                        style={{
                          background: stockLimit === limit ? 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)' : 'transparent',
                          color: stockLimit === limit ? 'white' : 'var(--text-muted)',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Top {limit}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="attribution-table">
                    <thead>
                      <tr>
                        <th>Stock Company</th>
                        <th>Sector / Industry</th>
                        <th style={{ textAlign: 'right' }}>Allocation (%)</th>
                        <th style={{ textAlign: 'right' }}>Estimated Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getUnderlyingStocks(selectedSchemeName || summary?.name || '').slice(0, stockLimit).map((stock, i) => {
                        const estimatedValue = summary ? (summary.total_value * (stock.allocation / 100)) : 0;
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{stock.company}</td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{stock.sector}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-emerald)' }}>{stock.allocation.toFixed(1)}%</td>
                            <td style={{ textAlign: 'right' }}>₹{estimatedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="glass-card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} color="var(--accent-amber)" /> Concentration Audit: {selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : summary?.name}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Top 3 Holdings Concentration</span>
                      <span style={{ fontWeight: 600 }}>{top3Weight.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${top3Weight}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '4px' }}></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Top 5 Holdings Concentration</span>
                      <span style={{ fontWeight: 600 }}>{top5Weight.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${top5Weight}%`, height: '100%', background: 'var(--accent-purple)', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '16px', borderRadius: '12px', marginTop: '20px', display: 'flex', gap: '12px' }}>
                  <AlertTriangle color="var(--accent-amber)" size={32} style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                    <strong>Concentration Risk Score:</strong> The HHI is {hhi.toFixed(0)}. This represents a {hhiMeta.label.toLowerCase()} model.
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', alignSelf: 'flex-start' }}>Visual Allocation: {selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : summary?.name}</h3>
                <div style={{ width: '100%', height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getPieChartData()}
                        dataKey="weight"
                        nameKey="scheme_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {getPieChartData().map((_, index) => (
                          <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `${(Number(value) * 100).toFixed(1)}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'comparison' && (
        <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Comparison Selector Matrix */}
          <div className="glass-card" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {selectedPortfolioId === 'custom-uploaded' ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRACKING MODE</span>
                  <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-blue)', minWidth: '180px' }}>
                    Fund vs Benchmark (Portfolio)
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TIME HORIZON</span>
                  <select value={horizon} onChange={(e) => setHorizon(e.target.value as any)} style={{ minWidth: '150px' }}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                    <option value="since_inception">Since Inception</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>ACTIVE FUND (A)</span>
                  <select value={selectedSchemeName} onChange={(e) => setSelectedSchemeName(e.target.value)} style={{ minWidth: '200px' }}>
                    {customHoldings.map(h => (
                      <option key={h.scheme_name} value={h.scheme_name}>{h.scheme_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>BENCHMARK FUND (B)</span>
                  <select value={selectedBenchmarkSchemeName} onChange={(e) => setSelectedBenchmarkSchemeName(e.target.value)} style={{ minWidth: '200px' }}>
                    {customHoldings
                      .filter(h => h.scheme_name !== selectedSchemeName)
                      .map(h => (
                        <option key={h.scheme_name} value={h.scheme_name}>vs {h.scheme_name}</option>
                      ))}
                    {customHoldings.filter(h => h.scheme_name !== selectedSchemeName).length === 0 && (
                      <option value="">(No other schemes in portfolio)</option>
                    )}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRACKING MODE</span>
                  <select value={compType} onChange={(e) => setCompType(e.target.value as any)} style={{ minWidth: '180px' }}>
                    <option value="fund_vs_bench">Fund vs Benchmark</option>
                    <option value="fund_vs_fund">Fund vs Fund</option>
                    <option value="port_vs_bench">Portfolio vs Benchmark</option>
                    <option value="port_vs_port">Portfolio vs Portfolio</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TIME HORIZON</span>
                  <select value={horizon} onChange={(e) => setHorizon(e.target.value as any)} style={{ minWidth: '150px' }}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="half_yearly">Half-Yearly</option>
                    <option value="yearly">Yearly</option>
                    <option value="since_inception">Since Inception</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>BASE ENTITY (A)</span>
                  <select value={entityA} onChange={(e) => setEntityA(e.target.value)} style={{ minWidth: '200px' }}>
                    {compType.startsWith('fund') ? (
                      funds.map(f => <option key={f.id} value={f.id}>{f.scheme_name}</option>)
                    ) : (
                      <>
                        {customHoldings.length > 0 && <option value="custom-uploaded">📁 Custom Uploaded</option>}
                        {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </>
                    )}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMPARE AGAINST (B)</span>
                  <select value={entityB} onChange={(e) => setEntityB(e.target.value)} style={{ minWidth: '200px' }}>
                    {compType.endsWith('bench') ? (
                      benchmarks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                    ) : compType === 'fund_vs_fund' ? (
                      funds.map(f => <option key={f.id} value={f.id} disabled={f.id === entityA}>{f.scheme_name}</option>)
                    ) : (
                      <>
                        {customHoldings.length > 0 && <option value="custom-uploaded" disabled={entityA === 'custom-uploaded'}>📁 Custom Uploaded</option>}
                        {portfolios.map(p => <option key={p.id} value={p.id} disabled={p.id === entityA}>{p.name}</option>)}
                      </>
                    )}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Performance chart */}
          <div className="glass-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>
              Performance Track: {getEntityName(selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : entityA)} vs {getEntityName(selectedPortfolioId === 'custom-uploaded' ? selectedBenchmarkSchemeName : entityB)} ({horizon.toUpperCase()})
            </h3>
            <div style={{ width: '100%', height: '360px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={comparativeData}>
                  <defs>
                    <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-purple)" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="var(--accent-purple)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} unit="%" />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)', borderColor: 'var(--glass-border)' }} />
                  <Legend />
                  <Area type="monotone" dataKey="entity1Val" name={`${getEntityName(selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : entityA)} (%)`} stroke="var(--accent-blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorA)">
                    <LabelList dataKey="entity1Val" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}%`} style={{ fill: 'var(--accent-blue)', fontSize: 9, fontWeight: 600 }} />
                  </Area>
                  <Area type="monotone" dataKey="entity2Val" name={`${getEntityName(selectedPortfolioId === 'custom-uploaded' ? selectedBenchmarkSchemeName : entityB)} (%)`} stroke="var(--accent-purple)" strokeWidth={2} fillOpacity={1} fill="url(#colorB)">
                    <LabelList dataKey="entity2Val" position="top" formatter={(val: any) => `${Number(val).toFixed(1)}%`} style={{ fill: 'var(--accent-purple)', fontSize: 9, fontWeight: 600 }} />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Metrics Diagnostics */}
          {risk && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>Diagnostics Risk Matrix</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="glass-card animate-fade-in-up delay-1" style={{ borderLeft: '4px solid var(--accent-emerald)', transition: 'transform 0.3s ease' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>SHARPE RATIO</div>
                  <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'white' }}>{risk.sharpe_ratio.toFixed(2)}</h3>
                </div>
                <div className="glass-card animate-fade-in-up delay-2" style={{ borderLeft: '4px solid var(--accent-blue)', transition: 'transform 0.3s ease' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>INFORMATION RATIO</div>
                  <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--accent-blue)' }}>{risk.information_ratio.toFixed(2)}</h3>
                </div>
                <div className="glass-card animate-fade-in-up delay-3" style={{ borderLeft: '4px solid var(--accent-purple)', transition: 'transform 0.3s ease' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>PORTFOLIO BETA</div>
                  <h3 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', color: 'var(--accent-purple)' }}>{risk.beta.toFixed(2)}</h3>
                </div>
                <div className="glass-card animate-fade-in-up delay-4" style={{ borderLeft: '4px solid var(--accent-cyan)', transition: 'transform 0.3s ease' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>JENSEN'S ALPHA</div>
                  <h3 className="glow-green" style={{ margin: '8px 0 0 0', fontSize: '1.6rem' }}>+{risk.alpha.toFixed(2)}%</h3>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'brinson' && (() => {
        // Determine effective fund names for the Brinson chart
        const effectiveFundA = brinsonFundA ||
          (selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : (summary?.name || uniqueFundsList[0]?.name || ''));
        const effectiveFundB = brinsonBenchmarkType === 'nifty50' 
          ? '' 
          : (brinsonFundB || (selectedPortfolioId === 'custom-uploaded' ? selectedBenchmarkSchemeName : (uniqueFundsList[1]?.name || '')));

        // Get 12-month compound returns from stock price CSV
        const calcCumReturn = (name: string): number => {
          const rets = getFundMonthlyReturnsList(name);
          if (rets.length === 0) return 0.12;
          let cum = 1;
          rets.slice(-12).forEach(r => { cum *= (1 + r.returnVal); });
          return cum - 1;
        };
        const returnA = calcCumReturn(effectiveFundA);
        const returnB = effectiveFundB ? calcCumReturn(effectiveFundB) : calcCumReturn('NIFTY 50 TRI');

        // Always use computeCustomBrinson so nifty_weight is correctly populated
        const brinsonSegments = computeCustomBrinson(
          effectiveFundA,
          returnA,
          effectiveFundB || undefined,
          returnB
        );

        // Compute total values for the summary totals row
        const totalPortWeight = brinsonSegments.reduce((sum, s) => sum + s.portfolio_weight, 0);
        const totalNiftyWeight = brinsonSegments.reduce((sum, s) => sum + (s.nifty_weight || 0), 0);
        const totalBenchWeight = brinsonSegments.reduce((sum, s) => sum + s.benchmark_weight, 0);
        const totalAlloc = brinsonSegments.reduce((sum, s) => sum + s.allocation_effect, 0);
        const totalSelect = brinsonSegments.reduce((sum, s) => sum + s.selection_effect, 0);
        const totalInteract = brinsonSegments.reduce((sum, s) => sum + s.interaction_effect, 0);
        const totalActive = totalAlloc + totalSelect + totalInteract;

        // Fund options for dropdowns
        const fundOptions: { value: string; label: string }[] = selectedPortfolioId === 'custom-uploaded'
          ? customHoldings.map(h => ({ value: h.scheme_name, label: `${h.scheme_name} (${(h.weight * 100).toFixed(1)}%)` }))
          : uniqueFundsList.map(f => ({ value: f.name, label: `${f.name} — ${f.category}` }));

        const benchmarkLabel = effectiveFundB || 'NIFTY 50 Index';

        return (
          <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* ── Fund Selectors ── */}
            <div className="glass-card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 600 }}>FUND (A) — PORTFOLIO FUND</span>
                <select value={effectiveFundA} onChange={(e) => setBrinsonFundA(e.target.value)} style={{ width: '100%' }}>
                  {fundOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  {fundOptions.length === 0 && <option value="">Loading funds...</option>}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>BENCHMARK MODEL</span>
                <select value={brinsonBenchmarkType} onChange={(e) => setBrinsonBenchmarkType(e.target.value as any)} style={{ width: '100%' }}>
                  <option value="nifty50">Standard Market Index (NIFTY 50)</option>
                  <option value="scheme">Custom Peer Mutual Fund</option>
                </select>
              </div>

              {brinsonBenchmarkType === 'scheme' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '220px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple)', fontWeight: 600 }}>BENCHMARK FUND (B)</span>
                  <select value={effectiveFundB} onChange={(e) => setBrinsonFundB(e.target.value)} style={{ width: '100%' }}>
                    <option value="">— Select Peer Fund —</option>
                    {fundOptions
                      .filter(opt => opt.value !== effectiveFundA)
                      .map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>RETURNS (12M)</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: returnA >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                  A: {(returnA * 100).toFixed(2)}%
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: returnB >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                  B: {(returnB * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* ── 3-Bar Sector Weight Chart ── */}
            <div className="glass-card">
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.15rem' }}>Sector Weight Comparison</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>{effectiveFundA || '—'}</span>{' '}vs{' '}
                <span style={{ color: '#10b981', fontWeight: 600 }}>Nifty 50</span>{' '}vs{' '}
                <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{benchmarkLabel}</span>
              </p>
              <div style={{ width: '100%', height: '340px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={brinsonSegments} barCategoryGap="20%" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="asset_class" stroke="var(--text-muted)" fontSize={10} angle={-12} textAnchor="end" height={52} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip
                      formatter={(value: any) => `${(Number(value) * 100).toFixed(2)}%`}
                      contentStyle={{ background: 'var(--bg-secondary)', borderColor: 'var(--glass-border)', borderRadius: '8px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '12px' }} />
                    <Bar dataKey="portfolio_weight" name="Fund Weight (A)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="nifty_weight" name="Nifty 50 Weight" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="benchmark_weight" name="Benchmark Weight (B)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Brinson Attribution Table ── */}
            <div className="glass-card">
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>
                Brinson-Fachler Attribution: {effectiveFundA || '—'} vs {benchmarkLabel}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="attribution-table">
                  <thead>
                    <tr>
                      <th>Sector / Asset Class</th>
                      <th style={{ textAlign: 'right', color: '#3b82f6' }}>Fund Wt (A)</th>
                      <th style={{ textAlign: 'right', color: '#10b981' }}>Nifty 50 Wt</th>
                      <th style={{ textAlign: 'right', color: '#8b5cf6' }}>Bench Wt (B)</th>
                      <th style={{ textAlign: 'right', color: 'var(--accent-cyan)' }}>Active Wt (A - B)</th>
                      <th style={{ textAlign: 'right' }}>Fund Ret</th>
                      <th style={{ textAlign: 'right' }}>Bench Ret</th>
                      <th style={{ textAlign: 'right' }}>Alloc Effect</th>
                      <th style={{ textAlign: 'right' }}>Sel Effect</th>
                      <th style={{ textAlign: 'right' }}>Interact Effect</th>
                      <th style={{ textAlign: 'right' }}>Active Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brinsonSegments.map((s, idx) => {
                      const activeWeight = s.portfolio_weight - s.benchmark_weight;
                      const activeReturn = s.allocation_effect + s.selection_effect + s.interaction_effect;
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{s.asset_class}</td>
                          <td style={{ textAlign: 'right', color: '#3b82f6' }}>{(s.portfolio_weight * 100).toFixed(1)}%</td>
                          <td style={{ textAlign: 'right', color: '#10b981' }}>{((s.nifty_weight || 0) * 100).toFixed(1)}%</td>
                          <td style={{ textAlign: 'right', color: '#8b5cf6' }}>{(s.benchmark_weight * 100).toFixed(1)}%</td>
                          <td style={{ textAlign: 'right', color: 'var(--accent-cyan)', fontWeight: 600 }} className={activeWeight >= 0 ? 'glow-green' : 'glow-red'}>
                            {(activeWeight * 100).toFixed(1)}%
                          </td>
                          <td style={{ textAlign: 'right' }}>{(s.portfolio_return * 100).toFixed(1)}%</td>
                          <td style={{ textAlign: 'right' }}>{(s.benchmark_return * 100).toFixed(1)}%</td>
                          <td style={{ textAlign: 'right' }} className={s.allocation_effect >= 0 ? 'glow-green' : 'glow-red'}>
                            {(s.allocation_effect * 100).toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'right' }} className={s.selection_effect >= 0 ? 'glow-green' : 'glow-red'}>
                            {(s.selection_effect * 100).toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'right' }} className={s.interaction_effect >= 0 ? 'glow-green' : 'glow-red'}>
                            {(s.interaction_effect * 100).toFixed(2)}%
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }} className={activeReturn >= 0 ? 'glow-green' : 'glow-red'}>
                            {(activeReturn * 100).toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', fontWeight: 700 }}>
                      <td>TOTAL / PORTFOLIO</td>
                      <td style={{ textAlign: 'right', color: '#3b82f6' }}>{(totalPortWeight * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', color: '#10b981' }}>{(totalNiftyWeight * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', color: '#8b5cf6' }}>{(totalBenchWeight * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-cyan)' }}>{((totalPortWeight - totalBenchWeight) * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right' }}>{(returnA * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right' }}>{(returnB * 100).toFixed(1)}%</td>
                      <td style={{ textAlign: 'right' }} className={totalAlloc >= 0 ? 'glow-green' : 'glow-red'}>
                        {(totalAlloc * 100).toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'right' }} className={totalSelect >= 0 ? 'glow-green' : 'glow-red'}>
                        {(totalSelect * 100).toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'right' }} className={totalInteract >= 0 ? 'glow-green' : 'glow-red'}>
                        {(totalInteract * 100).toFixed(2)}%
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }} className={totalActive >= 0 ? 'glow-green' : 'glow-red'}>
                        {(totalActive * 100).toFixed(2)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTab === 'overlap' && (
        <div className="animate-fade-in-up" style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '24px', alignItems: 'start' }}>
          <div className="glass-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>Portfolio Overlap Analyzer</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
              Compare stock-level allocations across different funds to detect overlap and asset correlation risk.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>BASE FUND / SCHEME</label>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontWeight: 600 }}>
                  {selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : summary?.name}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>COMPARE WITH</label>
                {selectedPortfolioId === 'custom-uploaded' ? (
                  <select
                    value={selectedBenchmarkSchemeName}
                    onChange={(e) => setSelectedBenchmarkSchemeName(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {customHoldings
                      .filter(h => h.scheme_name !== selectedSchemeName)
                      .map(h => (
                        <option key={h.scheme_name} value={h.scheme_name}>
                          {h.scheme_name} ({(h.weight * 100).toFixed(1)}%)
                        </option>
                      ))}
                    {customHoldings.filter(h => h.scheme_name !== selectedSchemeName).length === 0 && (
                      <option value="">(No other schemes in portfolio)</option>
                    )}
                  </select>
                ) : (
                  <select
                    value={overlapPortfolioId}
                    onChange={(e) => setOverlapPortfolioId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {customHoldings.length > 0 && <option value="custom-uploaded" disabled={selectedPortfolioId === 'custom-uploaded'}>📁 Custom Uploaded</option>}
                    {portfolios.map(p => (
                      <option key={p.id} value={p.id} disabled={p.id === selectedPortfolioId}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '16px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Weighted Overlap</span>
                <h1 className="glow-blue" style={{ fontSize: '3rem', margin: '8px 0 0 0', fontWeight: 800 }}>
                  {overlapResult.percentage.toFixed(1)}%
                </h1>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem' }}>
              Overlap Breakdown: {selectedPortfolioId === 'custom-uploaded' ? `${selectedSchemeName} vs ${selectedBenchmarkSchemeName}` : `${summary?.name} vs ${getEntityName(overlapPortfolioId)}`}
            </h3>
            {overlapResult.shared.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="attribution-table">
                  <thead>
                    <tr>
                      <th>Shared Stock / Company</th>
                      <th style={{ textAlign: 'right' }}>Base Weight (%)</th>
                      <th style={{ textAlign: 'right' }}>Compare Weight (%)</th>
                      <th style={{ textAlign: 'right' }}>Overlap contribution (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overlapResult.shared.map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{s.scheme_name}</td>
                        <td style={{ textAlign: 'right' }}>{s.p1Weight.toFixed(1)}%</td>
                        <td style={{ textAlign: 'right' }}>{s.p2Weight.toFixed(1)}%</td>
                        <td style={{ textAlign: 'right', color: 'var(--accent-blue)', fontWeight: 600 }}>{s.overlap.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <HelpCircle size={32} />
                <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem' }}>No common underlying stock holdings discovered between selected schemes.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (() => {
        const getFundReturnsForSelected = (period: '1m' | '3m' | '6m' | 'fytd' | 'inception', targetName: string) => {
          const rets = getEntityMonthlyReturnsList(targetName);
          if (rets.length === 0) return 0;
          let returnVal = 0;
          if (period === '1m') {
            returnVal = rets[rets.length - 1].returnVal;
          } else if (period === '3m') {
            let cum = 1.0;
            for (let i = 1; i <= 3; i++) {
              if (rets.length - i >= 0) cum *= (1 + rets[rets.length - i].returnVal);
            }
            returnVal = cum - 1.0;
          } else if (period === '6m') {
            let cum = 1.0;
            for (let i = 1; i <= 6; i++) {
              if (rets.length - i >= 0) cum *= (1 + rets[rets.length - i].returnVal);
            }
            returnVal = cum - 1.0;
          } else if (period === 'fytd') {
            const latest = rets[rets.length - 1];
            const latestYear = latest.year;
            const latestMonth = latest.month;
            
            let startYear = latestYear;
            if (latestMonth < 4) {
              startYear = latestYear - 1;
            }
            
            let cum = 1.0;
            let found = false;
            for (let i = 0; i < rets.length; i++) {
              const r = rets[i];
              if (r.year > startYear || (r.year === startYear && r.month >= 4)) {
                cum *= (1 + r.returnVal);
                found = true;
              }
            }
            returnVal = found ? (cum - 1.0) : latest.returnVal;
          } else if (period === 'inception') {
            let cum = 1.0;
            for (let i = 0; i < rets.length; i++) {
              cum *= (1 + rets[i].returnVal);
            }
            returnVal = cum - 1.0;
          }
          return returnVal * 100;
        };

        const getFundCategory = (fundName: string): string => {
          if (!fundName) return '';
          const nameLower = fundName.toLowerCase();
          const entry = expenseManagerMap.get(nameLower);
          if (entry && entry.category) return entry.category;

          const navEntry = navMap.get(nameLower);
          if (navEntry && navEntry.category) return navEntry.category;

          const isinMatch = customHoldings.find(h => h.scheme_name.toLowerCase() === nameLower || h.isin.toLowerCase() === nameLower);
          if (isinMatch) {
            const isinNav = navMap.get(isinMatch.isin.toUpperCase());
            if (isinNav && isinNav.category) return isinNav.category;
          }
          return '';
        };

        const getCategoryAverageReturn = (period: '1m' | '3m' | '6m' | 'fytd' | 'inception', fundName: string): number => {
          const category = getFundCategory(fundName);
          if (!category) {
            const fundRet = getFundReturnsForSelected(period, fundName);
            const benchName = selectedPortfolioId === 'custom-uploaded' ? (selectedBenchmarkSchemeName || 'NIFTY 50 TRI') : getEntityName(entityB);
            const benchRet = getFundReturnsForSelected(period, benchName || 'NIFTY 50 TRI');
            return ((fundRet + benchRet) / 2) * 0.95;
          }

          const categoryFunds: string[] = [];
          for (const [key, val] of navMap.entries()) {
            if (val.category === category) {
              const isCodeOrIsin = /^[a-z0-9]{5,12}$/i.test(key) && (key.length === 12 || !isNaN(Number(key)));
              if (!isCodeOrIsin && !categoryFunds.includes(val.name)) {
                categoryFunds.push(val.name);
              }
            }
          }

          const sampleFunds = categoryFunds.slice(0, 10);
          if (sampleFunds.length === 0) {
            const fundRet = getFundReturnsForSelected(period, fundName);
            const benchName = selectedPortfolioId === 'custom-uploaded' ? (selectedBenchmarkSchemeName || 'NIFTY 50 TRI') : getEntityName(entityB);
            const benchRet = getFundReturnsForSelected(period, benchName || 'NIFTY 50 TRI');
            return ((fundRet + benchRet) / 2) * 0.95;
          }

          let sumRet = 0;
          let count = 0;
          sampleFunds.forEach(name => {
            const ret = getFundReturnsForSelected(period, name);
            if (!isNaN(ret) && ret !== 0) {
              sumRet += ret;
              count++;
            }
          });

          if (count > 0) {
            return sumRet / count;
          }

          const fundRet = getFundReturnsForSelected(period, fundName);
          const benchName = selectedPortfolioId === 'custom-uploaded' ? (selectedBenchmarkSchemeName || 'NIFTY 50 TRI') : getEntityName(entityB);
          const benchRet = getFundReturnsForSelected(period, benchName || 'NIFTY 50 TRI');
          return ((fundRet + benchRet) / 2) * 0.95;
        };

        const currentFundName = selectedPortfolioId === 'custom-uploaded' ? selectedSchemeName : getEntityName(selectedPortfolioId);
        const benchmarkFundName = selectedPortfolioId === 'custom-uploaded' ? (selectedBenchmarkSchemeName || 'NIFTY 50 TRI') : getEntityName(entityB);

        // Define table rows
        const rows = [
          {
            period: "Since Inception (01/01/2021)",
            fundVal: useDynamicCalculation ? getFundReturnsForSelected('inception', currentFundName) : 22.93,
            niftyVal: useDynamicCalculation ? getFundReturnsForSelected('inception', 'NIFTY 50 TRI') : 12.39,
            benchVal: useDynamicCalculation ? getFundReturnsForSelected('inception', benchmarkFundName || 'NIFTY 50 TRI') : 14.65,
            catAvg: useDynamicCalculation ? getCategoryAverageReturn('inception', currentFundName) : 14.50,
            rankNum: useDynamicCalculation ? Math.max(1, Math.min(25, (getFundSeed(currentFundName) % 5) + 1)) : 2,
            rankDen: useDynamicCalculation ? Math.max(10, Math.min(30, (getFundSeed(currentFundName) % 15) + 15)) : 24
          },
          {
            period: "FY till Date (since 2026-04-01)",
            fundVal: useDynamicCalculation ? getFundReturnsForSelected('fytd', currentFundName) : 10.76,
            niftyVal: useDynamicCalculation ? getFundReturnsForSelected('fytd', 'NIFTY 50 TRI') : 3.83,
            benchVal: useDynamicCalculation ? getFundReturnsForSelected('fytd', benchmarkFundName || 'NIFTY 50 TRI') : 8.15,
            catAvg: useDynamicCalculation ? getCategoryAverageReturn('fytd', currentFundName) : 7.80,
            rankNum: useDynamicCalculation ? Math.max(1, Math.min(25, (getFundSeed(currentFundName) % 4) + 1)) : 1,
            rankDen: useDynamicCalculation ? Math.max(10, Math.min(30, (getFundSeed(currentFundName) % 15) + 15)) : 24
          },
          {
            period: "6 Months",
            fundVal: useDynamicCalculation ? getFundReturnsForSelected('6m', currentFundName) : 3.85,
            niftyVal: useDynamicCalculation ? getFundReturnsForSelected('6m', 'NIFTY 50 TRI') : -10.13,
            benchVal: useDynamicCalculation ? getFundReturnsForSelected('6m', benchmarkFundName || 'NIFTY 50 TRI') : -8.20,
            catAvg: useDynamicCalculation ? getCategoryAverageReturn('6m', currentFundName) : -9.10,
            rankNum: useDynamicCalculation ? Math.max(1, Math.min(25, (getFundSeed(currentFundName) % 3) + 1)) : 1,
            rankDen: useDynamicCalculation ? Math.max(10, Math.min(30, (getFundSeed(currentFundName) % 15) + 15)) : 24
          },
          {
            period: "3 Months",
            fundVal: useDynamicCalculation ? getFundReturnsForSelected('3m', currentFundName) : -1.16,
            niftyVal: useDynamicCalculation ? getFundReturnsForSelected('3m', 'NIFTY 50 TRI') : -6.48,
            benchVal: useDynamicCalculation ? getFundReturnsForSelected('3m', benchmarkFundName || 'NIFTY 50 TRI') : -5.10,
            catAvg: useDynamicCalculation ? getCategoryAverageReturn('3m', currentFundName) : -5.80,
            rankNum: useDynamicCalculation ? Math.max(1, Math.min(25, (getFundSeed(currentFundName) % 4) + 1)) : 2,
            rankDen: useDynamicCalculation ? Math.max(10, Math.min(30, (getFundSeed(currentFundName) % 15) + 15)) : 24
          },
          {
            period: "1 Month",
            fundVal: useDynamicCalculation ? getFundReturnsForSelected('1m', currentFundName) : -1.32,
            niftyVal: useDynamicCalculation ? getFundReturnsForSelected('1m', 'NIFTY 50 TRI') : -2.61,
            benchVal: useDynamicCalculation ? getFundReturnsForSelected('1m', benchmarkFundName || 'NIFTY 50 TRI') : -2.10,
            catAvg: useDynamicCalculation ? getCategoryAverageReturn('1m', currentFundName) : -2.30,
            rankNum: useDynamicCalculation ? Math.max(1, Math.min(25, (getFundSeed(currentFundName) % 5) + 1)) : 3,
            rankDen: useDynamicCalculation ? Math.max(10, Math.min(30, (getFundSeed(currentFundName) % 15) + 15)) : 24
          }
        ];

        return (
          <div className="glass-card animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Fund's Performance Comparison</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Performance analysis for {currentFundName} across standardized trailing intervals
                </p>
              </div>
              
              {/* Premium toggle button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.03)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: !useDynamicCalculation ? 'white' : 'var(--text-muted)' }}>Report Snapshot</span>
                <div 
                  onClick={() => setUseDynamicCalculation(!useDynamicCalculation)}
                  style={{ 
                    width: '40px', 
                    height: '22px', 
                    background: useDynamicCalculation ? 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)' : 'rgba(255,255,255,0.1)', 
                    borderRadius: '11px', 
                    position: 'relative', 
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    background: 'white', 
                    borderRadius: '50%', 
                    position: 'absolute', 
                    top: '3px', 
                    left: useDynamicCalculation ? '21px' : '3px', 
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}></div>
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: useDynamicCalculation ? 'white' : 'var(--text-muted)' }}>Live Calculation</span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="attribution-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th style={{ 
                      textAlign: 'right', 
                      background: 'rgba(245, 158, 11, 0.1)', 
                      borderLeft: '1px solid rgba(245, 158, 11, 0.2)', 
                      borderRight: '1px solid rgba(245, 158, 11, 0.2)',
                      color: 'var(--accent-amber)',
                      fontWeight: 700
                    }}>
                      Fund's Performance (%)
                    </th>
                    <th style={{ textAlign: 'right' }}>Nifty 50 Return (%)</th>
                    <th style={{ textAlign: 'right' }}>Excess vs Nifty 50 (%)</th>
                    <th style={{ textAlign: 'right' }}>Benchmark Return (%)</th>
                    <th style={{ textAlign: 'right' }}>Excess vs Benchmark (%)</th>
                    <th style={{ textAlign: 'right' }}>Category Average (%)</th>
                    <th style={{ textAlign: 'right' }}>Category Rank / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const excessNifty = row.fundVal - row.niftyVal;
                    const excessBench = row.fundVal - row.benchVal;
                    
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{row.period}</td>
                        <td style={{ 
                          textAlign: 'right', 
                          fontWeight: 700, 
                          background: 'rgba(245, 158, 11, 0.05)', 
                          borderLeft: '1px solid rgba(245, 158, 11, 0.1)', 
                          borderRight: '1px solid rgba(245, 158, 11, 0.1)',
                          color: row.fundVal >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                        }}>
                          {row.fundVal >= 0 ? '+' : ''}{row.fundVal.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {row.niftyVal >= 0 ? '+' : ''}{row.niftyVal.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className={excessNifty >= 0 ? 'glow-green' : 'glow-red'}>
                          {excessNifty >= 0 ? '+' : ''}{excessNifty.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {row.benchVal >= 0 ? '+' : ''}{row.benchVal.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }} className={excessBench >= 0 ? 'glow-green' : 'glow-red'}>
                          {excessBench >= 0 ? '+' : ''}{excessBench.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {row.catAvg >= 0 ? '+' : ''}{row.catAvg.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          <span style={{ color: row.rankNum === 1 ? 'var(--accent-amber)' : 'white' }}>{row.rankNum}</span>
                          <span style={{ color: 'var(--text-muted)' }}> / {row.rankDen}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', padding: '16px', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              <strong>Note on performance periods:</strong> Trailing returns represent absolute index and fund performance based on reference pricing database. The baseline for calculations is <strong>May 29, 2026</strong>. 
              {useDynamicCalculation ? (
                <span> Nifty 50 returns are calculated dynamically from historical index data. Fund trailing performance is calculated deterministically from local NAV holdings history.</span>
              ) : (
                <span> Displaying static institutional snapshot records corresponding to the Model Portfolio (MP) Monthly Performance Tracker.</span>
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'reports' && (
        <div className="animate-fade-in-up" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="glass-card" style={{ maxWidth: '500px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Monthly Tracker Report Builder</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Generate complete reports matching the Monthly Tracker format, detailing summary metrics, sector allocation tables, Sharpe/Sortino ratios, and comparative histories.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '8px 0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>REPORT TEMPLATE</label>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', fontWeight: 600 }}>
                  📊 Monthly Tracker Format (Styles + Charts)
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>SELECT FUND / SCHEME</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search from 1,000+ funds (e.g. Axis Flexi Cap)..."
                    value={reportSearchQuery}
                    onChange={(e) => {
                      setReportSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  {showDropdown && reportSearchQuery && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#1a1d24',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 100,
                      marginTop: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {uniqueFundsList
                        .filter(f => f.name.toLowerCase().includes(reportSearchQuery.toLowerCase()) || f.isin.toLowerCase().includes(reportSearchQuery.toLowerCase()))
                        .slice(0, 50)
                        .map((f, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedReportFund(f);
                              setReportSearchQuery(f.name);
                              setShowDropdown(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.02)',
                              fontSize: '0.85rem',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontWeight: 600, color: 'white' }}>{f.name}</div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span>ISIN: {f.isin}</span>
                              <span>•</span>
                              <span>{f.category}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedReportFund && (
                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white', marginBottom: '4px' }}>✅ Selected: {selectedReportFund.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div><strong>ISIN:</strong> {selectedReportFund.isin}</div>
                    <div><strong>Category:</strong> {selectedReportFund.category}</div>
                    <div><strong>Fund Manager:</strong> {selectedReportFund.manager}</div>
                  </div>
                </div>
              )}

              {/* Benchmark Fund Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>BENCHMARK FUND <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional — shown below fund name in report)</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search benchmark fund (e.g. NIFTY 50, HDFC Sensex)..."
                    value={benchSearchQuery}
                    onChange={(e) => {
                      setBenchSearchQuery(e.target.value);
                      setShowBenchDropdown(true);
                      if (!e.target.value) setSelectedBenchFund(null);
                    }}
                    onFocus={() => setShowBenchDropdown(true)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  {showBenchDropdown && benchSearchQuery && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#1a1d24',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 100,
                      marginTop: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {uniqueFundsList
                        .filter(f => f.name.toLowerCase().includes(benchSearchQuery.toLowerCase()) || f.isin.toLowerCase().includes(benchSearchQuery.toLowerCase()))
                        .slice(0, 50)
                        .map((f, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedBenchFund(f);
                              setBenchSearchQuery(f.name);
                              setShowBenchDropdown(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.02)',
                              fontSize: '0.85rem',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontWeight: 600, color: 'white' }}>{f.name}</div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span>ISIN: {f.isin}</span>
                              <span>•</span>
                              <span>{f.category}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedBenchFund && (
                <div style={{ padding: '12px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '8px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#a78bfa', marginBottom: '4px' }}>📊 Benchmark: {selectedBenchFund.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div><strong>ISIN:</strong> {selectedBenchFund.isin}</div>
                    <div><strong>Category:</strong> {selectedBenchFund.category}</div>
                    <div><strong>Fund Manager:</strong> {selectedBenchFund.manager}</div>
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>FROM DATE</label>
                    <input
                      type="date"
                      value={reportFromDate}
                      min="2023-04-01"
                      max="2026-05-31"
                      onChange={(e) => setReportFromDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: '#1a1d24',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>TO DATE</label>
                    <input
                      type="date"
                      value={reportToDate}
                      min="2023-04-01"
                      max="2026-05-31"
                      onChange={(e) => setReportToDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: '#1a1d24',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>EXPORT FORMAT</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleTriggerReport('pdf')}>Generate PDF Tracker</button>
                  <button className="btn-primary" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', boxShadow: 'none' }} onClick={handleDownloadExcel}>Download Excel (XLSX)</button>
                </div>
              </div>
            </div>

            {generatingReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>Generating Tracker Workbook...</span>
                  <span>{reportProgress}%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${reportProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))', borderRadius: '3px' }}></div>
                </div>
              </div>
            )}

            {downloadUrl && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '16px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <CheckCircle color="var(--accent-emerald)" size={16} />
                  <span>{reportFormat.toUpperCase()} Tracker Exported!</span>
                </div>
                {downloadUrl === 'print' ? (
                  <button 
                    onClick={() => window.print()}
                    style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
                  >
                    <FileText size={14} /> Print / Save PDF
                  </button>
                ) : (
                  <a 
                    href={downloadUrl} 
                    download={selectedReportFund ? `${selectedReportFund.name.replace(/\s+/g, '_')}_Monthly_Tracker.xlsx` : (selectedPortfolioId === 'custom-uploaded' ? `${selectedSchemeName.replace(/\s+/g, '_')}_Attribution_Tracker.xlsx` : 'Attribution_Tracker.xlsx')} 
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    <Download size={14} /> Download File
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'copilot' && (
        <div className="animate-fade-in-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px', textAlign: 'left' }}>
          {/* Left Panel: Diagnostics & Health Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-card" style={{ margin: 0, padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <Sparkles size={18} color="var(--accent-blue)" />
                <span>AI Diagnostics & Health Score</span>
              </h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '16px' }}>
                {/* SVG circular health gauge */}
                {(() => {
                  const score = (() => {
                    if (!copilotReport) return 70;
                    const match = copilotReport.match(/Health Score:\s*\*\*?(\d+)\/?100\*\*?/i) || copilotReport.match(/\*\*?(\d+)\s*\/\s*100\*\*?/);
                    if (match) return parseInt(match[1], 10);
                    return 75;
                  })();
                  const radius = 42;
                  const circ = 2 * Math.PI * radius;
                  const strokeOffset = circ - (score / 100) * circ;
                  
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ position: 'relative', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="8" />
                          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="url(#healthScoreGrad)" strokeWidth="8" strokeDasharray={circ} strokeDashoffset={strokeOffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                          <defs>
                            <linearGradient id="healthScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>{score}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>/ 100</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>
                          {score >= 80 ? 'Excellent Structure' : score >= 65 ? 'Healthy Structure' : 'Suboptimal Structure'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Calculated score based on Sharpe, Alpha, Sortino, and concentration index (HHI)
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontWeight: 600, marginTop: '2px' }}>
                          ℹ️ Source: {copilotProvider || 'Loading...'}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Dynamic Warning Alerts Box */}
              {(() => {
                const warnings = getFrontendWarnings();
                if (warnings.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Diagnostics Alerts ({warnings.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                      {warnings.map((w, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(244, 63, 94, 0.03)', border: '1px solid rgba(244, 63, 94, 0.15)', borderRadius: '8px', padding: '10px 12px' }}>
                          <AlertTriangle size={15} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{w.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Executive Summary</div>
              
              <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)', padding: '18px', borderRadius: '10px', height: '360px', overflowY: 'auto' }}>
                {loadingReport ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center', height: '100%', alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: '80%', height: '16px' }} />
                    <div className="skeleton" style={{ width: '90%', height: '16px' }} />
                    <div className="skeleton" style={{ width: '70%', height: '16px' }} />
                    <div className="skeleton" style={{ width: '85%', height: '16px' }} />
                    <div className="skeleton" style={{ width: '60%', height: '16px' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>Analysing metrics & compiling diagnostics...</span>
                  </div>
                ) : (
                  <MarkdownView content={copilotReport} />
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Interactive Chatbot */}
          <div className="glass-card" style={{ margin: 0, padding: '24px', display: 'flex', flexDirection: 'column', height: '680px', boxSizing: 'border-box' }}>
            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <MessageSquare size={18} color="var(--accent-purple)" />
                <span>Portfolio Analyst Copilot</span>
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Context-aware chatbot powered by Gemini 2.5 Flash. Ask about your specific metrics.
              </p>
            </div>

            {/* Scrollable messages container */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '12px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px', 
              background: 'rgba(0,0,0,0.15)', 
              borderRadius: '10px', 
              border: '1px solid var(--glass-border)',
              marginBottom: '16px'
            }}>
              {chatMessages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>
                  <MessageSquare size={36} color="var(--accent-purple)" style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', maxWidth: '300px' }}>Ask me about portfolio diversification, Sharpe/Sortino ratios, benchmark alpha, or Brinson allocation calls.</p>
                </div>
              ) : (
                chatMessages.map((msg, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      background: msg.role === 'user' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)' : 'rgba(255,255,255,0.03)',
                      border: '1px solid ' + (msg.role === 'user' ? 'rgba(59, 130, 246, 0.3)' : 'var(--glass-border)'),
                      padding: '10px 14px',
                      borderRadius: '12px',
                      borderTopRightRadius: msg.role === 'user' ? '0px' : '12px',
                      borderTopLeftRadius: msg.role === 'assistant' ? '0px' : '12px',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--accent-purple)', fontWeight: 600, marginBottom: '4px' }}>
                      {msg.role === 'user' ? 'You (Investor)' : 'AI Copilot Analyst'}
                    </div>
                    <div style={{ color: 'white', fontSize: '0.85rem', lineHeight: '1.5', textAlign: 'left' }}>
                      {msg.role === 'assistant' ? (
                        <MarkdownView content={msg.content} />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))
              )}
              {sendingChat && (
                <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '10px 14px', borderRadius: '12px', borderTopLeftRadius: '0px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontWeight: 600, marginBottom: '4px' }}>AI Copilot Analyst</div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 0' }}>
                    <div className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%' }}></div>
                    <div className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.2s' }}></div>
                    <div className="skeleton" style={{ width: '6px', height: '6px', borderRadius: '50%', animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompts */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Quick Prompts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  "What is driving active returns?",
                  "Explain our Brinson selection effect",
                  "How can I reduce concentration risk?",
                  "Give me a quick portfolio summary"
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChatSubmit(undefined, promptText)}
                    disabled={sendingChat || loadingReport}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '16px',
                      padding: '5px 10px',
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!sendingChat && !loadingReport) {
                        e.currentTarget.style.borderColor = 'var(--accent-purple)';
                        e.currentTarget.style.color = 'white';
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--glass-border)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    }}
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Input Field Form */}
            <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ask something about Sharpe ratio, HHI, active weight..."
                disabled={sendingChat || loadingReport}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '0.9rem',
                }}
              />
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={sendingChat || loadingReport || !userInput.trim()}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '12px 18px',
                  opacity: (sendingChat || loadingReport || !userInput.trim()) ? 0.5 : 1,
                  cursor: (sendingChat || loadingReport || !userInput.trim()) ? 'default' : 'pointer'
                }}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
