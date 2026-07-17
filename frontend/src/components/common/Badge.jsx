import React from 'react';

const Badge = ({ type = 'info', children }) => {
    const normalizedType = type === 'safe' ? 'success' : type === 'critical' ? 'danger' : type;

    const styles = {
        success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.05)]',
        warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-450 border-amber-500/20 dark:border-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.05)]',
        danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-450 border-rose-500/20 dark:border-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.05)]',
        info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 dark:border-sky-500/10 shadow-[0_0_8px_rgba(14,165,233,0.05)]',
        neutral: 'bg-slate-200/50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-300/50 dark:border-slate-700/50',
    };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide uppercase ${styles[normalizedType] || styles.info}`}>
            {children}
        </span>
    );
};

export default Badge;
