import React from 'react';
import {
  Coffee,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import {
  BRAND_PALETTES,
  type StoreLogoIconKey,
  type StoreThemePaletteKey,
} from '../types/models';
import { generateStoreInitials } from '../lib/formatters';

interface DynamicStoreLogoProps {
  storeName: string;
  logoIconKey?: StoreLogoIconKey;
  logoBase64?: string;
  themePaletteKey?: StoreThemePaletteKey;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-4 h-4', text: 'text-xs' },
  md: { box: 'w-11 h-11 rounded-xl', icon: 'w-5 h-5', text: 'text-sm' },
  lg: { box: 'w-14 h-14 rounded-2xl', icon: 'w-6 h-6', text: 'text-base' },
  xl: { box: 'w-20 h-20 rounded-2xl', icon: 'w-8 h-8', text: 'text-xl' },
};

export const STORE_ICON_OPTIONS: Array<{ key: StoreLogoIconKey; label: string }> = [
  { key: 'STORE', label: 'Toko' },
  { key: 'CART', label: 'Minimarket' },
  { key: 'COFFEE', label: 'Kafe' },
  { key: 'FOOD', label: 'Kuliner' },
  { key: 'BAG', label: 'Butik' },
  { key: 'SPARK', label: 'Jasa' },
];

export function renderStoreIconGlyph(key: StoreLogoIconKey, className: string) {
  switch (key) {
    case 'CART':
      return <ShoppingCart className={className} />;
    case 'COFFEE':
      return <Coffee className={className} />;
    case 'FOOD':
      return <UtensilsCrossed className={className} />;
    case 'BAG':
      return <ShoppingBag className={className} />;
    case 'SPARK':
      return <Sparkles className={className} />;
    case 'STORE':
    default:
      return <Store className={className} />;
  }
}

export const DynamicStoreLogo: React.FC<DynamicStoreLogoProps> = ({
  storeName,
  logoIconKey = 'STORE',
  logoBase64,
  themePaletteKey = 'EMERALD',
  size = 'md',
  className = '',
}) => {
  const palette = BRAND_PALETTES[themePaletteKey] || BRAND_PALETTES.EMERALD;
  const dims = SIZE_MAP[size];

  if (logoBase64) {
    const src = logoBase64.startsWith('data:')
      ? logoBase64
      : `data:image/jpeg;base64,${logoBase64}`;
    return (
      <div
        className={`${dims.box} overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${className}`}
      >
        <img
          src={src}
          alt={storeName || 'Logo Toko'}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const initials = generateStoreInitials(storeName);

  return (
    <div
      className={`${dims.box} shrink-0 flex flex-col items-center justify-center text-white font-bold select-none shadow-sm ${className}`}
      style={{
        background: `linear-gradient(135deg, ${palette.primary}, ${palette.secondary})`,
      }}
      aria-label={storeName || 'Logo Toko'}
    >
      {size === 'sm' ? (
        renderStoreIconGlyph(logoIconKey, dims.icon)
      ) : (
        <div className="flex flex-col items-center justify-center leading-none gap-0.5">
          {renderStoreIconGlyph(logoIconKey, dims.icon)}
          <span className={`${dims.text} font-bold tracking-tight opacity-90`}>
            {initials}
          </span>
        </div>
      )}
    </div>
  );
};
