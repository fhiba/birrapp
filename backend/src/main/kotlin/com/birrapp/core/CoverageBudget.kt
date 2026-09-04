package com.birrapp.core

import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Cuántos bares **distintos** puede llegar a ver una IP en un día.
 *
 * ## Por qué no es una cuota de filas
 *
 * El intento obvio —limitar filas por día— no sirve acá, porque **el scraper
 * es más eficiente que el cliente real**. Bajarse la base entera son dos
 * requests de 200 filas; un usuario que pasea el mapa por su barrio pide miles
 * de filas por día, porque `useBars` sobre-pide y vuelve a consultar con cada
 * radio, cada estilo y cada zona nueva. Cualquier cuota holgada para el usuario
 * le sobra al scraper varias veces.
 *
 * Lo que sí los separa es la **cobertura**. El usuario mira siempre los mismos
 * doscientos bares; el scraper quiere la unión de todos, por definición. Contar
 * ids distintos en vez de filas invierte la asimetría: repetir es gratis para
 * siempre, y lo único que se paga es territorio nuevo.
 *
 * De ahí la consecuencia práctica: **pedir lo mismo dos veces nunca cuesta**,
 * así que a quien usa la app no se le rompe nada aunque recargue todo el día.
 * Lo que se agota es descubrir base nueva.
 *
 * ## Por qué en memoria y no en una tabla
 *
 * La clave es la IP. En `traffic_sessions` se decidió a propósito no guardar ni
 * IP ni hash de IP —en criterio europeo un hash de IP sigue siendo dato
 * personal—, y esa decisión no se revisa por esto. Acá la IP no se persiste, no
 * se loguea y no sobrevive a un reinicio: vive en este mapa y nada más, igual
 * que el balde del `RateLimit` de Ktor que ya está instalado.
 *
 * El costo es que un redeploy le devuelve el presupuesto a todo el mundo. Para
 * defenderse de extracción sostenida da igual: quien quiera aprovecharlo tiene
 * que adivinar cuándo se reinicia el servidor.
 *
 * ## APAGADO por defecto desde 2026-09-04
 *
 * Estuvo prendido menos de un día y rompió la app para gente real: alguien en
 * otra ciudad, en otra red, abrió el mapa y recibió un 429 que se lo dejó
 * vacío. No es que viera bares viejos: `/bars` falla entero y no queda nada.
 *
 * **Por qué falló no está confirmado, y eso es parte del problema.** Dos
 * candidatos, y el segundo es peor:
 *
 * 1. El número. Con `MAX_LIMIT` en 200, **dos consultas de zonas distintas
 *    gastan los 400**, y pasear el mapa por una ciudad densa son varias
 *    consultas en el primer minuto. El cálculo que justificaba el 400 —"un
 *    barrio son doscientos bares y repetirlos es gratis"— era correcto sobre
 *    repetir y equivocado sobre explorar, que es lo que hace cualquiera que
 *    abre la app por primera vez.
 * 2. **Que la clave no distinga a nadie.** Si detrás del proxy de Railway
 *    `origin.remoteHost` devuelve siempre lo mismo, esto no era una cuota por
 *    IP sino una cuota global, y el primero que paseaba el mapa se la gastaba
 *    para todos. Eso explicaría a alguien en otra red recibiendo el 429 sin
 *    haber pedido casi nada — y, si es así, **el `RateLimit` de 120/min de
 *    `Application.kt` tiene el mismo problema y sigue encendido**.
 *
 * Antes de volver a prender esto hay que medir cuál de las dos era. Encender
 * con un número más grande sin saberlo es repetir el incidente más tarde.
 *
 * Se enciende con `COVERAGE_BUDGET_PER_DAY`.
 *
 * ## Límites conocidos, dichos y no escondidos
 *
 * - **Una IP no es una persona.** Una oficina detrás de un NAT comparte
 *   presupuesto. Por eso [DEFAULT_PER_DAY] es varias veces la base entera y no
 *   un número ajustado.
 * - **Rotar IPs lo saltea.** Con un pool de proxies esto no defiende nada. No
 *   es prevención, es fricción: sube el costo de la extracción sostenida, que
 *   es lo único defendible en un mapa que se mira sin cuenta.
 * - **El desalojo por LRU devuelve presupuesto.** Requiere empujar la entrada
 *   fuera del mapa con tráfico de [maxKeys] IPs distintas, que es más caro que
 *   simplemente rotar la IP.
 */
class CoverageBudget(
    private val perDay: Int = DEFAULT_PER_DAY,
    /**
     * Cuántas IPs se siguen a la vez.
     *
     * El peor caso de memoria es `maxKeys × perDay` ids boxeados, unos 45 MB
     * con los valores por defecto — y ése es el caso en que dos mil IPs
     * distintas agotaron su presupuesto el mismo día. El caso real son
     * kilobytes: la enorme mayoría de las entradas tiene menos de cien ids.
     */
    private val maxKeys: Int = DEFAULT_MAX_KEYS,
    /** Inyectable para poder testear el corte de día sin esperar a mañana. */
    private val today: () -> LocalDate = { LocalDate.now(ZoneOffset.UTC) },
) {
    private class Seen(var day: LocalDate) {
        val ids = HashSet<Long>()
    }

    /**
     * `accessOrder = true` más [LinkedHashMap.removeEldestEntry] es un LRU: al
     * pasarse de [maxKeys] se cae la IP que hace más tiempo no aparece, que es
     * la que menos probable es que esté extrayendo algo ahora.
     */
    private val byKey = object : LinkedHashMap<String, Seen>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Seen>) =
            size > maxKeys
    }

    /** Con el presupuesto en 0 esto no hace nada: ni cobra ni recuerda. */
    val enabled: Boolean get() = perDay > 0

    /**
     * Cobra el pedido y dice si entra en el presupuesto del día.
     *
     * Devuelve `false` **sin cobrar nada**: un pedido rechazado no consume
     * presupuesto, así que rebotar contra el techo no empeora la situación de
     * quien lo tocó por accidente. Los ids que ya se habían servido no se
     * cobran de nuevo, así que un pedido repetido siempre entra.
     *
     * `@Synchronized` porque Ktor atiende cada request en su propio hilo y
     * [LinkedHashMap] no es concurrente — y encima acá `get` escribe, porque
     * el orden de acceso es parte de la estructura.
     */
    @Synchronized
    fun charge(key: String, ids: Collection<Long>): Boolean {
        if (!enabled) return true
        val seen = byKey.getOrPut(key) { Seen(today()) }
        // Corte de día: se reusa la entrada en vez de borrarla para no perder
        // su lugar en el LRU.
        val now = today()
        if (seen.day != now) {
            seen.day = now
            seen.ids.clear()
        }

        val fresh = ids.count { it !in seen.ids }
        if (seen.ids.size + fresh > perDay) return false
        seen.ids.addAll(ids)
        return true
    }

    /** Cuántos bares distintos lleva vistos hoy esta clave. Para tests. */
    @Synchronized
    fun spent(key: String): Int {
        val seen = byKey[key] ?: return 0
        return if (seen.day == today()) seen.ids.size else 0
    }

    companion object {
        /**
         * El número que se usó cuando esto estuvo encendido, conservado para
         * los tests y para tener contra qué comparar cuando se revise.
         *
         * **No es el default del servidor**: ése lo pone `Config` y es 0. Y no
         * alcanzaba: dos consultas de 200 lo gastaban. Ver la sección
         * "APAGADO" de arriba.
         */
        const val DEFAULT_PER_DAY = 400

        const val DEFAULT_MAX_KEYS = 2_000
    }
}
