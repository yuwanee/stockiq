from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import yfinance as yf
import pandas as pd
import numpy as np
import os
import json
import re
import time
import requests

# Shared session with browser-like headers to reduce rate limiting
_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
})

# In-memory result cache — keyed by symbol, expires after CACHE_TTL seconds
_cache: Dict[str, Dict] = {}
_cache_ts: Dict[str, float] = {}
CACHE_TTL = 1800  # 30 minutes

def _cache_get(symbol: str) -> Optional[Dict]:
    if symbol in _cache and (time.time() - _cache_ts.get(symbol, 0)) < CACHE_TTL:
        return _cache[symbol]
    return None

def _cache_set(symbol: str, data: Dict) -> None:
    _cache[symbol] = data
    _cache_ts[symbol] = time.time()

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

app = FastAPI(title="Stock & ETF Analysis API")

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    # Render / Railway / Fly.io domains (wildcard via regex not supported, but same-origin calls work fine)
]
# Allow all origins in production so any deployed URL works
_ENV = os.environ.get("ENVIRONMENT", "development")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _ENV == "production" else _ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    symbols: List[str]


# ─── Technical Indicators ────────────────────────────────────────────────────

def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def calculate_macd(prices: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = prices.ewm(span=fast, adjust=False).mean()
    ema_slow = prices.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line, macd_line - signal_line


def calculate_bollinger(prices: pd.Series, period=20, std_dev=2.0):
    sma = prices.rolling(window=period).mean()
    std = prices.rolling(window=period).std()
    return sma + std_dev * std, sma, sma - std_dev * std


def calculate_stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k=14, d=3):
    ll = low.rolling(k).min()
    hh = high.rolling(k).max()
    pct_k = 100 * (close - ll) / (hh - ll)
    return pct_k, pct_k.rolling(d).mean()


def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period=14) -> pd.Series:
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def calculate_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff())
    direction.iloc[0] = 0
    return (direction * volume).cumsum()


def to_series(hist: pd.DataFrame, column: str) -> List[Dict]:
    result = []
    for idx, row in hist.iterrows():
        val = row.get(column)
        if val is not None and not pd.isna(val):
            result.append({"time": idx.strftime("%Y-%m-%d"), "value": round(float(val), 6)})
    return result


# ─── ETF Performance Metrics ─────────────────────────────────────────────────

def calculate_performance_metrics(hist: pd.DataFrame, risk_free_rate: float = 0.053) -> Dict:
    """Sharpe, Sortino, Calmar, Max Drawdown, CAGR, VaR, volatility, win rate."""
    if len(hist) < 30:
        return {}
    try:
        daily_returns = hist["Close"].pct_change().dropna()
        n_days = len(daily_returns)
        years = n_days / 252

        # CAGR
        total_ret = float(hist["Close"].iloc[-1] / hist["Close"].iloc[0]) - 1
        cagr = float((1 + total_ret) ** (1 / years) - 1) if years > 0 else 0.0

        # Annualized volatility
        ann_vol = float(daily_returns.std() * np.sqrt(252))

        # Sharpe ratio
        daily_rf = risk_free_rate / 252
        excess = daily_returns - daily_rf
        sharpe = float((excess.mean() / excess.std()) * np.sqrt(252)) if excess.std() > 0 else 0.0

        # Sortino ratio (downside deviation)
        neg_ret = daily_returns[daily_returns < daily_rf]
        dn_std = float(neg_ret.std() * np.sqrt(252)) if len(neg_ret) > 5 else ann_vol
        sortino = float((cagr - risk_free_rate) / dn_std) if dn_std > 0 else 0.0

        # Max drawdown
        cum = (1 + daily_returns).cumprod()
        rolling_max = cum.cummax()
        dd_series = (cum - rolling_max) / rolling_max
        max_dd = float(dd_series.min())

        # Calmar ratio
        calmar = float(cagr / abs(max_dd)) if max_dd != 0 else 0.0

        # VaR 95% & CVaR 95%
        var_95 = float(np.percentile(daily_returns, 5))
        cvar_95 = float(daily_returns[daily_returns <= var_95].mean()) if len(daily_returns[daily_returns <= var_95]) > 0 else var_95

        # Win rate & profit factor
        wins = daily_returns[daily_returns > 0]
        losses = daily_returns[daily_returns < 0]
        win_rate = float(len(wins) / n_days)
        profit_factor = float(wins.sum() / abs(losses.sum())) if losses.sum() != 0 else 999.0

        # Skewness & kurtosis (positive skew better for longs)
        skewness = float(daily_returns.skew())
        kurt = float(daily_returns.kurt())

        # Monthly returns for consistency
        monthly = hist["Close"].resample("ME").last().pct_change().dropna()
        pos_months = int((monthly > 0).sum())
        total_months = int(len(monthly))

        return {
            "return_1y": round(cagr, 4),
            "total_return": round(total_ret, 4),
            "annualized_volatility": round(ann_vol, 4),
            "sharpe_ratio": round(sharpe, 3),
            "sortino_ratio": round(sortino, 3),
            "calmar_ratio": round(calmar, 3),
            "max_drawdown": round(max_dd, 4),
            "var_95": round(var_95, 4),
            "cvar_95": round(cvar_95, 4),
            "win_rate": round(win_rate, 4),
            "profit_factor": round(min(profit_factor, 99.0), 3),
            "skewness": round(skewness, 3),
            "kurtosis": round(kurt, 3),
            "positive_months": pos_months,
            "total_months": total_months,
        }
    except Exception as e:
        print(f"Performance metrics error: {e}")
        return {}


