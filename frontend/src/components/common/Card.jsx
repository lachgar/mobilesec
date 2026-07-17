import React from 'react';

const Card = ({ children, className = '', title, action }) => {
    return (
        <div className={`glass-card rounded-2xl p-6 ${className}`}>
            {(title || action) && (
                <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                    {title && <h3 className="text-base font-bold text-slate-950 dark:text-slate-100 tracking-tight">{title}</h3>}
                    {action && <div className="flex items-center">{action}</div>}
                </div>
            )}
            <div className="text-slate-800 dark:text-slate-300">
                {children}
            </div>
        </div>
    );
};

export default Card;
