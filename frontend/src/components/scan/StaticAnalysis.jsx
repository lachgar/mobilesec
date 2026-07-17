import React from 'react';
import Card from '../common/Card';
import Badge from '../common/Badge';

const InfoRow = ({ label, value, mono = false, colSpan = false }) => (
    <div className={colSpan ? 'md:col-span-2' : ''}>
        <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-1">{label}</dt>
        <dd className={`text-sm font-semibold text-slate-900 dark:text-white break-all ${mono ? 'font-mono text-xs text-slate-600 dark:text-slate-300' : ''}`}>
            {value || <span className="text-slate-400 dark:text-slate-600 font-normal italic">N/A</span>}
        </dd>
    </div>
);

const StaticAnalysis = ({ data }) => {
    if (!data) return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No static analysis data available.</p>
        </div>
    );

    const allPerms = data.permissions || [];
    const dangerousPerms = allPerms.filter(p => {
        if (typeof p === 'object') return p.is_dangerous || p.level === 'DANGEROUS';
        return p.includes('DANGEROUS') || p.includes('READ_CONTACTS') || p.includes('LOCATION');
    });
    const safePerms = allPerms.filter(p => !dangerousPerms.includes(p));

    return (
        <div className="space-y-5">
            <Card title="Application Info">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                    <InfoRow label="Package Name" value={data.package_name} />
                    <InfoRow label="Version" value={data.version_name ? `${data.version_name} (build ${data.version_code})` : data.version_code} />
                    <InfoRow label="Min SDK" value={data.min_sdk_version ? `API ${data.min_sdk_version}` : null} />
                    <InfoRow label="Target SDK" value={data.target_sdk_version ? `API ${data.target_sdk_version}` : null} />
                    <InfoRow label="File Size" value={data.file_size ? `${(data.file_size / 1024 / 1024).toFixed(2)} MB` : null} />
                    <InfoRow label="MD5" value={data.md5} mono />
                    <InfoRow label="SHA256" value={data.sha256} mono colSpan />
                </dl>
            </Card>

            <Card title={`Permissions (${allPerms.length})`}>
                {allPerms.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No permissions declared.</p>
                ) : (
                    <div className="space-y-4">
                        {dangerousPerms.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-2">{dangerousPerms.length} Dangerous</p>
                                <div className="space-y-1.5">
                                    {dangerousPerms.map((perm, i) => {
                                        const name = typeof perm === 'string' ? perm : perm.name;
                                        return (
                                            <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-rose-50 dark:bg-rose-500/5 border border-rose-200/50 dark:border-rose-500/10 rounded-lg">
                                                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all pr-3">{name}</span>
                                                <Badge type="danger">Dangerous</Badge>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {safePerms.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{safePerms.length} Normal</p>
                                <div className="space-y-1.5">
                                    {safePerms.map((perm, i) => {
                                        const name = typeof perm === 'string' ? perm : perm.name;
                                        return (
                                            <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/40 rounded-lg">
                                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all pr-3">{name}</span>
                                                <Badge type="neutral">Normal</Badge>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default StaticAnalysis;
