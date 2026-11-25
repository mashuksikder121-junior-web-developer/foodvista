import React, { useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export const FoodImage: React.FC<FoodImageProps> = ({ src, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#171717] via-neutral-800 to-[#F97316]/30 text-white/80 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="h-8 w-8 text-[#F97316]" />
        <span className="mt-2 max-w-[85%] truncate px-2 text-xs font-medium text-neutral-300">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
