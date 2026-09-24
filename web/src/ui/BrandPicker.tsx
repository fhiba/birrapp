import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../data/api'
import type { Brand } from '../data/types'
import { AgregarOtro, SectionLabel, Vocablo } from './Kit'
import { t } from '../i18n'

/**
 * La grilla del vocabulario. El mismo `minmax(104px, 1fr)` que usa la
 * elección de estilo: las dos pantallas son el mismo paso y tienen que
 * respirar igual.
 */
const GRILLA = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
  gap: 'var(--s-2) var(--s-4)',
  padding: '4px 16px',
} as const

/**
 * Selector de marca.
 *
 * Va después del estilo y no antes por una razón de uso: quien carga un precio
 * sabe siempre si es rubia o IPA, y no siempre de qué marca. Primero lo que se
 * sabe seguro; la marca queda como un paso opcional que se puede saltear.
 *
 * "Sin marca" es una opción de primera clase y no un vacío. Hay bares donde la
 * birra no tiene marca declarada, y forzar a elegir una haría que la gente
 * invente. Una birra sin marca es una birra concreta, con su precio y su nota.
 */
export function BrandPicker({
  brands, value, onChange, onCreated,
}: {
  brands: Brand[]
  value: string | null
  onChange: (slug: string | null) => void
  /** Una marca nueva no está en `brands` todavía: el padre la agrega. */
  onCreated: (b: Brand) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = brands.find(b => b.slug === value) ?? null

  return (
    <>
      {/* Compacto y alineado a la izquierda, no una barra de ancho completo.
          Con ancho completo competía visualmente con el monto, que es lo único
          que esta pantalla tiene que hacer grande.

          Deja de ser una cápsula y pasa a vestirse de campo —`--raised` con
          filete—, que es lo que es: un control que abre una lista. La cápsula
          rellena de acento se leía como un botón de acción, y con el acento en
          hueso encima competía con el CTA de la hoja. La flecha va en `--info`
          porque es lo estructural: dice "esto se despliega", no es el dato. */}
      <button
        onClick={() => setOpen(true)}
        className="lbl"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          minHeight: 44, padding: 'var(--s-2) var(--s-3)',
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
          background: 'var(--raised)', border: '1px solid var(--hairline)',
          color: selected ? 'var(--cream)' : 'var(--muted)',
        }}
      >
        {selected ? selected.name : t('BrandPicker.sinMarca')}
        <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden style={{ color: 'var(--info)' }}>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <BrandSheet
          brands={brands} value={value}
          onClose={() => setOpen(false)}
          onPick={slug => { onChange(slug); setOpen(false) }}
          onCreated={b => { onCreated(b); onChange(b.slug); setOpen(false) }}
        />
      )}
    </>
  )
}

/**
 * La lista, a pantalla completa.
 *
 * Era una hoja anclada abajo y estaba rota de dos formas a la vez. Se abre
 * desde la pantalla de carga de precio, que es `fixed` con `z-index: 70`,
 * mientras la hoja usaba 60: quedaba tapada. Y aunque no lo estuviera, un
 * panel pegado al borde inferior con un campo de texto adentro es lo que peor
 * se lleva con el teclado de iOS, que lo empuja fuera de la pantalla.
 *
 * A pantalla completa las dos cosas desaparecen: el buscador queda arriba,
 * fijo, y lo único que se mueve es la lista.
 */
function BrandSheet(p: {
  brands: Brand[]
  value: string | null
  onClose: () => void
  onPick: (slug: string | null) => void
  onCreated: (b: Brand) => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90, background: 'var(--base)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
    }}>
      <BrandList {...p} onBack={p.onClose} />
    </div>
  )
}

/**
 * El cuerpo: buscador, alta y lista.
 *
 * Vive aparte de la cáscara porque lo usan dos cosas con posicionamiento
 * distinto — esta hoja a pantalla completa y el paso 2 del flujo de carga de
 * precio. Duplicarlo significaría dos altas de marca que se van separando.
 */
