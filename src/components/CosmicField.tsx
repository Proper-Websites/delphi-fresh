import { useMemo } from "react";

interface CosmicFieldProps {
  enabled: boolean;
}

export function CosmicField({ enabled }: CosmicFieldProps) {
  const stars = useMemo(
    () =>
      Array.from({ length: 520 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() > 0.82 ? (Math.random() > 0.55 ? 2.4 : 2) : 1,
        twinkle: Math.random() * 4.8,
      })),
    []
  );

  if (!enabled) return null;

  return (
    <div className="cosmic-field pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {stars.map((star) => (
        <span
          key={star.id}
          className="cosmic-star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.twinkle}s`,
          }}
        />
      ))}
    </div>
  );
}