def calculate_benchmark_comparison(hist: pd.DataFrame, symbol: str, bench_sym: str = "SPY") -> Dict:
    """Beta, alpha, tracking error, R², information ratio vs benchmark."""
    if symbol == bench_sym:
        return {}
    try:
        bench_ticker = yf.Ticker(bench_sym, session=_session)
        bench = bench_ticker.history(period="1y", auto_adjust=True)
        if bench.empty:
            return {}
        bench.index = bench.index.tz_localize(None) if bench.index.tz else bench.index

        common = hist.index.intersection(bench.index)
        if len(common) < 60:
            return {}

        etf_r = hist.loc[common, "Close"].pct_change().dropna()
        bench_r = bench.loc[common, "Close"].pct_change().dropna()
        idx = etf_r.index.intersection(bench_r.index)
        etf_r, bench_r = etf_r.loc[idx], bench_r.loc[idx]

        # Beta
        cov_matrix = np.cov(etf_r, bench_r)
        beta = float(cov_matrix[0, 1] / cov_matrix[1, 1]) if cov_matrix[1, 1] > 0 else 1.0

        # Jensen's alpha (annualized)
        rf_daily = 0.053 / 252
        alpha_daily = (etf_r.mean() - rf_daily) - beta * (bench_r.mean() - rf_daily)
        alpha_ann = float(alpha_daily * 252)

        # Correlation & R²
        corr = float(etf_r.corr(bench_r))
        r2 = round(corr ** 2, 4)

        # Tracking error & information ratio
        diff = etf_r - bench_r
        te = float(diff.std() * np.sqrt(252))
        ir = float((diff.mean() * 252) / te) if te > 0 else 0.0

        # 1-year cumulative returns
        etf_cum = float((etf_r + 1).prod() - 1)
        bench_cum = float((bench_r + 1).prod() - 1)

        # Up/Down capture ratios
        up_days = bench_r[bench_r > 0]
        dn_days = bench_r[bench_r < 0]
        up_capture = float((etf_r[up_days.index].mean() / up_days.mean()) * 100) if len(up_days) > 0 and up_days.mean() != 0 else 100.0
        dn_capture = float((etf_r[dn_days.index].mean() / dn_days.mean()) * 100) if len(dn_days) > 0 and dn_days.mean() != 0 else 100.0

        return {
            "benchmark": bench_sym,
            "beta": round(beta, 3),
            "alpha_annualized": round(alpha_ann, 4),
            "correlation": round(corr, 3),
            "r_squared": r2,
            "tracking_error": round(te, 4),
            "information_ratio": round(ir, 3),
            "etf_return_1y": round(etf_cum, 4),
            "benchmark_return_1y": round(bench_cum, 4),
            "relative_performance": round(etf_cum - bench_cum, 4),
            "up_capture": round(up_capture, 1),
            "down_capture": round(dn_capture, 1),
        }
    except Exception as e:
        print(f"Benchmark comparison error: {e}")
        return {}


def get_etf_holdings(ticker: yf.Ticker) -> Dict:
    """Fetch top holdings, sector weights, asset classes from funds_data."""
    result: Dict[str, Any] = {
        "top_holdings": [],
        "sector_weightings": {},
        "asset_classes": {},
        "equity_holdings": {},
        "bond_holdings": {},
    }
    try:
        fd = ticker.funds_data
        if fd is None:
            return result

        # Top holdings
        try:
            th = fd.top_holdings
            if th is not None and not th.empty:
                result["top_holdings"] = [
                    {
                        "symbol": str(row.get("Symbol", idx)),
                        "name": str(row.get("Name", row.get("Holding", idx))),
                        "weight": round(float(row.get("% Assets", row.get("Percent Assets", 0))) , 4),
                    }
                    for idx, row in th.iterrows()
                ][:15]
        except Exception:
            pass

        # Sector weights
        try:
            sw = fd.sector_weightings
            if sw:
                result["sector_weightings"] = {k: round(float(v), 4) for k, v in sw.items() if v}
        except Exception:
            pass

        # Asset classes
        try:
            ac = fd.asset_classes
            if ac:
                result["asset_classes"] = {k: round(float(v), 4) for k, v in ac.items() if v}
        except Exception:
            pass

        # Equity holdings aggregate metrics
        try:
            eh = fd.equity_holdings
            if eh is not None and not eh.empty:
                row = eh.iloc[0] if len(eh) > 0 else None
                if row is not None:
                    result["equity_holdings"] = {k: v for k, v in row.items() if v is not None and not (isinstance(v, float) and np.isnan(v))}
        except Exception:
            pass

        # Bond holdings
        try:
            bh = fd.bond_holdings
            if bh is not None and not bh.empty:
                row = bh.iloc[0] if len(bh) > 0 else None
                if row is not None:
                    result["bond_holdings"] = {k: v for k, v in row.items() if v is not None and not (isinstance(v, float) and np.isnan(v))}
        except Exception:
            pass

    except Exception as e:
        print(f"ETF holdings error: {e}")
    return result


# ─── Scoring ──────────────────────────────────────────────────────────────────

