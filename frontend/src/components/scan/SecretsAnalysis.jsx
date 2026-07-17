import React, { useState } from "react";
import Card from "../common/Card";
import Badge from "../common/Badge";

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

const SecretsAnalysis = ({ data }) => {
    const [expanded, setExpanded] = useState({});
    const rawSecrets = data?.secrets || data?.results || data?.findings || [];

    // Deduplicate by rule name + file path + matched content
    const secrets = dedupeBy(rawSecrets, s => `${s.rule_name}||${s.file_path}||${s.matched_content}`);
    const dupeCount = rawSecrets.length - secrets.length;

    if (rawSecrets.length === 0) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">No secrets detected</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">The application code appears clean.</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary banner */}
            <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-200/50 dark:border-rose-500/15 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <p className="text-sm font-bold text-rose-700 dark:text-rose-400">
                        {secrets.length} unique secret{secrets.length !== 1 ? "s" : ""} found
                        {dupeCount > 0 && <span className="font-normal text-rose-600/70 dark:text-rose-500"> ({rawSecrets.length} total including duplicates)</span>}
                    </p>
                    <p className="text-xs text-rose-600/70 dark:text-rose-500">Exposed credentials pose a critical security risk. Rotate all affected keys immediately.</p>
                </div>
            </div>

            {/* Dedup notice */}
            {dupeCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/15 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>{dupeCount}</strong> duplicate entr{dupeCount === 1 ? "y" : "ies"} hidden — identical findings are grouped with a count badge.</span>
                </div>
            )}

            <Card title={`Detected Secrets (${secrets.length} unique)`}>
                <div className="space-y-3">
                    {secrets.map((secret, index) => (
                        <div key={index} className="border border-rose-200/50 dark:border-rose-500/10 bg-rose-50/50 dark:bg-rose-500/5 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setExpanded(e => ({ ...e, [index]: !e[index] }))}
                                className="w-full flex items-start justify-between p-4 text-left hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{secret.rule_name || "Secret Found"}</p>
                                        <p className="text-xs font-mono text-slate-500 dark:text-slate-500 mt-0.5 truncate max-w-sm">{secret.file_path || "Unknown file"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {secret._count > 1 && (
                                        <span className="text-[10px] font-bold bg-rose-200 dark:bg-rose-700/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">×{secret._count}</span>
                                    )}
                                    <Badge type="danger">Critical</Badge>
                                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded[index] ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>

                            {expanded[index] && secret.matched_content && (
                                <div className="px-4 pb-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Matched Content</p>
                                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto">
                                        <code className="text-xs font-mono text-rose-300 whitespace-pre-wrap break-all">{secret.matched_content}</code>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default SecretsAnalysis;
