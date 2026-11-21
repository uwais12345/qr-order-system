import React from 'react';
import type { Restaurant } from '../domain/types';

interface RestaurantBrandAvatarProps {
  restaurant: Pick<Restaurant, 'name' | 'logoText' | 'logoColor' | 'logoImageUrl'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<RestaurantBrandAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-md text-[11px]',
  sm: 'w-8 h-8 rounded-lg text-xs',
  md: 'w-9 h-9 rounded-lg text-xs',
  lg: 'w-12 h-12 rounded-xl text-base',
  xl: 'w-16 h-16 rounded-2xl text-xl',
};

export const RestaurantBrandAvatar: React.FC<RestaurantBrandAvatarProps> = ({
  restaurant,
  size = 'md',
  className = '',
}) => {
  const sizeCls = SIZE_CLASSES[size];

  if (restaurant.logoImageUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden bg-white border border-slate-200/90 shrink-0 ${sizeCls} ${className}`}
      >
        <img
          src={restaurant.logoImageUrl}
          alt={`${restaurant.name} logo`}
          className="w-full h-full object-cover"
          loading="eager"
          decoding="sync"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center text-white font-display font-bold shrink-0 select-none ${sizeCls} ${className}`}
      style={{ backgroundColor: restaurant.logoColor || '#087F5B' }}
      aria-label={`${restaurant.name} initials`}
    >
      {restaurant.logoText || restaurant.name.slice(0, 2).toUpperCase()}
    </span>
  );
};