def etf_fundamental_score(info: Dict, perf: Dict, bench: Dict) -> float:
    scores = []

    # 1. Expense ratio (25% weight — lower is always better)
    er = info.get("annualReportExpenseRatio") or info.get("expenseRatio") or 0
    if er and er > 0:
        if er < 0.0005: scores.extend([1.0, 1.0])    # < 0.05% (index funds)
        elif er < 0.001: scores.extend([0.95, 0.95])  # 0.05-0.1%
        elif er < 0.002: scores.extend([0.85, 0.85])  # 0.1-0.2%
        elif er < 0.005: scores.extend([0.70, 0.70])  # 0.2-0.5%
        elif er < 0.010: scores.extend([0.50, 0.50])  # 0.5-1%
        else: scores.extend([0.20, 0.20])

    # 2. AUM (20% weight — liquidity + stability)
    aum = info.get("totalAssets")
    if aum:
        if aum > 50e9: scores.extend([1.0, 1.0])
        elif aum > 10e9: scores.extend([0.9, 0.9])
        elif aum > 1e9: scores.extend([0.75, 0.75])
        elif aum > 100e6: scores.extend([0.55, 0.55])
        elif aum > 10e6: scores.extend([0.35, 0.35])
        else: scores.extend([0.15, 0.15])

    # 3. Sharpe ratio (25% weight)
    sharpe = perf.get("sharpe_ratio")
    if sharpe is not None:
        if sharpe > 2.0: scores.extend([1.0, 1.0, 1.0])
        elif sharpe > 1.5: scores.extend([0.85, 0.85, 0.85])
        elif sharpe > 1.0: scores.extend([0.70, 0.70, 0.70])
        elif sharpe > 0.5: scores.extend([0.55, 0.55, 0.55])
        elif sharpe > 0: scores.extend([0.40, 0.40, 0.40])
        else: scores.extend([0.15, 0.15, 0.15])

    # 4. Max drawdown (15% weight)
    max_dd = perf.get("max_drawdown")
    if max_dd is not None:
        dd = abs(max_dd)
        if dd < 0.05: scores.extend([1.0, 1.0])
        elif dd < 0.10: scores.extend([0.85, 0.85])
        elif dd < 0.15: scores.extend([0.75, 0.75])
        elif dd < 0.20: scores.extend([0.60, 0.60])
        elif dd < 0.30: scores.extend([0.45, 0.45])
        elif dd < 0.40: scores.extend([0.30, 0.30])
        else: scores.extend([0.10, 0.10])

    # 5. 1Y return vs risk-free (15% weight)
    ret_1y = perf.get("return_1y") or info.get("ytdReturn")
    if ret_1y is not None:
        if ret_1y > 0.30: scores.extend([0.95, 0.95])
        elif ret_1y > 0.15: scores.extend([0.80, 0.80])
        elif ret_1y > 0.05: scores.extend([0.65, 0.65])
        elif ret_1y > 0: scores.extend([0.50, 0.50])
        else: scores.extend([0.25, 0.25])

    # 6. Sortino ratio bonus
    sortino = perf.get("sortino_ratio")
    if sortino is not None:
        if sortino > 2.0: scores.append(1.0)
        elif sortino > 1.0: scores.append(0.75)
        elif sortino > 0: scores.append(0.5)
        else: scores.append(0.2)

    # 7. Calmar ratio bonus
    calmar = perf.get("calmar_ratio")
    if calmar is not None:
        if calmar > 2.0: scores.append(1.0)
        elif calmar > 1.0: scores.append(0.75)
        elif calmar > 0.5: scores.append(0.55)
        elif calmar > 0: scores.append(0.35)
        else: scores.append(0.15)

    # 8. Alpha (positive alpha = outperforming benchmark)
    alpha = bench.get("alpha_annualized")
    if alpha is not None:
        if alpha > 0.05: scores.append(0.9)
        elif alpha > 0: scores.append(0.65)
        elif alpha > -0.05: scores.append(0.45)
        else: scores.append(0.2)

    # 9. Up/Down capture (>100 up, <100 down = ideal)
    up_cap = bench.get("up_capture")
    dn_cap = bench.get("down_capture")
    if up_cap is not None and dn_cap is not None:
        capture_ratio = (up_cap / dn_cap) if dn_cap > 0 else 1.0
        if capture_ratio > 1.2: scores.append(0.9)
        elif capture_ratio > 1.0: scores.append(0.7)
        elif capture_ratio > 0.8: scores.append(0.5)
        else: scores.append(0.3)

    return sum(scores) / len(scores) if scores else 0.5


def stock_fundamental_score(info: Dict) -> float:
    scores = []
    pe = info.get("trailingPE") or info.get("forwardPE")
    if pe and 0 < pe < 200:
        if pe < 15: scores.append(0.9)
        elif pe < 25: scores.append(0.7)
        elif pe < 40: scores.append(0.5)
        elif pe < 60: scores.append(0.3)
        else: scores.append(0.1)
    for key, thresholds in [
        ("revenueGrowth", [(0.25, 0.9), (0.15, 0.75), (0.05, 0.55), (0.0, 0.4)]),
        ("earningsGrowth", [(0.25, 0.9), (0.10, 0.7), (0.0, 0.5)]),
        ("profitMargins", [(0.25, 0.9), (0.15, 0.75), (0.05, 0.55), (0.0, 0.35)]),
    ]:
        v = info.get(key)
        if v is not None:
            for thresh, sc in thresholds:
                if v >= thresh:
                    scores.append(sc)
                    break
            else:
                scores.append(0.15)
    de = info.get("debtToEquity")
    if de is not None:
        scores.append(0.9 if de < 30 else 0.7 if de < 80 else 0.5 if de < 150 else 0.2)
    rec = info.get("recommendationMean")
    if rec is not None and 1 <= rec <= 5:
        scores.append(max(0.0, (5 - rec) / 4))
    cr = info.get("currentRatio")
    if cr is not None:
        scores.append(0.9 if cr > 2 else 0.7 if cr > 1.5 else 0.5 if cr > 1 else 0.2)
    return sum(scores) / len(scores) if scores else 0.5


