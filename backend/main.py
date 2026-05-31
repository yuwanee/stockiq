from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd
import numpy as np
import os, json, re, time, requests

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="StockIQ API")

_ENV = os.environ.get("ENVIRONMENT", "development")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _ENV == "production" else ["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    symbols: List[str]


# ─── Direct Yahoo Finance Client ──────────────────────────────────────────────

class YFClient:
    """Browser-authenticated Yahoo Finance client — works on cloud servers."""

    BASE1 = "https://query1.finance.yahoo.com"
    BASE2 = "https://query2.finance.yahoo.com"

    def __init__(self):
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
        })
        self._crumb: Optional[str] = None
        self._crumb_for: str = ""

    def _get_crumb(self, symbol: str) -> bool:
        """Fetch cookies + crumb from Yahoo Finance page (extracted from HTML)."""
        if self._crumb and self._crumb_for == symbol:
            return True
        try:
            r = self._session.get(
                f"https://finance.yahoo.com/quote/{symbol}",
                timeout=15
            )
            m = re.search(r'"crumb":"([^"]+)"', r.text)
            if m:
                self._crumb = m.group(1).encode().decode("unicode_escape")
                self._crumb_for = symbol
                return True
        except Exception as e:
            print(f"Crumb fetch failed: {e}")
        return False

    def _raw(self, v: Any) -> Any:
        """Unwrap {raw, fmt} Yahoo Finance value format."""
        if isinstance(v, dict):
            return v.get("raw")
        return v

    def get_history(self, symbol: str, days: int = 375) -> pd.DataFrame:
        """Fetch daily OHLCV via Yahoo Finance chart API."""
        self._get_crumb(symbol)
        end_ts = int(time.time())
        start_ts = end_ts - days * 86400
        params = {
            "period1": start_ts, "period2": end_ts,
            "interval": "1d", "events": "div,splits",
        }
        if self._crumb:
            params["crumb"] = self._crumb

        for base in [self.BASE1, self.BASE2]:
            for attempt in range(3):
                try:
                    r = self._session.get(
                        f"{base}/v8/finance/chart/{symbol}",
                        params=params, timeout=20
                    )
                    if r.status_code == 200:
                        data = r.json()
                        result = data.get("chart", {}).get("result") or []
                        if result:
                            return self._parse_chart(result[0])
                    elif r.status_code == 401:
                        self._crumb = None
                        self._get_crumb(symbol)
                        if self._crumb:
                            params["crumb"] = self._crumb
                except Exception as e:
                    print(f"History attempt {attempt+1} error: {e}")
                if attempt < 2:
                    time.sleep(3 * (attempt + 1))
        return pd.DataFrame()

    def _parse_chart(self, result: Dict) -> pd.DataFrame:
        timestamps = result["timestamp"]
        q = result["indicators"]["quote"][0]
        adj_list = result["indicators"].get("adjclose") or []
        adj = adj_list[0].get("adjclose") if adj_list else None

        df = pd.DataFrame({
            "Open":   q.get("open"),
            "High":   q.get("high"),
            "Low":    q.get("low"),
            "Close":  adj if adj else q.get("close"),
            "Volume": q.get("volume"),
        }, index=pd.to_datetime(timestamps, unit="s", utc=True).tz_localize(None))
        df["Volume"] = df["Volume"].fillna(0).astype(int)
        return df.dropna(subset=["Close"]).sort_index()

    def get_info(self, symbol: str) -> Dict:
        """Fetch fundamentals via quoteSummary."""
        if not self._crumb:
            self._get_crumb(symbol)

        modules = ",".join([
            "summaryProfile", "financialData", "defaultKeyStatistics",
            "quoteType", "price", "summaryDetail", "recommendationTrend",
            "assetProfile", "topHoldings",
        ])
        params = {"modules": modules, "formatted": "false"}
        if self._crumb:
            params["crumb"] = self._crumb

        for base in [self.BASE1, self.BASE2]:
            for attempt in range(3):
                try:
                    r = self._session.get(
                        f"{base}/v10/finance/quoteSummary/{symbol}",
                        params=params, timeout=20
                    )
                    if r.status_code == 200:
                        data = r.json()
                        results = (data.get("quoteSummary") or {}).get("result") or []
                        if results:
                            return self._parse_info(results[0])
                    elif r.status_code == 401:
                        self._crumb = None
                        self._get_crumb(symbol)
                        if self._crumb:
                            params["crumb"] = self._crumb
                except Exception as e:
                    print(f"Info attempt {attempt+1} error: {e}")
                if attempt < 2:
                    time.sleep(3)
        return {}

    def _parse_info(self, data: Dict) -> Dict:
        R = self._raw
        info: Dict[str, Any] = {}

        qt = data.get("quoteType") or {}
        info["quoteType"] = qt.get("quoteType", "EQUITY")
        info["longName"]  = qt.get("longName") or qt.get("shortName")
        info["currency"]  = qt.get("currency", "USD")
        info["exchange"]  = qt.get("exchange")

        price = data.get("price") or {}
        info["marketCap"] = R(price.get("marketCap"))
        if not info.get("longName"):
            info["longName"] = price.get("longName") or price.get("shortName")

        for src in ["summaryProfile", "assetProfile"]:
            p = data.get(src) or {}
            info.setdefault("sector",               p.get("sector"))
            info.setdefault("industry",             p.get("industry"))
            info.setdefault("longBusinessSummary",  p.get("longBusinessSummary"))
            info.setdefault("fundFamily",           p.get("fundFamily"))
            info.setdefault("category",             p.get("category"))

        fd = data.get("financialData") or {}
        for k in ["revenueGrowth","earningsGrowth","grossMargins","operatingMargins",
                  "profitMargins","returnOnEquity","returnOnAssets","debtToEquity",
                  "currentRatio","quickRatio","freeCashflow","totalRevenue",
                  "netIncomeToCommon","targetHighPrice","targetLowPrice","targetMeanPrice",
                  "recommendationKey","numberOfAnalystOpinions"]:
            info[k] = R(fd.get(k))

        dks = data.get("defaultKeyStatistics") or {}
        for k in ["trailingPE","forwardPE","pegRatio","priceToBook","bookValue",
                  "trailingEps","forwardEps","enterpriseToEbitda","beta3Year",
                  "threeYearAverageReturn","fiveYearAverageReturn","ytdReturn",
                  "annualReportExpenseRatio","totalAssets","navPrice"]:
            info[k] = R(dks.get(k))

        sd = data.get("summaryDetail") or {}
        for k in ["dividendYield","dividendRate","trailingPE","priceToSalesTrailing12Months",
                  "totalAssets","yield"]:
            if info.get(k) is None:
                info[k] = R(sd.get(k))

        # recommendationMean from trend
        rt = (data.get("recommendationTrend") or {}).get("trend") or []
        if rt:
            t = rt[0]
            total = sum(t.get(x, 0) for x in ["strongBuy","buy","hold","sell","strongSell"])
            if total:
                weighted = (t.get("strongBuy",0)*1 + t.get("buy",0)*2 +
                            t.get("hold",0)*3 + t.get("sell",0)*4 + t.get("strongSell",0)*5)
                info["recommendationMean"] = weighted / total

        # ETF holdings from topHoldings
        th = data.get("topHoldings") or {}
        if th:
            info["_topHoldings"] = [
                {
                    "symbol": h.get("holdingName") or h.get("symbol",""),
                    "name":   h.get("holdingName",""),
                    "weight": R(h.get("holdingPercent")) or 0,
                }
                for h in (th.get("holdings") or [])[:15]
            ]
            info["_equityHoldings"] = {
                k: R(v) for k, v in (th.get("equityHoldings") or {}).items() if v
            }
            info["_sectorWeightings"] = {}
            for sw in (th.get("sectorWeightings") or []):
                for k, v in sw.items():
                    val = R(v)
                    if val:
                        info["_sectorWeightings"][k] = val
            info["_assetClasses"] = {
                "stocks":    R(th.get("stockPosition")),
                "bonds":     R(th.get("bondPosition")),
                "cash":      R(th.get("cashPosition")),
                "other":     R(th.get("otherPosition")),
                "preferred": R(th.get("preferredPosition")),
            }

        return info

    def get_news(self, symbol: str) -> List[Dict]:
        try:
            r = self._session.get(
                f"{self.BASE1}/v1/finance/search",
                params={"q": symbol, "newsCount": 10},
                timeout=10
            )
            if r.status_code == 200:
                return [
                    {
                        "title": n.get("title",""),
                        "publisher": n.get("publisher",""),
                        "link": n.get("link",""),
                        "publishedAt": n.get("providerPublishTime", 0),
                    }
                    for n in r.json().get("news", [])[:10]
                ]
        except Exception:
            pass
        return []


