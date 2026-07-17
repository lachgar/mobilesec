import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import fixSuggestService from '../services/fixSuggest';
import mlModelService from '../services/mlModel';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';

// Premium simulated IDE CodeBlock component
const CodeBlock = ({ code, language = 'java' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    return (
        <div className="bg-[#050716] rounded-2xl overflow-hidden border border-slate-200/40 dark:border-slate-800/50 my-4 shadow-xl">
            {/* Header / Mac-like Window Controls */}
            <div className="flex justify-between items-center px-4 py-3 bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200/40 dark:border-slate-800/50">
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase ml-2.5">
                        {language}
                    </span>
                </div>
                <button
                    onClick={handleCopy}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
                        copied
                            ? 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/20'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                >
                    {copied ? (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Copy
                        </>
                    )}
                </button>
            </div>
            {/* Code viewport */}
            <pre className="p-5 overflow-x-auto font-mono text-[11px] leading-6 text-slate-300 dark:text-slate-200 leading-relaxed bg-[#050716]/95">
                <code>{code}</code>
            </pre>
        </div>
    );
};

const FixSuggestions = () => {
    const { scanId } = useParams();
    const [loading, setLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    // ML Model states
    const [mlData, setMlData] = useState(null);
    const [mlLoading, setMlLoading] = useState(true);
    const [mlError, setMlError] = useState(null);
    const [showMLSuggestions, setShowMLSuggestions] = useState(true);

    const fetchSuggestions = async (forceRegenerate = false) => {
        try {
            setLoading(true);
            if (forceRegenerate) setRegenerating(true);

            // Use ML-prioritized suggestions endpoint
            const response = await fixSuggestService.getMLPrioritizedSuggestions(scanId, 10);

            // Transform to match expected format if needed
            const transformedData = {
                status: response.status || 'success',
                scan_id: scanId,
                suggestions_count: response.total_suggestions || 0,
                suggestions: response.suggestions || [],
                model_used: response.model_used || 'lightgbm + amazon/nova-lite-v1',
                generated_at: new Date().toISOString()
            };

            setData(transformedData);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Impossible de charger les suggestions ML. Le service est peut-être indisponible.');
        } finally {
            setLoading(false);
            setRegenerating(false);
        }
    };

    const fetchMLSuggestions = async () => {
        try {
            setMlLoading(true);
            const response = await mlModelService.getPredictions(scanId, 3);
            setMlData(response);
            setMlError(null);
        } catch (err) {
            console.error('ML predictions error:', err);
            if (err.response && err.response.status === 404) {
                setMlError('Scan not found in ML training data. Upload more scans to improve predictions.');
            } else {
                setMlError('ML service unavailable or model not trained yet.');
            }
        } finally {
            setMlLoading(false);
        }
    };

    useEffect(() => {
        fetchSuggestions();
        fetchMLSuggestions();
    }, [scanId]);

    const getConfidenceBadge = (score) => {
        const s = score <= 1 ? score * 100 : score;
        if (s >= 80) return <Badge type="success">High Confidence ({s.toFixed(0)}%)</Badge>;
        if (s >= 50) return <Badge type="warning">Medium Confidence ({s.toFixed(0)}%)</Badge>;
        return <Badge type="danger">Low Confidence ({s.toFixed(0)}%)</Badge>;
    };

    return (
        <div className="space-y-6">
                {/* Back Nav Link */}
                <div>
                    <Link 
                        to={`/scans/${scanId}`} 
                        className="group inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-500 dark:text-slate-400 dark:hover:text-indigo-400 text-xs font-bold transition-all duration-200 active:scale-[0.98]"
                    >
                        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Scan Details
                    </Link>
                </div>

                {/* Header card with glassmorphism */}
                <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-800/40">
                    {/* Top gradient stripe */}
                    <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-emerald-500" />
                    
                    <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 dark:border-indigo-500/10 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <svg className="w-6 h-6 text-indigo-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096L9 21zm0 0h3.818M9 21H5.182m13.256-5.836A5.93 5.93 0 0019 12.022c0-3.237-2.623-5.86-5.86-5.86-1.57 0-2.998.618-4.055 1.624L9 8H7.182m11.818 0l-1.818 2.136" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight leading-tight">
                                    Intelligent Security Fix Suggestions
                                </h1>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    Automated remediation analysis and prioritized fix suggestions powered by AI and ML.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => fetchSuggestions(true)}
                            disabled={regenerating || loading}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-xs font-semibold rounded-lg transition-all duration-150 active:scale-[0.97] text-white shadow-md ${
                                regenerating
                                    ? 'bg-slate-350 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-500/20 hover:shadow-violet-500/30'
                            }`}
                        >
                            {regenerating ? (
                                <>
                                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full flex-shrink-0" />
                                    Regenerating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Regenerate AI
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Unified Tab Switcher Navigation */}
                <div className="glass-card rounded-2xl p-1.5 flex gap-1.5 overflow-x-auto scrollbar-none max-w-md border border-slate-200/50 dark:border-slate-800/40">
                    <button
                        onClick={() => setShowMLSuggestions(true)}
                        className={`flex-1 min-w-max flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all duration-200 whitespace-nowrap ${
                            showMLSuggestions
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        ML Prioritized Fixes
                    </button>
                    <button
                        onClick={() => setShowMLSuggestions(false)}
                        className={`flex-1 min-w-max flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all duration-200 whitespace-nowrap ${
                            !showMLSuggestions
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Detailed AI Explanations
                    </button>
                </div>

                {/* Loading States */}
                {showMLSuggestions && mlLoading && !mlData && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                        <p className="text-sm font-medium">ML Model analyzing vulnerabilities...</p>
                    </div>
                )}

                {!showMLSuggestions && loading && !data && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
                        <p className="text-sm font-medium">AI Analysis in progress... This may take a few seconds.</p>
                    </div>
                )}

                {/* Error Banner States */}
                {showMLSuggestions && mlError && !mlData && (
                    <Card className="border border-amber-500/20 bg-amber-500/5">
                        <div className="flex flex-col items-center justify-center text-center py-8">
                            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400">ML Predictions Not Available</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">{mlError}</p>
                            <p className="text-[10px] text-slate-400 mt-4">The ML model requires more training scans. Go to the dashboard to run more builds.</p>
                        </div>
                    </Card>
                )}

                {!showMLSuggestions && error && !data && (
                    <Card className="border border-rose-500/25 bg-rose-500/5">
                        <div className="flex flex-col items-center justify-center text-center py-8">
                            <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-bold text-rose-500">AI Analysis Failed</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">{error}</p>
                            <p className="text-[10px] text-slate-400 mt-4">Verify that the fix-suggest microservice is running and accessible.</p>
                        </div>
                    </Card>
                )}

                {/* ── ML Suggestions Display ── */}
                {showMLSuggestions && mlData && (
                    <div className="space-y-6">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                {
                                    label: "Primary Recommendation",
                                    value: mlData.primary_fix || "—",
                                    color: "text-indigo-600 dark:text-indigo-400",
                                    isText: true
                                },
                                {
                                    label: "Model Confidence",
                                    value: `${(mlData.confidence * 100).toFixed(0)}%`,
                                    color: mlData.confidence >= 0.8 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                                },
                                {
                                    label: "Total Vulnerabilities",
                                    value: mlData.vulnerability_summary?.total || 0,
                                    color: "text-slate-900 dark:text-white"
                                },
                                {
                                    label: "Severity Score",
                                    value: mlData.vulnerability_summary?.severity_score?.toFixed(1) || "0.0",
                                    color: "text-rose-600 dark:text-rose-400"
                                },
                            ].map((stat, i) => (
                                <div key={i} className="glass-card rounded-xl p-4 border border-slate-200/50 dark:border-slate-800/40">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{stat.label}</p>
                                    <p className={`font-extrabold ${stat.isText ? 'text-sm truncate' : 'text-2xl'} ${stat.color}`}>
                                        {stat.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Distribution Chart Card */}
                        {mlData.vulnerability_summary && (
                            <Card className="border border-slate-200/50 dark:border-slate-800/40">
                                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">📊 Vulnerability Category Breakdown</h3>
                                <div className="flex flex-col gap-4">
                                    {/* Crypto */}
                                    <div>
                                        <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                                            <span>Cryptography Issues</span>
                                            <span className="font-bold text-rose-500">{mlData.vulnerability_summary.crypto}</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-rose-500 rounded-full transition-all duration-500" 
                                                style={{ width: `${(mlData.vulnerability_summary.crypto / Math.max(1, mlData.vulnerability_summary.total)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    {/* Secrets */}
                                    <div>
                                        <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                                            <span>Exposed Credentials & Secrets</span>
                                            <span className="font-bold text-amber-500">{mlData.vulnerability_summary.secrets}</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                                                style={{ width: `${(mlData.vulnerability_summary.secrets / Math.max(1, mlData.vulnerability_summary.total)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    {/* Network */}
                                    <div>
                                        <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                                            <span>Network Configuration Findings</span>
                                            <span className="font-bold text-indigo-500">{mlData.vulnerability_summary.network}</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                                                style={{ width: `${(mlData.vulnerability_summary.network / Math.max(1, mlData.vulnerability_summary.total)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* ML Recommendations List */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🤖 Recommended Fixes (ML-Based)</h3>
                            
                            {mlData.suggestions && mlData.suggestions.length > 0 ? (
                                mlData.suggestions.map((item, index) => (
                                    <div 
                                        key={index} 
                                        className="glass-card rounded-2xl p-5 border border-slate-200/50 dark:border-slate-800/40 hover:scale-[1.005] hover:shadow-md transition-all duration-300 bg-white/70 dark:bg-[#0b0f24]/70"
                                    >
                                        <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    <span className="text-emerald-500 font-extrabold">#{item.rank || index + 1}</span>
                                                    {item.title}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <Badge type={item.priority === 'CRITICAL' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'info'}>
                                                        {item.priority} Priority
                                                    </Badge>
                                                    <Badge type="neutral">{item.category}</Badge>
                                                </div>
                                            </div>
                                            <Badge type={item.confidence > 0.7 ? 'success' : 'warning'}>
                                                {(item.confidence * 100).toFixed(0)}% Confidence
                                            </Badge>
                                        </div>

                                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed whitespace-pre-wrap">
                                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-350 mb-1.5 uppercase tracking-wider">Description</h4>
                                            <p className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200/30 dark:border-slate-800/20">{item.description}</p>

                                            {item.code_example && item.code_example.trim() && (
                                                <>
                                                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-350 mt-4 mb-1.5 uppercase tracking-wider">Recommended Fix</h4>
                                                    <CodeBlock code={item.code_example} />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-500 text-sm">
                                    No ML recommendations available for this scan.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── AI Suggestions Display ── */}
                {!showMLSuggestions && data && (
                    <div className="space-y-6">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                {
                                    label: "Total Recommendations",
                                    value: data.suggestions_count || 0,
                                    color: "text-slate-900 dark:text-white"
                                },
                                {
                                    label: "Model Employed",
                                    value: data.model_used || "—",
                                    color: "text-indigo-600 dark:text-indigo-400",
                                    isText: true
                                },
                                {
                                    label: "Generation Timestamp",
                                    value: data.generated_at ? new Date(data.generated_at).toLocaleString() : 'Just now',
                                    color: "text-slate-600 dark:text-slate-400",
                                    isText: true
                                }
                            ].map((stat, i) => (
                                <div key={i} className="glass-card rounded-xl p-4 border border-slate-200/50 dark:border-slate-800/40">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{stat.label}</p>
                                    <p className={`font-extrabold ${stat.isText ? 'text-xs truncate' : 'text-2xl'} ${stat.color}`}>
                                        {stat.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Suggestions List */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">✨ AI Contextual Suggestions</h3>

                            {data.suggestions && data.suggestions.length > 0 ? (
                                data.suggestions.map((item, index) => (
                                    <div 
                                        key={index} 
                                        className="glass-card rounded-2xl p-5 border border-slate-200/50 dark:border-slate-800/40 hover:scale-[1.005] hover:shadow-md transition-all duration-300 bg-white/70 dark:bg-[#0b0f24]/70"
                                    >
                                        <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                                            <div>
                                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                    <span className="text-purple-500 font-extrabold">#{index + 1}</span> 
                                                    {item.masvs_title || 'Security Issue'}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <Badge type="info">{item.masvs_category || 'General'}</Badge>
                                                    <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono">MASVS ID: {item.vulnerability_id}</span>
                                                </div>
                                            </div>
                                            <div>
                                                {item.lightgbm_confidence !== undefined && item.lightgbm_confidence !== null ? (
                                                    <div className="text-right">
                                                        <Badge type={
                                                            item.lightgbm_confidence >= 0.8 ? 'success' :
                                                                item.lightgbm_confidence >= 0.5 ? 'warning' : 'danger'
                                                        }>
                                                            ML Priority: {(item.lightgbm_confidence * 100).toFixed(0)}%
                                                        </Badge>
                                                        {item.priority_rank && (
                                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Priority Rank #{item.priority_rank}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    getConfidenceBadge(item.confidence)
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-xs text-slate-650 dark:text-slate-405 leading-relaxed space-y-4">
                                            {item.analysis && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-805 dark:text-slate-350 mb-1.5 uppercase tracking-wider">Analysis & Explanation</h4>
                                                    <p className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200/30 dark:border-slate-800/20 whitespace-pre-wrap leading-relaxed">
                                                        {item.analysis}
                                                    </p>
                                                </div>
                                            )}

                                            <div>
                                                <h4 className="text-xs font-bold text-slate-805 dark:text-slate-350 mb-1.5 uppercase tracking-wider">Remediation Guidelines</h4>
                                                <p className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200/30 dark:border-slate-800/20 whitespace-pre-wrap leading-relaxed">
                                                    {item.enriched_recommendation || item.explanation || 'No detailed recommendation available.'}
                                                </p>
                                            </div>

                                            {(item.patch_code || item.suggested_patch) && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-805 dark:text-slate-350 mb-1.5 uppercase tracking-wider">Recommended Fix</h4>
                                                    <CodeBlock 
                                                        code={item.patch_code || item.suggested_patch} 
                                                        language={item.patch_language || 'java'} 
                                                    />
                                                </div>
                                            )}

                                            {item.references && item.references.length > 0 && (
                                                <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/40">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MASVS References:</span>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {item.references.map((ref, idx) => (
                                                            <a
                                                                key={idx}
                                                                href={ref}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline hover:text-indigo-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/50"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                                </svg>
                                                                Link #{idx + 1}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-500 text-sm">
                                    No detailed AI suggestions generated yet. Click "Regenerate AI" to initiate.
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </div>
    );
};

export default FixSuggestions;