# ─── Signal Generation ────────────────────────────────────────────────────────

def generate_signals(hist: pd.DataFrame) -> List[Dict]:
    signals = []
    if len(hist) < 2:
        return signals

    latest = hist.iloc[-1]
    prev = hist.iloc[-2]
    price = float(latest["Close"])

    def _safe(col):
        v = latest.get(col)
        return None if (v is None or (isinstance(v, float) and np.isnan(v))) else float(v)

    def _safep(col):
        v = prev.get(col)
        return None if (v is None or (isinstance(v, float) and np.isnan(v))) else float(v)

    rsi = _safe("RSI")
    if rsi is not None:
        if rsi < 30:
            signals.append({"type": "BULLISH", "indicator": "RSI", "name": "Oversold", "strength": 3,
                            "detail": f"RSI={rsi:.1f} — deeply oversold; potential reversal"})
        elif rsi > 70:
            signals.append({"type": "BEARISH", "indicator": "RSI", "name": "Overbought", "strength": 3,
                            "detail": f"RSI={rsi:.1f} — overbought; possible pullback"})
        elif rsi < 40:
            signals.append({"type": "BULLISH", "indicator": "RSI", "name": "Near Oversold", "strength": 1,
                            "detail": f"RSI={rsi:.1f} — approaching oversold zone"})
        elif rsi > 60:
            signals.append({"type": "BEARISH", "indicator": "RSI", "name": "Near Overbought", "strength": 1,
                            "detail": f"RSI={rsi:.1f} — approaching overbought zone"})
        else:
            signals.append({"type": "NEUTRAL", "indicator": "RSI", "name": "Neutral", "strength": 0,
                            "detail": f"RSI={rsi:.1f} — neutral momentum"})

    macd = _safe("MACD"); macd_sig = _safe("MACD_signal")
    prev_macd = _safep("MACD"); prev_macd_sig = _safep("MACD_signal")
    if macd is not None and macd_sig is not None:
        cross_up = macd > macd_sig and (prev_macd is None or prev_macd <= prev_macd_sig)
        cross_dn = macd < macd_sig and (prev_macd is None or prev_macd >= prev_macd_sig)
        if cross_up:
            signals.append({"type": "BULLISH", "indicator": "MACD", "name": "Bullish Crossover", "strength": 3,
                            "detail": "MACD crossed above signal — strong buy signal"})
        elif cross_dn:
            signals.append({"type": "BEARISH", "indicator": "MACD", "name": "Bearish Crossover", "strength": 3,
                            "detail": "MACD crossed below signal — strong sell signal"})
        elif macd > macd_sig:
            signals.append({"type": "BULLISH", "indicator": "MACD", "name": "Positive", "strength": 1,
                            "detail": "MACD above signal — bullish momentum"})
        else:
            signals.append({"type": "BEARISH", "indicator": "MACD", "name": "Negative", "strength": 1,
                            "detail": "MACD below signal — bearish momentum"})

    sma20 = _safe("SMA20"); sma50 = _safe("SMA50"); sma200 = _safe("SMA200")
    prev_sma50 = _safep("SMA50"); prev_sma200 = _safep("SMA200")
    if sma50 and sma200 and prev_sma50 and prev_sma200:
        if sma50 > sma200 and prev_sma50 <= prev_sma200:
            signals.append({"type": "BULLISH", "indicator": "MA", "name": "Golden Cross", "strength": 3,
                            "detail": "SMA50 crossed above SMA200 — major bullish signal"})
        elif sma50 < sma200 and prev_sma50 >= prev_sma200:
            signals.append({"type": "BEARISH", "indicator": "MA", "name": "Death Cross", "strength": 3,
                            "detail": "SMA50 crossed below SMA200 — major bearish signal"})
        elif sma50 > sma200:
            signals.append({"type": "BULLISH", "indicator": "MA", "name": "Above SMA200", "strength": 2,
                            "detail": "SMA50 > SMA200 — long-term uptrend intact"})
        else:
            signals.append({"type": "BEARISH", "indicator": "MA", "name": "Below SMA200", "strength": 2,
                            "detail": "SMA50 < SMA200 — long-term downtrend"})

    if sma20 and sma50:
        if price > sma20 and price > sma50:
            signals.append({"type": "BULLISH", "indicator": "MA", "name": "Above SMA20/50", "strength": 2,
                            "detail": "Price above SMA20 and SMA50 — short-term uptrend"})
        elif price < sma20 and price < sma50:
            signals.append({"type": "BEARISH", "indicator": "MA", "name": "Below SMA20/50", "strength": 2,
                            "detail": "Price below SMA20 and SMA50 — short-term downtrend"})

    bb_u = _safe("BB_upper"); bb_l = _safe("BB_lower"); bb_m = _safe("BB_middle")
    if bb_u and bb_l and bb_m:
        bw = (bb_u - bb_l) / bb_m
        if price < bb_l:
            signals.append({"type": "BULLISH", "indicator": "BB", "name": "Below Lower Band", "strength": 3,
                            "detail": "Price below lower Bollinger Band — mean reversion likely upward"})
        elif price > bb_u:
            signals.append({"type": "BEARISH", "indicator": "BB", "name": "Above Upper Band", "strength": 3,
                            "detail": "Price above upper Bollinger Band — mean reversion likely downward"})
        elif bw < 0.08:
            signals.append({"type": "NEUTRAL", "indicator": "BB", "name": "BB Squeeze", "strength": 1,
                            "detail": "Bollinger Band squeeze — breakout incoming"})
        else:
            pct_b = (price - bb_l) / (bb_u - bb_l)
            if pct_b < 0.35:
                signals.append({"type": "BULLISH", "indicator": "BB", "name": "Lower Half BB", "strength": 1,
                                "detail": f"Price in lower half of Bollinger Bands ({pct_b*100:.0f}%B)"})
            elif pct_b > 0.65:
                signals.append({"type": "BEARISH", "indicator": "BB", "name": "Upper Half BB", "strength": 1,
                                "detail": f"Price in upper half of Bollinger Bands ({pct_b*100:.0f}%B)"})

    avg_vol = hist["Volume"].rolling(20).mean().iloc[-1]
    curr_vol = float(latest["Volume"])
    price_chg = float(latest["Close"]) - float(prev["Close"])
    if not np.isnan(avg_vol) and curr_vol > avg_vol * 1.5:
        ratio = curr_vol / avg_vol
        if price_chg > 0:
            signals.append({"type": "BULLISH", "indicator": "Volume", "name": "High-Volume Rally", "strength": 2,
                            "detail": f"Volume {ratio:.1f}x avg on up day — strong buying conviction"})
        else:
            signals.append({"type": "BEARISH", "indicator": "Volume", "name": "High-Volume Selloff", "strength": 2,
                            "detail": f"Volume {ratio:.1f}x avg on down day — strong selling pressure"})

    stoch_k = _safe("Stoch_K"); stoch_d = _safe("Stoch_D")
    if stoch_k is not None and stoch_d is not None:
        prev_k = _safep("Stoch_K"); prev_d = _safep("Stoch_D")
        if stoch_k < 20:
            signals.append({"type": "BULLISH", "indicator": "Stoch", "name": "Stoch Oversold", "strength": 2,
                            "detail": f"Stochastic K={stoch_k:.1f} — oversold"})
        elif stoch_k > 80:
            signals.append({"type": "BEARISH", "indicator": "Stoch", "name": "Stoch Overbought", "strength": 2,
                            "detail": f"Stochastic K={stoch_k:.1f} — overbought"})
        if prev_k and prev_d:
            if stoch_k > stoch_d and prev_k <= prev_d and stoch_k < 80:
                signals.append({"type": "BULLISH", "indicator": "Stoch", "name": "Stoch Bullish Cross", "strength": 2,
                                "detail": "Stochastic K crossed above D — bullish"})
            elif stoch_k < stoch_d and prev_k >= prev_d and stoch_k > 20:
                signals.append({"type": "BEARISH", "indicator": "Stoch", "name": "Stoch Bearish Cross", "strength": 2,
                                "detail": "Stochastic K crossed below D — bearish"})

    return signals


