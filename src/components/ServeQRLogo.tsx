import React from 'react';

interface ServeQRLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export const ServeQRLogo: React.FC<ServeQRLogoProps> = ({
  variant = 'dark',
  size = 'md',
  showTagline = false,
}) => {
  const iconDim = size === 'sm' ? 28 : size === 'lg' ? 40 : 32;
  const wordmarkClass =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  const textColor = variant === 'light' ? 'text-white' : 'text-[#172B4D]';
  const accentColor = variant === 'light' ? 'text-emerald-300' : 'text-[#087F5B]';
  const subColor = variant === 'light' ? 'text-slate-300' : 'text-slate-500';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="36"
          height="36"
          rx="9"
          fill={variant === 'light' ? '#087F5B' : '#172B4D'}
        />
        {/* Top-left QR finder pattern */}
        <rect x="6" y="6" width="9" height="9" rx="2" stroke="#FFFFFF" strokeWidth="2" />
        <rect x="9" y="9" width="3" height="3" rx="0.5" fill="#34D399" />
        {/* Top-right QR finder pattern */}
        <rect x="21" y="6" width="9" height="9" rx="2" stroke="#FFFFFF" strokeWidth="2" />
        <rect x="24" y="9" width="3" height="3" rx="0.5" fill="#FFFFFF" />
        {/* Bottom-left QR finder pattern */}
        <rect x="6" y="21" width="9" height="9" rx="2" stroke="#FFFFFF" strokeWidth="2" />
        <rect x="9" y="24" width="3" height="3" rx="0.5" fill="#FFFFFF" />
        {/* Bottom-right dining cloche / serving dome inside QR module */}
        <path
          d="M20 27.5H30.5"
          stroke="#34D399"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M21 25.5C21 22.8 22.9 21 25.25 21C27.6 21 29.5 22.8 29.5 25.5"
          stroke="#34D399"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="25.25" cy="19.3" r="1.2" fill="#34D399" />
      </svg>
      <span className="inline-flex flex-col leading-none">
        <span className={`font-display font-bold tracking-tight ${wordmarkClass} ${textColor}`}>
          Serve<span className={accentColor}>QR</span>
        </span>
        {showTagline && (
          <span className={`text-[11px] font-medium mt-0.5 ${subColor}`}>
            Scan. Order. Enjoy.
          </span>
        )}
      </span>
    </span>
  );
};
