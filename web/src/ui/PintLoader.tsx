/**
 * Pinta llenándose. Misma idea que en Android: la espera existe porque se
 * está resolviendo la ubicación, y si el usuario va a mirar algo unos
 * segundos que sea algo de la app.
 *
 * El líquido va en `--birra` y no en el acento. Es la única ilustración de la
 * app —todo lo demás que lleva color es un dato o un control— y con el acento
 * en hueso quedaba líquido blanco debajo de espuma blanca: un vaso vacío.
 */
export function PintLoader({ message }: { message: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: 'var(--base)', zIndex: 20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <svg width="58" height="76" viewBox="0 0 58 76" aria-hidden>
          <defs>
            <clipPath id="glass">
              <path d="M11 2 L47 2 L43 68 Q42.5 74 36 74 L22 74 Q15.5 74 15 68 Z" />
            </clipPath>
          </defs>
          <g clipPath="url(#glass)">
            <rect x="0" y="0" width="58" height="76" fill="var(--film-1)" />
            <g>
              <rect x="0" width="58" height="76" fill="var(--birra)" y="60">
                <animate attributeName="y" values="66;12;66" dur="3.8s"
                  calcMode="spline" keySplines=".4 0 .2 1;.4 0 .2 1" repeatCount="indefinite" />
              </rect>
              <rect x="0" width="58" height="5" fill="#FFFFFF" y="60">
                <animate attributeName="y" values="66;12;66" dur="3.8s"
                  calcMode="spline" keySplines=".4 0 .2 1;.4 0 .2 1" repeatCount="indefinite" />
              </rect>
            </g>
            {[[22, 0], [34, 1.1], [28, 2.2]].map(([cx, delay], i) => (
              <circle key={i} cx={cx} r="1.8" fill="rgba(255,255,255,.45)" cy="70">
                <animate attributeName="cy" values="70;30" dur="1.9s"
                  begin={`${delay}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;.7;0" dur="1.9s"
                  begin={`${delay}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
          <path d="M11 2 L47 2 L43 68 Q42.5 74 36 74 L22 74 Q15.5 74 15 68 Z"
            fill="none" stroke="rgba(244,245,247,.55)" strokeWidth="2" />
        </svg>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', marginTop: 16 }}>{message}</p>
      </div>
    </div>
  )
}
