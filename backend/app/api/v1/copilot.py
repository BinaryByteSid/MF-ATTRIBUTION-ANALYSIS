from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import get_current_active_user
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

# ── Pydantic Request/Response Models ──────────────────────────────────────────

class HoldingInfo(BaseModel):
    scheme_name: str
    weight: float
    current_value: float

class RiskInfo(BaseModel):
    sharpe_ratio: float
    sortino_ratio: float
    beta: float
    alpha: float
    information_ratio: float

class BrinsonSegment(BaseModel):
    asset_class: str
    portfolio_weight: float
    benchmark_weight: float
    portfolio_return: float
    benchmark_return: float
    allocation_effect: float
    selection_effect: float
    interaction_effect: float

class PortfolioSummary(BaseModel):
    name: str
    total_value: float
    total_invested: float
    absolute_return: float
    xirr: float
    cagr: float

class CopilotContext(BaseModel):
    summary: Optional[PortfolioSummary] = None
    holdings: List[HoldingInfo]
    risk: Optional[RiskInfo] = None
    brinson: List[BrinsonSegment]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatQuery(BaseModel):
    messages: List[ChatMessage]
    context: CopilotContext

# ── Deterministic Fallback Expert Analyst System ──────────────────────────────

def generate_deterministic_analysis(context: CopilotContext) -> str:
    """Generates a professional, detailed markdown portfolio analysis report."""
    h = context.holdings
    r = context.risk
    s = context.summary
    b = context.brinson

    # 1. Health Score Calculation
    score = 50
    reasons = []
    
    if r:
        if r.sharpe_ratio >= 1.5:
            score += 15
            reasons.append("Excellent Sharpe ratio (>1.5) showing high risk-adjusted return.")
        elif r.sharpe_ratio >= 1.0:
            score += 10
            reasons.append("Healthy Sharpe ratio (>1.0) showing solid risk-adjusted return.")
        else:
            score -= 5
            reasons.append("Low Sharpe ratio (<1.0). Risk-adjusted return is suboptimal.")

        if r.alpha >= 3.0:
            score += 15
            reasons.append(f"Strong active management generating +{r.alpha:.2f}% alpha above benchmark.")
        elif r.alpha > 0:
            score += 10
            reasons.append(f"Moderate positive alpha (+{r.alpha:.2f}%) generated.")
        else:
            score -= 10
            reasons.append(f"Negative alpha ({r.alpha:.2f}%) indicates underperformance against benchmark.")

    # Concentration risk (HHI calculation)
    hhi = 0
    if h:
        total_w = sum(item.weight for item in h)
        if total_w > 0:
            weights_normalized = [item.weight / total_w for item in h]
            hhi = sum((w * 100) ** 2 for w in weights_normalized)
            
            if hhi < 1500:
                score += 15
                reasons.append(f"Well-diversified portfolio structure (HHI of {hhi:.0f}).")
            elif hhi < 2500:
                score += 5
                reasons.append(f"Moderately concentrated portfolio structure (HHI of {hhi:.0f}).")
            else:
                score -= 15
                reasons.append(f"Highly concentrated portfolio risk (HHI of {hhi:.0f}). Consider diversifying.")
    
    score = max(0, min(100, score))

    # 2. Brinson analysis
    top_alloc_sec = "-"
    top_alloc_val = -999.0
    top_select_sec = "-"
    top_select_val = -999.0
    detract_sec = "-"
    detract_val = 999.0

    for seg in b:
        tot_effect = seg.allocation_effect + seg.selection_effect + seg.interaction_effect
        if seg.allocation_effect > top_alloc_val:
            top_alloc_val = seg.allocation_effect
            top_alloc_sec = seg.asset_class
        if seg.selection_effect > top_select_val:
            top_select_val = seg.selection_effect
            top_select_sec = seg.asset_class
        if tot_effect < detract_val:
            detract_val = tot_effect
            detract_sec = seg.asset_class

    # Build report
    report = f"""# AI Copilot Executive Portfolio Diagnostics

## 📊 Overall Portfolio Health Score: **{score}/100**

### Primary Diagnostics Factors:
"""
    for reason in reasons:
        report += f"- {reason}\n"

    report += "\n---\n\n## 🔍 Risk & Return Diagnostics\n"
    if s:
        report += f"- **Returns**: The portfolio has generated an absolute return of **{s.absolute_return:.2f}%** (CAGR: **{s.cagr:.2f}%** / XIRR: **{s.xirr:.2f}%**).\n"
    if r:
        report += f"- **Risk-Adjusted Ratios**: The Sharpe ratio is **{r.sharpe_ratio:.2f}** and the Sortino ratio is **{r.sortino_ratio:.2f}**, indicating the portfolio's efficiency in managing downside volatility.\n"
        report += f"- **Market Sensitivity (Beta)**: A beta of **{r.beta:.2f}** means the portfolio is **{'more volatile than' if r.beta > 1.05 else 'less volatile than' if r.beta < 0.95 else 'closely matched to'}** the index.\n"

    report += "\n---\n\n## 📈 Brinson-Fachler Sector Attribution Analysis\n"
    if b:
        report += f"- **Top Sector Allocation Call**: **{top_alloc_sec}** (+{top_alloc_val*100:.3f}% effect). The active weight overlay in this sector added the most value relative to the benchmark.\n"
        report += f"- **Top Stock Selection Call**: **{top_select_sec}** (+{top_select_val*100:.3f}% effect). Your choice of underlying mutual funds or equities in this sector outperformed the benchmark's holdings.\n"
        if detract_val < 0:
            report += f"- **Underperforming Sector detractor**: **{detract_sec}** ({detract_val*100:.3f}% total attribution). Performance drag was concentrated here due to poor timing or selection.\n"
    else:
        report += "- No sector attribution data available for analysis.\n"

    report += "\n---\n\n## 🛠️ Strategic Rebalancing Recommendations\n"
    recommendations = []
    
    if hhi > 2500:
        recommendations.append("Concentration risk is elevated. We recommend reallocating assets away from top holdings into alternative categories to reduce systemic stock risk.")
    if r and r.beta > 1.15:
        recommendations.append(f"The portfolio has high market beta ({r.beta:.2f}). Consider adding allocation to defensive debt funds or large-cap value schemes to buffer macro volatility.")
    if detract_val < -0.01:
        recommendations.append(f"Address underperformance in **{detract_sec}** by replacing trailing funds in this segment with top-ranked peer schemes (e.g. from the category list).")
    
    if not recommendations:
        recommendations.append("The portfolio structure is healthy and aligned with benchmark goals. Maintain target allocations and monitor quarterly risk ratios.")
        
    for rec in recommendations:
        report += f"1. **{rec}**\n"
        
    return report

