package com.birrapp.core

/**
 * Cuántos bares puede devolver `/bars` en un pedido.
 *
 * ## Por qué es tan grande como la base entera
 *
 * Esto valía 200, y **el radio del mapa mentía**. Los bares vuelven ordenados
 * por distancia, así que un tope de filas se come los de afuera: con el radio
 * en 7,2 km desde Palermo hay 526 bares en rango, y el usuario veía los 200 más
 * cercanos. Un bar a 4,7 km —dentro del radio pedido, con 377 bares más cerca
 * que él— simplemente no aparecía. Desde afuera eso no se lee como un tope, se
 * lee como que el bar no está cargado.
 *
 * Un control que promete un radio tiene que devolver ese radio completo. Y como
 * el slider llega a 15 km, que desde cualquier punto de la ciudad abarca
 * prácticamente todo lo cargado, el único número que no miente es uno del
 * tamaño de la base.
 *
 * ## Qué se pierde, y por qué se puede perder
 *
 * BIR-13 había bajado el tope a 200 para que un solo pedido no se llevara la
 * mitad de la base. La defensa real contra la extracción nunca fue ésta:
 * [CoverageBudget] cuenta bares **distintos** por día justamente porque un tope
 * de filas no separa al usuario del scraper — el scraper pide menos filas que
 * alguien paseando el mapa. El tope de filas era la parte del mecanismo que no
 * defendía nada y sí rompía el producto.
 *
 * La relación que hay que mantener sigue siendo
 * **`MAX_BARES_POR_PEDIDO` < [CoverageBudget.DEFAULT_PER_DAY]**: si un pedido
 * lleno no entrara en el presupuesto de un día, el endpoint quedaría
 * irrespondible para cualquiera desde el primer toque. `CoverageBudgetTest` lo
 * verifica leyendo estas dos constantes, no copias de sus valores.
 */
const val MAX_BARES_POR_PEDIDO = 1_000