def get_recommendation(signals: List[Dict], fundamental_score: float = 0.5) -> Dict:
    bull = sum(s["strength"] for s in signals if s["type"] == "BULLISH")
    bear = sum(s["strength"] for s in signals if s["type"] == "BEARISH")
    total = bull + bear
    tech_score = (bull / total * 100) if total > 0 else 50.0
    combined = tech_score * 0.5 + fundamental_score * 100 * 0.5

    if combined >= 72:   action, label = "BUY",        "Strong Buy"
    elif combined >= 60: action, label = "ACCUMULATE", "Accumulate"
    elif combined >= 45: action, label = "HOLD",       "Hold / Watch"
    elif combined >= 33: action, label = "REDUCE",     "Reduce"
    else:                action, label = "SELL",        "Sell / Avoid"

    return {
        "action": action, "label": label,
        "confidence": min(95, int(abs(combined - 50) * 2 + 50)),
        "technical_score": round(tech_score, 1),
        "fundamental_score": round(fundamental_score * 100, 1),
        "combined_score": round(combined, 1),
        "bullish_count": len([s for s in signals if s["type"] == "BULLISH"]),
        "bearish_count": len([s for s in signals if s["type"] == "BEARISH"]),
        "neutral_count": len([s for s in signals if s["type"] == "NEUTRAL"]),
    }


# ─── AI Analysis ─────────────────────────────────────────────────────────────