# Singleton client + 30-min cache
_yf = YFClient()
_cache: Dict[str, Dict] = {}
_cache_ts: Dict[str, float] = {}
CACHE_TTL = 1800

def _cache_get(symbol: str) -> Optional[Dict]:
    if symbol in _cache and time.time() - _cache_ts.get(symbol, 0) < CACHE_TTL:
        return _cache[symbol]
    return None

def _cache_set(symbol: str, data: Dict) -> None:
    _cache[symbol] = data
    _cache_ts[symbol] = time.time()


# ─── Technical Indicators ────────────────────────────────────────────────────

def calc_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    delta = prices.diff()
    gain = delta.where(delta > 0, 0.0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean()
    return 100 - (100 / (1 + gain / loss))

def calc_macd(prices: pd.Series, fast=12, slow=26, signal=9):
    ef = prices.ewm(span=fast, adjust=False).mean()
    es = prices.ewm(span=slow, adjust=False).mean()
    m = ef - es
    s = m.ewm(span=signal, adjust=False).mean()
    return m, s, m - s

def calc_boll(prices: pd.Series, period=20, k=2.0):
    sma = prices.rolling(period).mean()
    std = prices.rolling(period).std()
    return sma + k*std, sma, sma - k*std

def calc_stoch(high, low, close, kp=14, dp=3):
    ll = low.rolling(kp).min(); hh = high.rolling(kp).max()
    k = 100*(close - ll)/(hh - ll)
    return k, k.rolling(dp).mean()

def calc_atr(high, low, close, period=14):
    tr = pd.concat([high-low, (high-close.shift()).abs(), (low-close.shift()).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def calc_obv(close, volume):
    d = np.sign(close.diff()); d.iloc[0] = 0
    return (d * volume).cumsum()

def to_series(hist: pd.DataFrame, col: str) -> List[Dict]:
    return [{"time": idx.strftime("%Y-%m-%d"), "value": round(float(v), 6)}
            for idx, v in hist[col].items() if not pd.isna(v)]


# ─── Signals & Scoring ────────────────────────────────────────────────────────

def generate_signals(hist: pd.DataFrame) -> List[Dict]:
    if len(hist) < 2: return []
    lat, prv = hist.iloc[-1], hist.iloc[-2]
    price = float(lat["Close"])

    def _s(col, row=None):
        v = (lat if row is None else row).get(col)
        return None if (v is None or (isinstance(v, float) and np.isnan(v))) else float(v)

    sigs = []

    rsi = _s("RSI")
    if rsi is not None:
        if rsi < 30:    sigs.append({"type":"BULLISH","indicator":"RSI","name":"Oversold","strength":3,"detail":f"RSI={rsi:.1f} — deeply oversold; potential reversal"})
        elif rsi > 70:  sigs.append({"type":"BEARISH","indicator":"RSI","name":"Overbought","strength":3,"detail":f"RSI={rsi:.1f} — overbought; possible pullback"})
        elif rsi < 40:  sigs.append({"type":"BULLISH","indicator":"RSI","name":"Near Oversold","strength":1,"detail":f"RSI={rsi:.1f}"})
        elif rsi > 60:  sigs.append({"type":"BEARISH","indicator":"RSI","name":"Near Overbought","strength":1,"detail":f"RSI={rsi:.1f}"})
        else:           sigs.append({"type":"NEUTRAL","indicator":"RSI","name":"Neutral","strength":0,"detail":f"RSI={rsi:.1f} — neutral momentum"})

    macd, msig = _s("MACD"), _s("MACD_signal")
    pm, pms = _s("MACD", prv), _s("MACD_signal", prv)
    if macd is not None and msig is not None:
        cu = macd > msig and (pm is None or pm <= pms)
        cd = macd < msig and (pm is None or pm >= pms)
        if cu:          sigs.append({"type":"BULLISH","indicator":"MACD","name":"Bullish Crossover","strength":3,"detail":"MACD crossed above signal — strong buy"})
        elif cd:        sigs.append({"type":"BEARISH","indicator":"MACD","name":"Bearish Crossover","strength":3,"detail":"MACD crossed below signal — strong sell"})
        elif macd>msig: sigs.append({"type":"BULLISH","indicator":"MACD","name":"Positive","strength":1,"detail":"MACD above signal"})
        else:           sigs.append({"type":"BEARISH","indicator":"MACD","name":"Negative","strength":1,"detail":"MACD below signal"})

    s20,s50,s200 = _s("SMA20"),_s("SMA50"),_s("SMA200")
    ps50,ps200 = _s("SMA50",prv),_s("SMA200",prv)
    if s50 and s200 and ps50 and ps200:
        if s50>s200 and ps50<=ps200:   sigs.append({"type":"BULLISH","indicator":"MA","name":"Golden Cross","strength":3,"detail":"SMA50 crossed above SMA200"})
        elif s50<s200 and ps50>=ps200: sigs.append({"type":"BEARISH","indicator":"MA","name":"Death Cross","strength":3,"detail":"SMA50 crossed below SMA200"})
        elif s50>s200: sigs.append({"type":"BULLISH","indicator":"MA","name":"Above SMA200","strength":2,"detail":"Long-term uptrend intact"})
        else:          sigs.append({"type":"BEARISH","indicator":"MA","name":"Below SMA200","strength":2,"detail":"Long-term downtrend"})
    if s20 and s50:
        if price>s20 and price>s50:   sigs.append({"type":"BULLISH","indicator":"MA","name":"Above SMA20/50","strength":2,"detail":"Price above short-term MAs"})
        elif price<s20 and price<s50: sigs.append({"type":"BEARISH","indicator":"MA","name":"Below SMA20/50","strength":2,"detail":"Price below short-term MAs"})

    bbu,bbm,bbl = _s("BB_upper"),_s("BB_middle"),_s("BB_lower")
    if bbu and bbl and bbm:
        bw = (bbu-bbl)/bbm
        if price<bbl:    sigs.append({"type":"BULLISH","indicator":"BB","name":"Below Lower Band","strength":3,"detail":"Potential mean reversion upward"})
        elif price>bbu:  sigs.append({"type":"BEARISH","indicator":"BB","name":"Above Upper Band","strength":3,"detail":"Potential mean reversion downward"})
        elif bw<0.08:    sigs.append({"type":"NEUTRAL","indicator":"BB","name":"BB Squeeze","strength":1,"detail":"Breakout incoming"})
        else:
            pctb = (price-bbl)/(bbu-bbl)
            if pctb<0.35:  sigs.append({"type":"BULLISH","indicator":"BB","name":"Lower Half BB","strength":1,"detail":f"{pctb*100:.0f}%B"})
            elif pctb>0.65:sigs.append({"type":"BEARISH","indicator":"BB","name":"Upper Half BB","strength":1,"detail":f"{pctb*100:.0f}%B"})

    avg_vol = hist["Volume"].rolling(20).mean().iloc[-1]
    cur_vol = float(lat["Volume"]); chg = float(lat["Close"])-float(prv["Close"])
    if not np.isnan(avg_vol) and cur_vol > avg_vol*1.5:
        ratio = cur_vol/avg_vol
        if chg>0: sigs.append({"type":"BULLISH","indicator":"Volume","name":"High-Volume Rally","strength":2,"detail":f"Volume {ratio:.1f}x avg on up day"})
        else:     sigs.append({"type":"BEARISH","indicator":"Volume","name":"High-Volume Selloff","strength":2,"detail":f"Volume {ratio:.1f}x avg on down day"})

    sk,sd = _s("Stoch_K"),_s("Stoch_D")
    if sk is not None and sd is not None:
        pk,pd_ = _s("Stoch_K",prv),_s("Stoch_D",prv)
        if sk<20:   sigs.append({"type":"BULLISH","indicator":"Stoch","name":"Stoch Oversold","strength":2,"detail":f"K={sk:.1f}"})
        elif sk>80: sigs.append({"type":"BEARISH","indicator":"Stoch","name":"Stoch Overbought","strength":2,"detail":f"K={sk:.1f}"})
        if pk and pd_:
            if sk>sd and pk<=pd_ and sk<80: sigs.append({"type":"BULLISH","indicator":"Stoch","name":"Stoch Bullish Cross","strength":2,"detail":"K crossed above D"})
            elif sk<sd and pk>=pd_ and sk>20: sigs.append({"type":"BEARISH","indicator":"Stoch","name":"Stoch Bearish Cross","strength":2,"detail":"K crossed below D"})

    return sigs


def get_recommendation(signals, fscore):
    bull = sum(s["strength"] for s in signals if s["type"]=="BULLISH")
    bear = sum(s["strength"] for s in signals if s["type"]=="BEARISH")
    ts = (bull/(bull+bear)*100) if (bull+bear) else 50.0
    cs = ts*0.5 + fscore*100*0.5
    if cs>=72:   act,lbl = "BUY","Strong Buy"
    elif cs>=60: act,lbl = "ACCUMULATE","Accumulate"
    elif cs>=45: act,lbl = "HOLD","Hold / Watch"
    elif cs>=33: act,lbl = "REDUCE","Reduce"
    else:        act,lbl = "SELL","Sell / Avoid"
    return {"action":act,"label":lbl,
            "confidence":min(95,int(abs(cs-50)*2+50)),
            "technical_score":round(ts,1),"fundamental_score":round(fscore*100,1),
            "combined_score":round(cs,1),
            "bullish_count":len([s for s in signals if s["type"]=="BULLISH"]),
            "bearish_count":len([s for s in signals if s["type"]=="BEARISH"]),
            "neutral_count":len([s for s in signals if s["type"]=="NEUTRAL"])}


def stock_fscore(info):
    scores = []
    pe = info.get("trailingPE") or info.get("forwardPE")
    if pe and 0<pe<200:
        scores.append(0.9 if pe<15 else 0.7 if pe<25 else 0.5 if pe<40 else 0.3 if pe<60 else 0.1)
    for key,thresholds in [
        ("revenueGrowth",[(0.25,0.9),(0.15,0.75),(0.05,0.55),(0.0,0.4)]),
        ("earningsGrowth",[(0.25,0.9),(0.10,0.7),(0.0,0.5)]),
        ("profitMargins",[(0.25,0.9),(0.15,0.75),(0.05,0.55),(0.0,0.35)]),
    ]:
        v = info.get(key)
        if v is not None:
            for thresh,sc in thresholds:
                if v>=thresh: scores.append(sc); break
            else: scores.append(0.15)
    de = info.get("debtToEquity")
    if de is not None: scores.append(0.9 if de<30 else 0.7 if de<80 else 0.5 if de<150 else 0.2)
    rec = info.get("recommendationMean")
    if rec and 1<=rec<=5: scores.append(max(0.0,(5-rec)/4))
    cr = info.get("currentRatio")
    if cr: scores.append(0.9 if cr>2 else 0.7 if cr>1.5 else 0.5 if cr>1 else 0.2)
    return sum(scores)/len(scores) if scores else 0.5


def calc_perf(hist):
    if len(hist)<30: return {}
    try:
        dr = hist["Close"].pct_change().dropna()
        years = len(dr)/252
        total_ret = float(hist["Close"].iloc[-1]/hist["Close"].iloc[0])-1
        cagr = float((1+total_ret)**(1/years)-1) if years>0 else 0.0
        ann_vol = float(dr.std()*np.sqrt(252))
        rf = 0.053/252
        ex = dr-rf
        sharpe = float((ex.mean()/ex.std())*np.sqrt(252)) if ex.std()>0 else 0.0
        neg = dr[dr<rf]; dn_std = float(neg.std()*np.sqrt(252)) if len(neg)>5 else ann_vol
        sortino = float((cagr-0.053)/dn_std) if dn_std>0 else 0.0
        cum = (1+dr).cumprod(); dd = (cum-cum.cummax())/cum.cummax()
        max_dd = float(dd.min())
        calmar = float(cagr/abs(max_dd)) if max_dd!=0 else 0.0
        var95 = float(np.percentile(dr,5))
        cvar95 = float(dr[dr<=var95].mean()) if len(dr[dr<=var95])>0 else var95
        win_rate = float((dr>0).sum()/len(dr))
        wins = dr[dr>0]; losses = dr[dr<0]
        pf = float(wins.sum()/abs(losses.sum())) if losses.sum()!=0 else 99.0
        monthly = hist["Close"].resample("ME").last().pct_change().dropna()
        return {"return_1y":round(cagr,4),"total_return":round(total_ret,4),
                "annualized_volatility":round(ann_vol,4),"sharpe_ratio":round(sharpe,3),
                "sortino_ratio":round(sortino,3),"calmar_ratio":round(calmar,3),
                "max_drawdown":round(max_dd,4),"var_95":round(var95,4),"cvar_95":round(cvar95,4),
                "win_rate":round(win_rate,4),"profit_factor":round(min(pf,99.0),3),
                "skewness":round(float(dr.skew()),3),"kurtosis":round(float(dr.kurt()),3),
                "positive_months":int((monthly>0).sum()),"total_months":int(len(monthly))}
    except Exception as e:
        print(f"Perf metrics error: {e}"); return {}


def calc_bench(hist, symbol, bench_sym="SPY"):
    if symbol==bench_sym: return {}
    try:
        bench_hist = _yf.get_history(bench_sym)
        if bench_hist.empty: return {}
        common = hist.index.intersection(bench_hist.index)
        if len(common)<60: return {}
        er = hist.loc[common,"Close"].pct_change().dropna()
        br = bench_hist.loc[common,"Close"].pct_change().dropna()
        idx = er.index.intersection(br.index)
        er,br = er.loc[idx],br.loc[idx]
        cov = np.cov(er,br); bv = cov[1,1]
        beta = float(cov[0,1]/bv) if bv>0 else 1.0
        rf = 0.053/252
        alpha = ((er.mean()-rf)-beta*(br.mean()-rf))*252
        corr = float(er.corr(br)); te = float((er-br).std()*np.sqrt(252))
        ir = float(((er-br).mean()*252)/te) if te>0 else 0.0
        up_days = br[br>0]; dn_days = br[br<0]
        uc = float((er[up_days.index].mean()/up_days.mean())*100) if len(up_days)>0 and up_days.mean()!=0 else 100.0
        dc = float((er[dn_days.index].mean()/dn_days.mean())*100) if len(dn_days)>0 and dn_days.mean()!=0 else 100.0
        return {"benchmark":bench_sym,"beta":round(beta,3),"alpha_annualized":round(float(alpha),4),
                "correlation":round(corr,3),"r_squared":round(corr**2,4),"tracking_error":round(te,4),
                "information_ratio":round(ir,3),"etf_return_1y":round(float((er+1).prod()-1),4),
                "benchmark_return_1y":round(float((br+1).prod()-1),4),
                "relative_performance":round(float((er+1).prod()-(br+1).prod()),4),
                "up_capture":round(uc,1),"down_capture":round(dc,1)}
    except Exception as e:
        print(f"Bench error: {e}"); return {}


def etf_fscore(info, perf, bench):
    scores = []
    er = info.get("annualReportExpenseRatio") or info.get("expenseRatio") or 0
    if er and er>0:
        s = 1.0 if er<0.0005 else 0.95 if er<0.001 else 0.85 if er<0.002 else 0.70 if er<0.005 else 0.50 if er<0.010 else 0.20
        scores.extend([s,s])
    aum = info.get("totalAssets")
    if aum:
        s = 1.0 if aum>50e9 else 0.9 if aum>10e9 else 0.75 if aum>1e9 else 0.55 if aum>100e6 else 0.35 if aum>10e6 else 0.15
        scores.extend([s,s])
    sharpe = perf.get("sharpe_ratio")
    if sharpe is not None:
        s = 1.0 if sharpe>2 else 0.85 if sharpe>1.5 else 0.70 if sharpe>1 else 0.55 if sharpe>0.5 else 0.40 if sharpe>0 else 0.15
        scores.extend([s,s,s])
    mdd = perf.get("max_drawdown")
    if mdd is not None:
        dd = abs(mdd)
        s = 1.0 if dd<0.05 else 0.85 if dd<0.10 else 0.75 if dd<0.15 else 0.60 if dd<0.20 else 0.45 if dd<0.30 else 0.30 if dd<0.40 else 0.10
        scores.extend([s,s])
    ret = perf.get("return_1y") or info.get("ytdReturn")
    if ret is not None:
        s = 0.95 if ret>0.30 else 0.80 if ret>0.15 else 0.65 if ret>0.05 else 0.50 if ret>0 else 0.25
        scores.extend([s,s])
    for k,thresholds in [("sortino_ratio",[(2,1.0),(1,0.75),(0,0.5)]),("calmar_ratio",[(2,1.0),(1,0.75),(0.5,0.55),(0,0.35)])]:
        v = perf.get(k)
        if v is not None:
            for t,sc in thresholds:
                if v>=t: scores.append(sc); break
            else: scores.append(0.15)
    alpha = bench.get("alpha_annualized")
    if alpha is not None: scores.append(0.9 if alpha>0.05 else 0.65 if alpha>0 else 0.45 if alpha>-0.05 else 0.2)
    uc,dc = bench.get("up_capture"),bench.get("down_capture")
    if uc and dc:
        cr = uc/dc if dc>0 else 1
        scores.append(0.9 if cr>1.2 else 0.7 if cr>1 else 0.5 if cr>0.8 else 0.3)
    return sum(scores)/len(scores) if scores else 0.5


def get_ai_analysis(symbol, info, hist, signals, rec, is_etf=False, etf_data=None):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key or not ANTHROPIC_AVAILABLE: return None
    try:
        client = anthropic.Anthropic(api_key=key)
        price = float(hist["Close"].iloc[-1])
        rsi_v = hist["RSI"].iloc[-1]
        rsi_s = f"{rsi_v:.1f}" if not pd.isna(rsi_v) else "N/A"
        s50 = float(hist["SMA50"].iloc[-1]) if not pd.isna(hist["SMA50"].iloc[-1]) else None
        s200 = float(hist["SMA200"].iloc[-1]) if not pd.isna(hist["SMA200"].iloc[-1]) else None

        if is_etf and etf_data:
            p,b = etf_data.get("performance_metrics",{}),etf_data.get("benchmark_comparison",{})
            prompt = f"""You are a senior ETF strategist. Analyze {symbol} ({info.get('longName',symbol)}).

ETF: Category={info.get('category','N/A')}, Family={info.get('fundFamily','N/A')}, AUM=${(info.get('totalAssets') or 0)/1e9:.1f}B, ER={(info.get('annualReportExpenseRatio') or 0)*100:.3f}%
Technical: Price=${price:.2f}, RSI={rsi_s}, vs SMA50={"Above" if s50 and price>s50 else "Below"}, TechScore={rec['technical_score']}/100
Performance: CAGR={p.get('return_1y',0)*100:.1f}%, Sharpe={p.get('sharpe_ratio','N/A')}, Sortino={p.get('sortino_ratio','N/A')}, MaxDD={p.get('max_drawdown',0)*100:.1f}%, Calmar={p.get('calmar_ratio','N/A')}
vs {b.get('benchmark','SPY')}: Beta={b.get('beta','N/A')}, Alpha={b.get('alpha_annualized',0)*100:.2f}%, UpCapture={b.get('up_capture','N/A')}%, DnCapture={b.get('down_capture','N/A')}%
Signals: {', '.join(f"{s['type']}:{s['name']}" for s in signals[:5])}
Verdict: {rec['label']} ({rec['combined_score']}/100)"""
        else:
            prompt = f"""You are a senior equity analyst. Analyze {symbol} ({info.get('longName',symbol)}).

Technical: Price=${price:.2f}, RSI={rsi_s}, vs SMA50={"Above" if s50 and price>s50 else "Below"}, vs SMA200={"Above" if s200 and price>s200 else "Below"}, TechScore={rec['technical_score']}/100
Fundamental: Sector={info.get('sector','N/A')}, PE={info.get('trailingPE','N/A')}, FwdPE={info.get('forwardPE','N/A')}, RevGrowth={f"{info.get('revenueGrowth',0)*100:.1f}%" if info.get('revenueGrowth') else 'N/A'}, Margin={f"{info.get('profitMargins',0)*100:.1f}%" if info.get('profitMargins') else 'N/A'}, Target=${info.get('targetMeanPrice','N/A')}, FundScore={rec['fundamental_score']}/100
Signals: {', '.join(f"{s['type']}:{s['name']}" for s in signals[:6])}
Verdict: {rec['label']} ({rec['combined_score']}/100)"""

        prompt += """\n\nReturn ONLY valid JSON (no markdown):
{"technical_summary":"2-3 sentences","fundamental_summary":"2-3 sentences","investment_thesis":"1-2 sentences","key_risks":["r1","r2","r3"],"key_catalysts":["c1","c2"],"entry_strategy":"specific levels","price_target_6m":"target with reasoning","when_to_buy":"conditions if not now"}"""

        resp = client.messages.create(model="claude-sonnet-4-6", max_tokens=1024,
            system="Expert financial analyst. Return only valid JSON, no markdown.",
            messages=[{"role":"user","content":prompt}])
        text = resp.content[0].text.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m: return json.loads(m.group())
    except Exception as e:
        print(f"AI error: {e}")
    return None


# ─── Health & Cache ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status":"ok","cached_symbols":list(_cache.keys())}

@app.delete("/api/cache")
async def clear_cache():
    _cache.clear(); _cache_ts.clear()
    return {"status":"cache cleared"}


# ─── Main Analyze Endpoint ────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    results = {}
    for raw in request.symbols:
        symbol = raw.upper().strip()
        if not symbol: continue

        cached = _cache_get(symbol)
        if cached:
            results[symbol] = cached
            continue

        try:
            # Fetch history
            hist = _yf.get_history(symbol)
            if hist.empty:
                results[symbol] = {"error": f"No data found for '{symbol}'. Check the ticker symbol.", "symbol": symbol}
                continue

            # Add indicators
            hist["SMA20"]  = hist["Close"].rolling(20).mean()
            hist["SMA50"]  = hist["Close"].rolling(50).mean()
            hist["SMA200"] = hist["Close"].rolling(200).mean()
            hist["EMA12"]  = hist["Close"].ewm(span=12, adjust=False).mean()
            hist["EMA26"]  = hist["Close"].ewm(span=26, adjust=False).mean()
            hist["RSI"]    = calc_rsi(hist["Close"])
            hist["MACD"],hist["MACD_signal"],hist["MACD_hist"] = calc_macd(hist["Close"])
            hist["BB_upper"],hist["BB_middle"],hist["BB_lower"] = calc_boll(hist["Close"])
            hist["Stoch_K"],hist["Stoch_D"] = calc_stoch(hist["High"],hist["Low"],hist["Close"])
            hist["ATR"] = calc_atr(hist["High"],hist["Low"],hist["Close"])
            hist["OBV"] = calc_obv(hist["Close"],hist["Volume"])

            candles = [{"time":idx.strftime("%Y-%m-%d"),"open":round(float(r["Open"]),4),
                        "high":round(float(r["High"]),4),"low":round(float(r["Low"]),4),
                        "close":round(float(r["Close"]),4),"volume":int(r["Volume"])}
                       for idx,r in hist.iterrows()]

            signals = generate_signals(hist)
            info = _yf.get_info(symbol)
            is_etf = info.get("quoteType","").upper() == "ETF"

            # ETF-specific metrics
            etf_data: Dict = {}
            if is_etf:
                perf = calc_perf(hist)
                bench = calc_bench(hist, symbol)
                fscore = etf_fscore(info, perf, bench)
                etf_data = {
                    "performance_metrics": perf,
                    "benchmark_comparison": bench,
                    "holdings": {
                        "top_holdings": info.get("_topHoldings", []),
                        "sector_weightings": info.get("_sectorWeightings", {}),
                        "asset_classes": {k:v for k,v in (info.get("_assetClasses") or {}).items() if v},
                        "equity_holdings": info.get("_equityHoldings", {}),
                        "bond_holdings": {},
                    },
                    "expense_ratio":      info.get("annualReportExpenseRatio"),
                    "aum":                info.get("totalAssets"),
                    "distribution_yield": info.get("yield") or info.get("dividendYield"),
                    "category":           info.get("category"),
                    "fund_family":        info.get("fundFamily"),
                    "beta_3y":            info.get("beta3Year"),
                    "return_3y":          info.get("threeYearAverageReturn"),
                    "return_5y":          info.get("fiveYearAverageReturn"),
                    "ytd_return":         info.get("ytdReturn"),
                    "nav_price":          info.get("navPrice"),
                    "description":        (info.get("longBusinessSummary") or "")[:600],
                }
            else:
                fscore = stock_fscore(info)

            rec = get_recommendation(signals, fscore)
            price  = float(hist["Close"].iloc[-1])
            w52h   = float(hist["High"].max())
            w52l   = float(hist["Low"].min())
            sup90  = float(hist.iloc[-90:]["Low"].min())  if len(hist)>=90 else float(hist["Low"].min())
            res90  = float(hist.iloc[-90:]["High"].max()) if len(hist)>=90 else float(hist["High"].max())
            fib    = {k:round(w52h-v*(w52h-w52l),2) for k,v in
                      {"0.236":0.236,"0.382":0.382,"0.5":0.5,"0.618":0.618,"0.786":0.786}.items()}
            s20v   = float(hist["SMA20"].iloc[-1]) if not pd.isna(hist["SMA20"].iloc[-1]) else price
            atr_v  = float(hist["ATR"].iloc[-1])   if not pd.isna(hist["ATR"].iloc[-1])   else 0

            tm = info.get("targetMeanPrice"); th_ = info.get("targetHighPrice"); tl = info.get("targetLowPrice")
            if rec["action"] in ("BUY","ACCUMULATE"):
                entry = round(min(price,s20v),2)
                enote = f"Enter near SMA20 (${s20v:.2f}) or support (${sup90:.2f}). Stop-loss ~${round(entry-2*atr_v,2)}."
            elif rec["action"]=="HOLD":
                entry = round(sup90*1.01,2); enote = f"Wait for pullback toward support (${sup90:.2f})."
            else:
                entry = round(w52l*1.02,2); enote = f"Avoid now. Revisit near 52-week low (${w52l:.2f}) after reversal."

            news = _yf.get_news(symbol)
            ai   = get_ai_analysis(symbol, info, hist, signals, rec, is_etf, etf_data if is_etf else None)

            result = {
                "symbol": symbol, "is_etf": is_etf,
                "company_name": info.get("longName", symbol),
                "sector": info.get("sector") or info.get("category","N/A"),
                "industry": info.get("industry") or info.get("fundFamily","N/A"),
                "current_price": round(price,2),
                "currency": info.get("currency","USD"),
                "market_cap": info.get("marketCap") or info.get("totalAssets"),
                "week52_high": round(w52h,2), "week52_low": round(w52l,2),
                "technical": {
                    "candles": candles,
                    "indicators": {k: to_series(hist, col) for k,col in [
                        ("sma20","SMA20"),("sma50","SMA50"),("sma200","SMA200"),
                        ("ema12","EMA12"),("ema26","EMA26"),("rsi","RSI"),
                        ("macd","MACD"),("macd_signal","MACD_signal"),("macd_hist","MACD_hist"),
                        ("bb_upper","BB_upper"),("bb_middle","BB_middle"),("bb_lower","BB_lower"),
                        ("stoch_k","Stoch_K"),("stoch_d","Stoch_D"),("atr","ATR"),("obv","OBV"),
                    ]},
                    "signals": signals,
                    "support": round(sup90,2), "resistance": round(res90,2),
                    "fib_levels": fib, "atr": round(atr_v,2),
                },
                "fundamental": {
                    "pe_ratio":info.get("trailingPE"),"forward_pe":info.get("forwardPE"),
                    "peg_ratio":info.get("pegRatio"),"pb_ratio":info.get("priceToBook"),
                    "ps_ratio":info.get("priceToSalesTrailing12Months"),
                    "ev_ebitda":info.get("enterpriseToEbitda"),
                    "revenue_growth":info.get("revenueGrowth"),"earnings_growth":info.get("earningsGrowth"),
                    "gross_margins":info.get("grossMargins"),"operating_margins":info.get("operatingMargins"),
                    "profit_margins":info.get("profitMargins"),"roe":info.get("returnOnEquity"),
                    "roa":info.get("returnOnAssets"),"debt_to_equity":info.get("debtToEquity"),
                    "current_ratio":info.get("currentRatio"),"quick_ratio":info.get("quickRatio"),
                    "free_cash_flow":info.get("freeCashflow"),"dividend_yield":info.get("dividendYield"),
                    "eps":info.get("trailingEps"),"forward_eps":info.get("forwardEps"),
                    "book_value":info.get("bookValue"),"revenue":info.get("totalRevenue"),
                    "net_income":info.get("netIncomeToCommon"),
                    "analyst_recommendation":info.get("recommendationKey","N/A"),
                    "recommendation_mean":info.get("recommendationMean"),
                    "target_high":th_,"target_low":tl,"target_mean":tm,
                    "analyst_count":info.get("numberOfAnalystOpinions"),
                    "description":(info.get("longBusinessSummary") or "")[:600],
                    "news":news,"fundamental_score":round(fscore*100,1),
                },
                "etf_data": etf_data,
                "recommendation": rec,
                "entry_point": {
                    "suggested_price":entry,"note":enote,"target_mean":tm,
                    "target_high":th_,"target_low":tl,
                    "upside_pct":round((tm/price-1)*100,1) if tm and price else None,
                },
                "ai_analysis": ai,
            }
            _cache_set(symbol, result)
            results[symbol] = result

        except Exception as e:
            results[symbol] = {"error": str(e), "symbol": symbol}

        if len(request.symbols) > 1:
            time.sleep(2)

    return results


# ─── Serve React Frontend ─────────────────────────────────────────────────────

_STATIC = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC):
    _ASSETS = os.path.join(_STATIC, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        f = os.path.join(_STATIC, full_path)
        if os.path.isfile(f): return FileResponse(f)
        return FileResponse(os.path.join(_STATIC, "index.html"))
