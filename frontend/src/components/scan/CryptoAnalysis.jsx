import React from 'react';
import Card from '../common/Card';
import Badge from '../common/Badge';

const CryptoAnalysis = ({ data }) => {
    const vulns = data?.vulnerabilities || data?.results || [];

    if (!vulns || vulns.length === 0) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">No cryptographic issues found</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Strong cryptographic practices detected.</p>
                </div>
            </Card>
        );
    }

    const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const sorted = [...vulns].sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4));

    const sevStyles = {
        Critical: { border: 'border-rose-500', bg: 'bg-rose-50/50 dark:bg-rose-500/5', badge: 'danger', title: 'text-rose-600 dark:text-rose-400' },
        High:     { border: 'border-orange-500', bg: 'bg-orange-50/50 dark:bg-orange-500/5', badge: 'danger', title: 'text-orange-600 dark:text-orange-400' },
        Medium:   { border: 'border-amber-500', bg: 'bg-amber-50/50 dark:bg-amber-500/5', badge: 'warning', title: 'text-amber-600 dark:text-amber-400' },
        Low:      { border: 'border-sky-500', bg: 'bg-sky-50/50 dark:bg-sky-500/5', badge: 'info', title: 'text-sky-600 dark:text-sky-400' },
    };

    return (
        <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['Critical', 'High', 'Medium', 'Low'].map(sev => {
                    const count = vulns.filter(v => v.severity === sev).length;
                    const styles = sevStyles[sev];
                    return (
                        <div key={sev} className={`rounded-xl p-4 border-l-4 ${styles.border} border border-slate-200/40 dark:border-slate-800/40 bg-white dark:bg-slate-900/30`}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{sev}</p>
                            <p className={`text-2xl font-extrabold ${styles.title}`}>{count}</p>
                        </div>
                    );
                })}
            </div>

            <Card title={`Cryptographic Vulnerabilities (${vulns.length})`}>
                <div className="space-y-4">
                    {sorted.map((vuln, index) => {
                        const sev = vuln.severity || 'Medium';
                        const styles = sevStyles[sev] || sevStyles.Medium;
                        return (
                            <div key={index} className={`rounded-xl border-l-4 ${styles.border} ${styles.bg} border border-slate-200/40 dark:border-slate-800/30 overflow-hidden`}>
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <h4 className={`font-bold text-sm ${styles.title}`}>{vuln.type || 'Weak Cryptography'}</h4>
                                        <Badge type={styles.badge}>{sev}</Badge>
                                    </div>

                                    {vuln.description && (
                                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">{vuln.description}</p>
                                    )}

                                    {(vuln.code_snippet || vuln.file) && (
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3">
                                            {vuln.file && (
                                                <p className="text-[10px] font-mono text-slate-500 mb-2">{vuln.file}{vuln.line ? `:${vuln.line}` : ''}</p>
                                            )}
                                            {vuln.code_snippet && (
                                                <code className="text-xs font-mono text-rose-300 whitespace-pre-wrap break-all">{vuln.code_snippet}</code>
                                            )}
                                        </div>
                                    )}

                                    {vuln.recommendation && (
                                        <div className="flex items-start gap-2 mt-3 p-3 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/10 rounded-lg">
                                            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-xs text-emerald-700 dark:text-emerald-300">{vuln.recommendation}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
};

export default CryptoAnalysis;