export function BrandList({
  brands, value, onBack, onPick, onCreated, allowNone = true,
}: {
  brands: Brand[]
  value: string | null
  onBack: () => void
  onPick: (slug: string | null) => void
  onCreated: (b: Brand) => void
  /** "Sin marca" como opción. Siempre, salvo que quien llame diga lo contrario. */
  allowNone?: boolean
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Cerrar con Escape: en escritorio es el gesto natural y acá no hay fondo
  // que tocar para salir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const typed = q.trim()
  const shown = useMemo(() => {
    const needle = norm(typed)
    return needle ? brands.filter(b => norm(b.name).includes(needle)) : brands
  }, [brands, typed])

  // Sólo si lo escrito no coincide con algo que ya existe: sin esto la
  // pantalla ofrece crear "Antares" teniendo Antares en la lista, que es justo
  // el duplicado que el vocabulario controlado viene a evitar.
  const canCreate = typed.length >= 2 && !brands.some(b => norm(b.name) === norm(typed))

  const create = async () => {
    setBusy(true); setError(null)
    try {
      // `craft: true` por defecto: lo que falta en la lista es casi siempre
      // una cervecería chica, no una industrial. Un moderador lo corrige.
      onCreated(await api.createBrand(typed, true))
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const craft = shown.filter(b => b.craft)
  const industrial = shown.filter(b => !b.craft)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <button onClick={onBack} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label={t('comun.cancelar')}>←</button>
        <input
          ref={input}
          value={q} onChange={e => setQ(e.target.value)}
          // Enter da de alta lo escrito. Es la tecla que sigue naturalmente a
          // escribir un nombre que no está en la lista, y sin esto no hacía
          // nada: había que ver el botón de arriba y tocarlo, o lo tecleado se
          // perdía al salir del paso.
          onKeyDown={e => { if (e.key === 'Enter' && canCreate && !busy) create() }}
          placeholder={t('BrandPicker.buscar')} maxLength={60}
          autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{
            flex: 1, minWidth: 0, padding: '12px 12px', borderRadius: 'var(--r-2)',
            background: 'var(--raised)', border: '1px solid var(--hairline)',
            fontFamily: 'inherit', fontSize: 'var(--t-field)', color: 'inherit',
          }}
        />
      </header>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', margin: '0 16px' }}>{error}</p>
      )}

      {/* Agregar va arriba y no al final de la lista: si escribiste algo que no
          está, bajar treinta marcas para encontrar el botón es justo lo que
          hace que la gente abandone y cargue el precio sin marca. */}
      {canCreate && (
        <div style={{ padding: '12px 16px' }}>
          <button disabled={busy} onClick={create} className="lbl" style={{
            width: '100%', minHeight: 46, padding: 'var(--s-3)',
            borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            background: busy ? 'var(--elevated)' : 'var(--acento)',
            color: busy ? 'var(--faint)' : 'var(--base)',
          }}>{busy ? '…' : t('BrandPicker.agregarNueva', { nombre: typed })}</button>
          {/* El aviso de vocabulario nuevo, en ámbar y no en gris: es lo mismo
              que pasa con un precio a revisión, y merece el mismo tono. En
              `--faint` era un pie de página que nadie leía, y lo que dice es
              justamente que la marca entra igual — que es lo que destraba a
              quien se frena porque la suya no está. */}
          <p style={{
            color: 'var(--aging)', fontSize: 'var(--t-1)', margin: '8px 0 0', lineHeight: 1.5,
          }}>
            {t('BrandPicker.nueva', { nombre: typed })}
          </p>
        </div>
      )}

      {/*
        La misma forma que la elección de estilo: una grilla de palabras con
        filete, no una lista de renglones con tilde.

        Eran dos pantallas del mismo paso —"qué birra estás cargando"— vestidas
        distinto: la de estilos, una grilla de palabras; la de marcas, treinta
        renglones apilados con un ✓ a la derecha. Elegir marca se sentía otro
        trámite en vez de la segunda mitad del mismo. Y la grilla además entra
        de a tres o cuatro por renglón, así que las marcas que antes había que
        scrollear ahora se ven de una.

        Lo que se queda tal cual: el buscador arriba, "Sin marca" como opción de
        primera clase, y el corte entre artesanales e industriales.
      */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px 24px' }}>
        {!typed && allowNone && (
          <>
            <SectionLabel>{t('BrandPicker.sinMarca')}</SectionLabel>
            <div style={{ ...GRILLA }}>
              <Vocablo
                label={t('BrandPicker.noLaSe')} centrado on={value === null}
                onClick={() => onPick(null)}
              />
            </div>
          </>
        )}

        {craft.length > 0 && <SectionLabel>{t('BrandPicker.artesanales')}</SectionLabel>}
        {craft.length > 0 && (
          <div style={{ ...GRILLA }}>
            {craft.map(b => (
              <Vocablo key={b.slug} label={b.name} centrado
                on={value === b.slug} onClick={() => onPick(b.slug)} />
            ))}
          </div>
        )}

        {industrial.length > 0 && <SectionLabel>{t('BrandPicker.industriales')}</SectionLabel>}
        {industrial.length > 0 && (
          <div style={{ ...GRILLA }}>
            {industrial.map(b => (
              <Vocablo key={b.slug} label={b.name} centrado
                on={value === b.slug} onClick={() => onPick(b.slug)} />
            ))}
          </div>
        )}

        {/* La salida, con el mismo vestido que en estilos: cápsula punteada en
            ámbar. Acá el alta se hace escribiendo arriba, así que el botón
            lleva el foco al buscador en vez de abrir un campo propio — un
            segundo lugar donde escribir el nombre serían dos formas de dar de
            alta la misma marca. */}
        {!canCreate && (
          <div style={{ ...GRILLA, marginTop: 'var(--s-4)' }}>
            <AgregarOtro
              label={typed ? t('BrandPicker.seguiEscribiendo') : t('BrandPicker.otra')} on={false}
              onClick={() => input.current?.focus()}
            />
          </div>
        )}

        {shown.length === 0 && !canCreate && (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', padding: '12px 16px' }}>
            {t('BrandPicker.dosLetras')}
          </p>
        )}
      </div>
    </div>
  )
}