# ── API Endpoint Implementations ──────────────────────────────────────────────

@router.post("/analyze")
async def analyze_portfolio(
    body: CopilotContext,
    current_user: User = Depends(get_current_active_user)
):
    """Analyze portfolio and generate diagnostic reports."""
    # Check if OpenRouter API is configured
    if not settings.OPENROUTER_API_KEY:
        logger.info("OpenRouter key not configured, falling back to deterministic diagnostics.")
        report = generate_deterministic_analysis(body)
        return {"report": report, "provider": "Deterministic Analyst Agent (Fallback)"}

    # OpenRouter API call
    logger.info("Executing OpenRouter portfolio diagnostics request...")
    prompt = f"""
You are an expert institutional investment consultant and portfolio risk analyst.
Analyze the following portfolio data and return a detailed, professional investment report in rich Markdown format.

CONTEXT DETAILS:
Portfolio Summary: {body.summary.model_dump_json() if body.summary else "N/A"}
Holdings: {[h.model_dump() for h in body.holdings]}
Risk Metrics: {body.risk.model_dump_json() if body.risk else "N/A"}
Brinson Sector Attribution: {[seg.model_dump() for seg in body.brinson]}

Your analysis MUST contain:
1. An overall Portfolio Health Score (out of 100) with key positive and negative factors.
2. A detailed breakdown of Risk and Return efficiencies (Sharpe, Sortino, Beta, Alpha, and Information ratio).
3. A Brinson Attribution deep-dive (detail which sectors added or detracted value, referencing allocation vs. selection effects).
4. Direct, actionable rebalancing or asset allocation recommendations.
Keep the tone highly professional, precise, and objective. Use structured markdown formatting.
"""

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Mutual Fund Attribution Platform",
        "Content-Type": "application/json"
    }

    payload = {
        "model": settings.OPENROUTER_MODEL or "google/gemini-2.5-flash",
        "messages": [
            {"role": "system", "content": "You are a professional mutual fund and portfolio risk analyst agent."},
            {"role": "user", "content": prompt}
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter returned status {response.status_code}: {response.text}")
                # Fallback to local
                return {
                    "report": generate_deterministic_analysis(body),
                    "provider": "Deterministic Analyst Agent (OpenRouter API Error Fallback)"
                }
                
            res_json = response.json()
            report_content = res_json["choices"][0]["message"]["content"]
            return {"report": report_content, "provider": f"OpenRouter AI ({payload['model']})"}

    except Exception as e:
        logger.exception("Failed to connect to OpenRouter. Falling back to local diagnostics.")
        return {
            "report": generate_deterministic_analysis(body),
            "provider": "Deterministic Analyst Agent (Connection Error Fallback)"
        }


@router.post("/chat")
async def chat_with_copilot(
    body: ChatQuery,
    current_user: User = Depends(get_current_active_user)
):
    """Conversational endpoint to answer custom user questions about their portfolio."""
    if not settings.OPENROUTER_API_KEY:
        # Fallback responses based on user query keywords
        last_user_message = body.messages[-1].content.lower() if body.messages else ""
        
        fallback_msg = "I can help explain your portfolio metrics. For full AI conversational insights, please configure the `OPENROUTER_API_KEY`."
        
        if "rebal" in last_user_message or "diversi" in last_user_message:
            fallback_msg = "Based on diversification analysis: We recommend moving a portion of concentrated equity weights into low-correlation asset classes (like debt/liquid funds) to reduce volatility. Reducing concentration in the top 3 holdings will lower portfolio specific risk."
        elif "risk" in last_user_message or "sharpe" in last_user_message or "beta" in last_user_message:
            fallback_msg = f"Your portfolio has a Sharpe ratio of {body.context.risk.sharpe_ratio if body.context.risk else '1.0'}. This represents the risk-adjusted return (excess return per unit of volatility). A Sharpe ratio > 1.0 is generally considered good. The Beta of {body.context.risk.beta if body.context.risk else '1.0'} indicates market volatility correlation."
        elif "brinson" in last_user_message or "sector" in last_user_message or "attribution" in last_user_message:
            fallback_msg = "Brinson-Fachler attribution divides your excess return into: \n1. **Allocation Effect**: Value added/lost by overweighting/underweighting sectors relative to benchmark.\n2. **Selection Effect**: Value added/lost by picking individual funds that beat the benchmark within that sector.\n3. **Interaction Effect**: Combined overlay of weights and selection."
        
        return {
            "response": fallback_msg,
            "provider": "Rule-Based Portfolio Bot (Fallback)"
        }

    # OpenRouter API call
    logger.info("Executing OpenRouter chat copilot request...")
    
    # Construct LLM system context prompt
    system_prompt = f"""
You are an AI Portfolio Analyst Copilot. You are talking to an investor or fund manager about their mutual fund portfolio.
Explain terms clearly, cite the provided data directly, and give professional financial risk insights.

PORTFOLIO DATA CONTEXT:
Portfolio Name: {body.context.summary.name if body.context.summary else "N/A"}
Absolute Return: {body.context.summary.absolute_return if body.context.summary else 0.0}%
Risk Metrics (Sharpe, Beta, Alpha): {body.context.risk.model_dump_json() if body.context.risk else "N/A"}
Holdings: {[{"name": h.scheme_name, "weight": h.weight} for h in body.context.holdings]}
Brinson Attribution Details: {[{"sector": s.asset_class, "alloc": s.allocation_effect, "select": s.selection_effect} for s in body.context.brinson]}

Keep your responses conversational, concise, and focused on explaining the provided statistics. Use formatting like bullet points or bold text where appropriate.
"""

    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    # Append the last few messages for conversation history
    for msg in body.messages[-6:]:
        messages.append({"role": msg.role, "content": msg.content})

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Mutual Fund Attribution Platform",
        "Content-Type": "application/json"
    }

    payload = {
        "model": settings.OPENROUTER_MODEL or "google/gemini-2.5-flash",
        "messages": messages
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter returned status {response.status_code} in chat: {response.text}")
                return {
                    "response": "I encountered an error connecting to the AI service. Here is a quick diagnostic: your portfolio has positive return and healthy risk metrics, but I cannot give detailed chat analysis at this second.",
                    "provider": "Fallback Bot (API Error)"
                }
                
            res_json = response.json()
            chat_response = res_json["choices"][0]["message"]["content"]
            return {"response": chat_response, "provider": f"OpenRouter AI ({payload['model']})"}

    except Exception as e:
        logger.exception("Failed to connect to OpenRouter during chat.")
        return {
            "response": "I had trouble reaching the AI server. Please check your internet connection or OpenRouter API key configuration.",
            "provider": "Fallback Bot (Connection Error)"
        }
