import React, { useState } from "react";
import Card from "../common/Card";
import Badge from "../common/Badge";

// Deduplicate array by a key function, returning items with a `_count` field
const dedupeBy = (arr, keyFn) => {
    const map = new Map();
    arr.forEach(item => {
        const key = keyFn(item);
        if (map.has(key)) {
            map.get(key)._count++;
        } else {
            map.set(key, { ...item, _count: 1 });
        }
    });
    return Array.from(map.values());
};

// Map backend severity (uppercase) to badge type
const severityToBadge = (sev = "") => {
    const s = sev.toUpperCase();
    if (s === "CRITICAL" || s === "HIGH") return "danger";
    if (s === "MEDIUM") return "warning";
    return "info";
};

// Border/bg colors per severity
const severityStyle = (sev = "") => {
    const s = sev.toUpperCase();
    if (s === "CRITICAL" || s === "HIGH") return {
        border: "border-rose-500",
        bg: "bg-rose-50/50 dark:bg-rose-500/5",
        badge: "danger"
    };
    if (s === "MEDIUM") return {
        border: "border-amber-500",
        bg: "bg-amber-50/50 dark:bg-amber-500/5",
        badge: "warning"
    };
    return {
        border: "border-sky-500",
        bg: "bg-sky-50/50 dark:bg-sky-500/5",
        badge: "info"
    };
};

// Format issue type string: "INSECURE_HTTP" → "Insecure HTTP"
const formatType = (type = "") =>
    type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const PAGE_SIZE = 50;