def get_ai_analysis(symbol: str, info: Dict, hist: pd.DataFrame, signals: List[Dict],
                    rec: Dict, is_etf: bool = False, etf_data: Dict = None) -> Optional[Dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not ANTHROPIC_AVAILABLE:
        return None
    try:
        client = anthropic.Anthropic(api_key=api_key)
        price = float(hist["Close"].iloc[-1])
        rsi_val = hist["RSI"].iloc[-1]
        rsi_str = f"{rsi_val:.1f}" if not pd.isna(rsi_val) else "N/A"
        sma50 = float(hist["SMA50"].iloc[-1]) if not pd.isna(hist["SMA50"].iloc[-1]) else None
        sma200 = float(hist["SMA200"].iloc[-1]) if not pd.isna(hist["SMA200"].iloc[-1]) else None

        if is_etf and etf_data:
            perf = etf_data.get("performance_metrics", {})
            bench = etf_data.get("benchmark_comparison", {})
            prompt = f"""You are a senior ETF strategist. Analyze {symbol} ({info.get('longName', symbol)}).

ETF Overview:
- Category: {info.get('category', 'N/A')}, Fund Family: {info.get('fundFamily', 'N/A')}
- AUM: ${info.get('totalAssets', 0)/1e9:.1f}B, Expense Ratio: {(info.get('annualReportExpenseRatio') or info.get('expenseRatio') or 0)*100:.2f}%
- Distribution Yield: {(info.get('yield') or 0)*100:.2f}%

Technical:
- Price: ${price:.2f}, RSI(14): {rsi_str}
- vs SMA50: {"Above" if sma50 and price > sma50 else "Below"}, vs SMA200: {"Above" if sma200 and price > sma200 else "Below"}
- Technical Score: {rec['technical_score']}/100

Performance (1Y):
- CAGR: {perf.get('return_1y', 0)*100:.1f}%, Sharpe: {perf.get('sharpe_ratio', 'N/A')}, Sortino: {perf.get('sortino_ratio', 'N/A')}
- Max Drawdown: {perf.get('max_drawdown', 0)*100:.1f}%, Calmar: {perf.get('calmar_ratio', 'N/A')}
- Win Rate: {perf.get('win_rate', 0)*100:.0f}%, Volatility: {perf.get('annualized_volatility', 0)*100:.1f}%

vs {bench.get('benchmark', 'SPY')}:
- Beta: {bench.get('beta', 'N/A')}, Alpha: {bench.get('alpha_annualized', 0)*100:.2f}%
- Tracking Error: {bench.get('tracking_error', 0)*100:.1f}%, R²: {bench.get('r_squared', 'N/A')}
- Up Capture: {bench.get('up_capture', 'N/A')}%, Down Capture: {bench.get('down_capture', 'N/A')}%

Top Signals: {', '.join(f"{s['type']}: {s['name']}" for s in signals[:5])}
Verdict: {rec['label']} (Score: {rec['combined_score']}/100)

Return ONLY valid JSON (no markdown):
{{
  "technical_summary": "2-3 sentences on chart pattern and momentum",
  "fundamental_summary": "2-3 sentences evaluating this ETF's quality (cost, performance, risk-adjusted returns)",
  "investment_thesis": "1-2 sentence case for owning this ETF",
  "key_risks": ["risk1", "risk2", "risk3"],
  "key_catalysts": ["catalyst1", "catalyst2"],
  "entry_strategy": "Specific price/conditions for entering this ETF position",
  "price_target_6m": "6-month price level with reasoning based on trend and technicals",
  "when_to_buy": "If not now, what market conditions or price levels should trigger a buy"
}}"""
        else:
            prompt = f"""You are a senior equity analyst. Analyze {symbol} ({info.get('longName', symbol)}).

Technical:
- Price: ${price:.2f}, RSI(14): {rsi_str}
- vs SMA50: {"Above" if sma50 and price > sma50 else "Below"} (${sma50:.2f if sma50 else 0:.2f})
- vs SMA200: {"Above" if sma200 and price > sma200 else "Below"} (${sma200:.2f if sma200 else 0:.2f})
- Technical Score: {rec['technical_score']}/100

Fundamental:
- Sector: {info.get('sector','N/A')}, Industry: {info.get('industry','N/A')}
- P/E: {info.get('trailingPE','N/A')}, Forward P/E: {info.get('forwardPE','N/A')}
- Revenue Growth: {f"{info.get('revenueGrowth',0)*100:.1f}%" if info.get('revenueGrowth') else 'N/A'}
- Profit Margin: {f"{info.get('profitMargins',0)*100:.1f}%" if info.get('profitMargins') else 'N/A'}
- Analyst Target: ${info.get('targetMeanPrice','N/A')}, Rec: {info.get('recommendationKey','N/A')}
- Fundamental Score: {rec['fundamental_score']}/100

Top Signals: {', '.join(f"{s['type']}: {s['name']}" for s in signals[:6])}
Verdict: {rec['label']} (Score: {rec['combined_score']}/100)

Return ONLY valid JSON (no markdown):
{{
  "technical_summary": "2-3 sentences on chart pattern and momentum",
  "fundamental_summary": "2-3 sentences on valuation, growth, and financial health",
  "investment_thesis": "1-2 sentence bull case",
  "key_risks": ["risk1", "risk2", "risk3"],
  "key_catalysts": ["catalyst1", "catalyst2"],
  "entry_strategy": "Specific price levels or conditions to consider buying",
  "price_target_6m": "6-month price target with reasoning",
  "when_to_buy": "If not now, what conditions/price should trigger a buy"
}}"""

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system="You are an expert financial analyst. Return only valid JSON, no markdown fences.",
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        print(f"AI analysis error for {symbol}: {e}")
    return None


# ─── Main Endpoint ────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "cached_symbols": list(_cache.keys())}

@app.delete("/api/cache")
async def clear_cache():
    _cache.clear(); _cache_ts.clear()
    return {"status": "cache cleared"}


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    results = {}
    for raw_symbol in request.symbols:
        symbol = raw_symbol.upper().strip()
        if not symbol:
            continue
        # Return cached result if fresh
        cached = _cache_get(symbol)
        if cached:
            results[symbol] = cached
            continue

        try:
            ticker = yf.Ticker(symbol, session=_session)

            # Fetch history — try download() first (different rate-limit path), fall back to history()
            hist = None
            for attempt in range(4):
                try:
                    dl = yf.download(symbol, period="1y", auto_adjust=True,
                                     progress=False, session=_session)
                    if not dl.empty:
                        # download() returns MultiIndex columns when single ticker
                        if isinstance(dl.columns, pd.MultiIndex):
                            dl.columns = dl.columns.droplevel(1)
                        dl.index = dl.index.tz_localize(None) if dl.index.tz else dl.index
                        hist = dl
                        break
                    time.sleep(3 * (attempt + 1))
                except Exception:
                    # Fallback to history()
                    try:
                        hist = ticker.history(period="1y", auto_adjust=True)
                        if not hist.empty:
                            hist.index = hist.index.tz_localize(None) if hist.index.tz else hist.index
                            break
                    except Exception as e2:
                        err_str = str(e2).lower()
                        wait = 15 * (2 ** attempt) if ("rate" in err_str or "too many" in err_str) else 5
                        print(f"Rate limited on {symbol}, waiting {wait}s...")
                        time.sleep(wait)
            if hist is None or hist.empty:
                results[symbol] = {"error": f"No data found for '{symbol}'", "symbol": symbol}
                continue

            # Compute technical indicators
            hist["SMA20"]  = hist["Close"].rolling(20).mean()
            hist["SMA50"]  = hist["Close"].rolling(50).mean()
            hist["SMA200"] = hist["Close"].rolling(200).mean()
            hist["EMA12"]  = hist["Close"].ewm(span=12, adjust=False).mean()
            hist["EMA26"]  = hist["Close"].ewm(span=26, adjust=False).mean()
            hist["RSI"]    = calculate_rsi(hist["Close"])
            hist["MACD"], hist["MACD_signal"], hist["MACD_hist"] = calculate_macd(hist["Close"])
            hist["BB_upper"], hist["BB_middle"], hist["BB_lower"] = calculate_bollinger(hist["Close"])
            hist["Stoch_K"], hist["Stoch_D"] = calculate_stochastic(hist["High"], hist["Low"], hist["Close"])
            hist["ATR"] = calculate_atr(hist["High"], hist["Low"], hist["Close"])
            hist["OBV"] = calculate_obv(hist["Close"], hist["Volume"])

            candles = [
                {
                    "time": idx.strftime("%Y-%m-%d"),
                    "open": round(float(r["Open"]), 4),
                    "high": round(float(r["High"]), 4),
                    "low": round(float(r["Low"]), 4),
                    "close": round(float(r["Close"]), 4),
                    "volume": int(r["Volume"]),
                }
                for idx, r in hist.iterrows()
            ]

            signals = generate_signals(hist)

            info = {}
            try:
                info = ticker.info or {}
            except Exception:
                pass

            # Detect ETF
            is_etf = info.get("quoteType", "").upper() == "ETF"

            # ETF-specific data
            etf_data: Dict = {}
            if is_etf:
                perf = calculate_performance_metrics(hist)
                bench = calculate_benchmark_comparison(hist, symbol)
                holdings = get_etf_holdings(ticker)
                fscore = etf_fundamental_score(info, perf, bench)
                etf_data = {
                    "performance_metrics": perf,
                    "benchmark_comparison": bench,
                    "holdings": holdings,
                    "expense_ratio": info.get("annualReportExpenseRatio") or info.get("expenseRatio"),
                    "aum": info.get("totalAssets"),
                    "distribution_yield": info.get("yield"),
                    "category": info.get("category"),
                    "fund_family": info.get("fundFamily"),
                    "beta_3y": info.get("beta3Year"),
                    "return_3y": info.get("threeYearAverageReturn"),
                    "return_5y": info.get("fiveYearAverageReturn"),
                    "ytd_return": info.get("ytdReturn"),
                    "nav_price": info.get("navPrice"),
                    "description": (info.get("longBusinessSummary") or "")[:600],
                }
            else:
                fscore = stock_fundamental_score(info)

            rec = get_recommendation(signals, fscore)

            price  = float(hist["Close"].iloc[-1])
            w52h   = float(hist["High"].max())
            w52l   = float(hist["Low"].min())
            sup90  = float(hist.iloc[-90:]["Low"].min())  if len(hist) >= 90 else float(hist["Low"].min())
            res90  = float(hist.iloc[-90:]["High"].max()) if len(hist) >= 90 else float(hist["High"].max())
            fib    = {k: round(w52h - v * (w52h - w52l), 2) for k, v in
                      {"0.236": 0.236, "0.382": 0.382, "0.5": 0.5, "0.618": 0.618, "0.786": 0.786}.items()}

            target_mean = info.get("targetMeanPrice")
            target_high = info.get("targetHighPrice")
            target_low  = info.get("targetLowPrice")
            sma20_val   = float(hist["SMA20"].iloc[-1]) if not pd.isna(hist["SMA20"].iloc[-1]) else price
            atr_val     = float(hist["ATR"].iloc[-1])   if not pd.isna(hist["ATR"].iloc[-1])   else 0

            if rec["action"] in ("BUY", "ACCUMULATE"):
                entry = round(min(price, sma20_val), 2)
                if is_etf:
                    entry_note = (f"Enter near SMA20 (${sma20_val:.2f}) or on a dip to support (${sup90:.2f}). "
                                  f"Stop-loss at ${round(entry - 2*atr_val, 2)}. Use DCA for position building.")
                else:
                    entry_note = f"Buy near current price or SMA20 (${sma20_val:.2f}). Stop-loss at ${round(entry - 2*atr_val, 2)}."
            elif rec["action"] == "HOLD":
                entry = round(sup90 * 1.01, 2)
                entry_note = f"Wait for pullback toward support (${sup90:.2f}) before adding."
            else:
                entry = round(w52l * 1.02, 2)
                entry_note = f"Avoid for now. Revisit near 52-week low (${w52l:.2f}) after trend reversal confirmed."

            news = []
            try:
                for item in (ticker.news or [])[:10]:
                    news.append({
                        "title": item.get("title", ""),
                        "publisher": item.get("publisher", ""),
                        "link": item.get("link", ""),
                        "publishedAt": item.get("providerPublishTime", 0),
                    })
            except Exception:
                pass

            ai = get_ai_analysis(symbol, info, hist, signals, rec, is_etf, etf_data if is_etf else None)

            results[symbol] = {
                "symbol": symbol,
                "is_etf": is_etf,
                "company_name": info.get("longName", symbol),
                "sector": info.get("sector", info.get("category", "N/A")),
                "industry": info.get("industry", info.get("fundFamily", "N/A")),
                "current_price": round(price, 2),
                "currency": info.get("currency", "USD"),
                "market_cap": info.get("marketCap") or info.get("totalAssets"),
                "week52_high": round(w52h, 2),
                "week52_low": round(w52l, 2),
                "technical": {
                    "candles": candles,
                    "indicators": {
                        "sma20": to_series(hist, "SMA20"),
                        "sma50": to_series(hist, "SMA50"),
                        "sma200": to_series(hist, "SMA200"),
                        "ema12": to_series(hist, "EMA12"),
                        "ema26": to_series(hist, "EMA26"),
                        "rsi": to_series(hist, "RSI"),
                        "macd": to_series(hist, "MACD"),
                        "macd_signal": to_series(hist, "MACD_signal"),
                        "macd_hist": to_series(hist, "MACD_hist"),
                        "bb_upper": to_series(hist, "BB_upper"),
                        "bb_middle": to_series(hist, "BB_middle"),
                        "bb_lower": to_series(hist, "BB_lower"),
                        "stoch_k": to_series(hist, "Stoch_K"),
                        "stoch_d": to_series(hist, "Stoch_D"),
                        "atr": to_series(hist, "ATR"),
                        "obv": to_series(hist, "OBV"),
                    },
                    "signals": signals,
                    "support": round(sup90, 2),
                    "resistance": round(res90, 2),
                    "fib_levels": fib,
                    "atr": round(atr_val, 2),
                },
                "fundamental": {
                    # Stock fields
                    "pe_ratio": info.get("trailingPE"),
                    "forward_pe": info.get("forwardPE"),
                    "peg_ratio": info.get("pegRatio"),
                    "pb_ratio": info.get("priceToBook"),
                    "ps_ratio": info.get("priceToSalesTrailing12Months"),
                    "ev_ebitda": info.get("enterpriseToEbitda"),
                    "revenue_growth": info.get("revenueGrowth"),
                    "earnings_growth": info.get("earningsGrowth"),
                    "gross_margins": info.get("grossMargins"),
                    "operating_margins": info.get("operatingMargins"),
                    "profit_margins": info.get("profitMargins"),
                    "roe": info.get("returnOnEquity"),
                    "roa": info.get("returnOnAssets"),
                    "debt_to_equity": info.get("debtToEquity"),
                    "current_ratio": info.get("currentRatio"),
                    "quick_ratio": info.get("quickRatio"),
                    "free_cash_flow": info.get("freeCashflow"),
                    "dividend_yield": info.get("dividendYield"),
                    "eps": info.get("trailingEps"),
                    "forward_eps": info.get("forwardEps"),
                    "book_value": info.get("bookValue"),
                    "revenue": info.get("totalRevenue"),
                    "net_income": info.get("netIncomeToCommon"),
                    "analyst_recommendation": info.get("recommendationKey", "N/A"),
                    "recommendation_mean": info.get("recommendationMean"),
                    "target_high": target_high,
                    "target_low": target_low,
                    "target_mean": target_mean,
                    "analyst_count": info.get("numberOfAnalystOpinions"),
                    "description": (info.get("longBusinessSummary") or "")[:600],
                    "news": news,
                    "fundamental_score": round(fscore * 100, 1),
                },
                "etf_data": etf_data,
                "recommendation": rec,
                "entry_point": {
                    "suggested_price": entry,
                    "note": entry_note,
                    "target_mean": target_mean,
                    "target_high": target_high,
                    "target_low": target_low,
                    "upside_pct": round((target_mean / price - 1) * 100, 1) if target_mean and price else None,
                },
                "ai_analysis": ai,
            }
            _cache_set(symbol, results[symbol])
        except Exception as e:
            results[symbol] = {"error": str(e), "symbol": symbol}

        # Small cooldown between symbols to avoid rate limiting
        if len(request.symbols) > 1:
            time.sleep(3)

    return results


# ─── Serve React Frontend (production) ───────────────────────────────────────
# When deployed, the built React app lives in ./static/
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(_STATIC_DIR):
    # Serve JS/CSS/image assets
    _ASSETS = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    # Serve index.html for all non-API paths (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        static_file = os.path.join(_STATIC_DIR, full_path)
        if os.path.isfile(static_file):
            return FileResponse(static_file)
        return FileResponse(os.path.join(_STATIC_DIR, "index.html"))

