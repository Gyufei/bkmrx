import { useRef, useEffect } from 'react';
import { Star } from 'lucide-react';

const STAR_STYLES = `
:root {
  --star-color: #f59e0b;
  --star-fill: 150ms;
  --star-pop: 350ms;
  --star-pop-ease: cubic-bezier(0.34, 1.96, 0.64, 1);
  --star-particle-dur: 600ms;
  --star-particle-dist: 20px;
  --star-particle-size: 2.5px;
  --star-ease: cubic-bezier(0.22, 1, 0.36, 1);
}

.t-star { color: currentColor; transition: color var(--star-fill) var(--star-ease); }
.t-star path {
  fill: transparent; stroke: currentColor;
  transition: fill var(--star-fill) var(--star-ease), stroke var(--star-fill) var(--star-ease);
}
.t-star-btn[data-starred="true"] .t-star { color: var(--star-color); }
.t-star-btn[data-starred="true"] .t-star path { fill: currentColor; }
.t-star-btn[data-starred="true"] .t-star-icon { animation: t-star-pop var(--star-pop) var(--star-pop-ease); }
@keyframes t-star-pop { 0% { transform: scale(1); } 30% { transform: scale(0.82); } 100% { transform: scale(1); } }

.t-star-particles { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; color: var(--star-color); }
.t-star-particles i {
  position: absolute;
  left: calc(var(--star-particle-size) * var(--psize, 1) / -2);
  top: calc(var(--star-particle-size) * var(--psize, 1) / -2);
  width: calc(var(--star-particle-size) * var(--psize, 1));
  height: calc(var(--star-particle-size) * var(--psize, 1));
  border-radius: 50%; background: currentColor; opacity: 0;
}
@keyframes t-star-burst {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.4); }
  20%  { opacity: 1; transform: translate(calc(var(--px) * 0.25), calc(var(--py) * 0.25)) scale(1); }
  100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(var(--p-end-scale, 0.6)); }
}
.t-star-btn.is-bursting .t-star-particles i {
  animation: t-star-burst var(--pdur, var(--star-particle-dur)) ease-out var(--pdelay, 0ms) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .t-star-icon, .t-star-particles i { animation: none !important; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('transitions-star')) {
  const style = document.createElement('style');
  style.id = 'transitions-star';
  style.textContent = STAR_STYLES;
  document.head.appendChild(style);
}

const DIST = 20;

interface StarButtonProps {
  starred: boolean;
  pending: boolean;
  onToggle(): void;
  className?: string;
  titleStarred?: string;
  titleUnstarred?: string;
}

export default function StarButton({
  starred,
  pending,
  onToggle,
  className = '',
  titleStarred = '取消星标',
  titleUnstarred = '添加星标',
}: StarButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const prevStarred = useRef(starred);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (starred && !prevStarred.current) {
      seedParticles(el);
      el.classList.remove('is-bursting');
      void el.offsetWidth;
      el.classList.add('is-bursting');
    } else if (!starred) {
      el.classList.remove('is-bursting');
    }
    prevStarred.current = starred;
  }, [starred]);

  const baseClass = starred
    ? 'text-amber-500 hover:bg-amber-500/10'
    : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-500/10';

  return (
    <button
      ref={ref}
      type="button"
      disabled={pending}
      aria-busy={pending}
      data-starred={starred}
      aria-pressed={starred}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`t-star-btn relative inline-flex items-center justify-center p-1.5 rounded-md transition-colors disabled:cursor-wait disabled:opacity-50 ${baseClass} ${className}`}
      title={starred ? titleStarred : titleUnstarred}
      aria-label={starred ? titleStarred : titleUnstarred}
    >
      <span className="t-star-icon">
        <Star className="t-star h-4 w-4" />
      </span>
      <span className="t-star-particles" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} />)}
      </span>
    </button>
  );
}

function seedParticles(el: HTMLButtonElement) {
  const dots = el.querySelectorAll('.t-star-particles i');
  dots.forEach((dot) => {
    const angle = (360 / dots.length) * Array.from(dots).indexOf(dot) + (Math.random() * 2 - 1) * 16;
    const mag = DIST * (0.68 + Math.random() * 0.5);
    const rad = (angle * Math.PI) / 180;
    const s = (dot as HTMLElement).style;
    s.setProperty('--px', `${(Math.cos(rad) * mag).toFixed(2)}px`);
    s.setProperty('--py', `${(Math.sin(rad) * mag).toFixed(2)}px`);
    s.setProperty('--pdur', `calc(var(--star-particle-dur) * ${(0.78 + Math.random() * 0.44).toFixed(3)})`);
    s.setProperty('--pdelay', `${Math.round(Math.random() * 70)}ms`);
    s.setProperty('--p-end-scale', (0.35 + Math.random() * 0.4).toFixed(2));
    s.setProperty('--psize', (0.6 + Math.random() * 0.8).toFixed(2));
  });
}