const NetworkAnalysis = ({ data }) => {
    const [page, setPage] = useState(0);
    const [filterSev, setFilterSev] = useState("ALL");
    const [filterType, setFilterType] = useState("ALL");

    // ── Data extraction ──────────────────────────────────────────────────────
    const analysis      = data?.analysis || {};
    const rawIssues     = Array.isArray(analysis.security_issues) ? analysis.security_issues : (Array.isArray(analysis.issues) ? analysis.issues : []);
    const tlsAnalysis   = analysis.tls_analysis || {};
    const secScore      = analysis.security_score || {};
    const summary       = analysis.summary || {};
    const warnings      = analysis.warnings || [];
    const totalFindings = data?.findings_count ?? rawIssues.length;

    // Severity & type breakdowns from backend (or compute locally)
    const sevBreakdown  = summary.severity_breakdown || {};
    const typeBreakdown = summary.type_breakdown || {};

    // Deduplicate issues by type + file + detail
    const dedupedIssues = dedupeBy(rawIssues, i => `${i.type}||${i.file}||${i.detail}`);

    // ── Empty state ──────────────────────────────────────────────────────────
    if (rawIssues.length === 0 && !data?.findings_count) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">No network issues detected</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">The application appears network-secure or inactive.</p>
                </div>
            </Card>
        );
    }

    // ── Unique types for filter ──────────────────────────────────────────────
    const uniqueTypes = ["ALL", ...Array.from(new Set(dedupedIssues.map(i => i.type).filter(Boolean)))];
    const severities  = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

    // ── Filtered & paginated ─────────────────────────────────────────────────
    const filtered = dedupedIssues.filter(i => {
        const sevMatch  = filterSev  === "ALL" || (i.severity || "").toUpperCase() === filterSev;
        const typeMatch = filterType === "ALL" || i.type === filterType;
        return sevMatch && typeMatch;
    });
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const highCount     = dedupedIssues.filter(i => ["HIGH","CRITICAL"].includes((i.severity||"").toUpperCase())).length;
    const mediumCount   = dedupedIssues.filter(i => (i.severity||"").toUpperCase() === "MEDIUM").length;
    const dupeCount     = rawIssues.length - dedupedIssues.length;

    // ── Security score color ─────────────────────────────────────────────────
    const scoreColor = secScore.score >= 80 ? "text-emerald-500"
        : secScore.score >= 50 ? "text-amber-500"
        : "text-rose-500";

    return (
        <div className="space-y-5">

            {/* ── Warnings banner ── */}
            {warnings.length > 0 && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">{warnings[0]}</span>
                </div>
            )}

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    {
                        label: "Total Issues",
                        value: totalFindings,
                        color: totalFindings > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    },
                    {
                        label: "High / Critical",
                        value: highCount,
                        color: highCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    },
                    {
                        label: "Medium",
                        value: mediumCount,
                        color: mediumCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                    },
                    {
                        label: "Security Score",
                        value: secScore.score != null ? `${secScore.score} (${secScore.grade || "?"})` : "—",
                        color: scoreColor
                    },
                ].map((stat, i) => (
                    <div key={i} className="glass-card rounded-xl p-4 border border-slate-200/50 dark:border-slate-800/40">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{stat.label}</p>
                        <p className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* ── TLS / Security header summary ── */}
            {(tlsAnalysis.total_issues > 0 || tlsAnalysis.outdated_tls_count > 0) && (
                <Card title="TLS Analysis">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: "Total TLS Issues", value: tlsAnalysis.total_issues || 0 },
                            { label: "Outdated TLS", value: tlsAnalysis.outdated_tls_count || 0 },
                            { label: "Missing Security Headers", value: tlsAnalysis.missing_security_headers_count || 0 },
                            { label: "Insecure Cookies", value: tlsAnalysis.insecure_cookies_count || 0 },
                        ].map((s, i) => (
                            <div key={i} className="rounded-xl p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{s.label}</p>
                                <p className={`text-xl font-extrabold ${s.value > 0 ? "text-rose-500" : "text-emerald-500"}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ── Type breakdown ── */}
            {Object.keys(typeBreakdown).length > 0 && (
                <Card title="Issue Types Breakdown">
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(typeBreakdown).map(([type, count]) => (
                            <div key={type} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200/40 dark:border-slate-700/40">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatType(type)}</span>
                                <span className="text-xs font-bold text-rose-500">{count}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ── Dupe notice ── */}
            {dupeCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 rounded-xl text-xs text-slate-500">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>{dupeCount}</strong> duplicate entr{dupeCount === 1 ? "y" : "ies"} hidden — identical issues are grouped.</span>
                </div>
            )}

            {/* ── Issues list ── */}
            {dedupedIssues.length > 0 && (
                <Card title={`Security Issues (${dedupedIssues.length} unique / ${rawIssues.length} total)`}>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {/* Severity filter */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Severity:</span>
                            {severities.map(s => (
                                <button
                                    key={s}
                                    onClick={() => { setFilterSev(s); setPage(0); }}
                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                                        filterSev === s
                                            ? "bg-indigo-600 text-white border-indigo-600"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/50 dark:border-slate-700/40 hover:border-indigo-400"
                                    }`}
                                >{s}</button>
                            ))}
                        </div>
                        {/* Type filter */}
                        {uniqueTypes.length > 2 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Type:</span>
                                {uniqueTypes.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => { setFilterType(t); setPage(0); }}
                                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                                            filterType === t
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/50 dark:border-slate-700/40 hover:border-indigo-400"
                                        }`}
                                    >{t === "ALL" ? "ALL" : formatType(t)}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Result count */}
                    {(filterSev !== "ALL" || filterType !== "ALL") && (
                        <p className="text-xs text-slate-400 mb-3">Showing {filtered.length} of {dedupedIssues.length} issues</p>
                    )}

                    {/* Issue cards */}
                    <div className="space-y-3">
                        {paginated.map((issue, idx) => {
                            const style = severityStyle(issue.severity);
                            const title = formatType(issue.type) || issue.description || "Security Issue";
                            const fileName = issue.file ? issue.file.split("/").pop() : null;
                            return (
                                <div key={idx} className={`rounded-xl p-4 border-l-4 ${style.border} ${style.bg} border border-slate-200/40 dark:border-slate-800/40`}>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{title}</h4>
                                                {issue._count > 1 && (
                                                    <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">×{issue._count}</span>
                                                )}
                                            </div>
                                            {issue.description && (
                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{issue.description}</p>
                                            )}
                                            {issue.detail && issue.detail !== issue.description && (
                                                <p className="mt-1.5 text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900/50 px-2 py-1 rounded break-all">{issue.detail}</p>
                                            )}
                                            {fileName && (
                                                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 truncate" title={issue.file}>
                                                    📄 {fileName}
                                                </p>
                                            )}
                                            {issue.recommendation && (
                                                <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-start gap-1">
                                                    <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    {issue.recommendation}
                                                </p>
                                            )}
                                        </div>
                                        <Badge type={style.badge}>{issue.severity || "INFO"}</Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200/40 dark:border-slate-800/40">
                            <p className="text-xs text-slate-400">
                                Page {page + 1} / {totalPages} — {filtered.length} issues
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/40 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                >← Prev</button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/40 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                >Next →</button>
                            </div>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default NetworkAnalysis;
