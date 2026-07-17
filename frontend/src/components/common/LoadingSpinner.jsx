import React from 'react';

const LoadingSpinner = () => {
    return (
        <div className="flex flex-col justify-center items-center p-12 space-y-4">
            <div className="relative w-16 h-16">
                {/* Outer Ring */}
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 border-r-indigo-500 animate-spin" style={{ animationDuration: '1.2s' }}></div>
                
                {/* Inner Ring (Reverse Rotation) */}
                <div className="absolute inset-2 rounded-full border-2 border-emerald-500/10 border-b-emerald-500 border-l-emerald-500 animate-spin" style={{ animationDuration: '0.8s', animationDirection: 'reverse' }}></div>
                
                {/* Center glowing core */}
                <div className="absolute inset-5 bg-gradient-to-tr from-indigo-500 to-emerald-500 rounded-full animate-pulse blur-[1px]"></div>
            </div>
            <span className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase animate-pulse">
                Analyzing Bytecode...
            </span>
        </div>
    );
};

export default LoadingSpinner;
