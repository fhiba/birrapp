package com.birrapp.bars

import kotlinx.serialization.Serializable

@Serializable
data class StylePriceDto(
    /**
     * Id del reporte vigente, null si esta birra no tiene precio cargado.
     *
     * La lista dejó de ser "los precios del bar" para ser "las birras del
     * bar": una birra puede tener notas y fotos sin precio vigente, por
     * ejemplo si un moderador bajó el reporte. Antes esas birras
     * desaparecían de la pantalla y sus fotos y notas quedaban inalcanzables
     * aunque siguieran en la base.
     */
    val id: Long?,
    val styleSlug: String,
    val styleName: String,
    /** null = el precio se cargó antes de que existieran las marcas. */
    val brandSlug: String?,
    val brandName: String?,
    val brandCraft: Boolean?,
    val price: Double?,
    val sizeMl: Int?,
    val ageDays: Int?,
    /** fresh <14d · aging 14-45d · stale >45d. Null sin precio. */
    val freshness: String?,
    // Nada de esto lleva valor por defecto a propósito: kotlinx no serializa
    // un campo que vale su default, y el frontend recibiría `undefined` donde
    // el tipo promete `number | null`.
    /**
     * Promedio real, el que se muestra. Con un solo voto de 5 esto dice 5,0.
     */
    val ratingRaw: Double?,
    /**
     * El mismo promedio empujado hacia la media global. Sirve para ordenar —un
     * 5,0 con un voto no puede ganarle a un 4,6 con cuarenta— pero NO para
     * mostrar: enseñarle 3,8 a alguien que acaba de poner cinco estrellas hace
     * que el número parezca roto, y con razón.
     */
    val ratingAvg: Double?,
    val ratingCount: Int,
    /** Días desde el último voto. La nota tampoco se muestra sin su edad. */
    val ratingAgeDays: Int?,
)

/** Lo mínimo que necesita un pin del mapa. Se manda esto y nada más. */
@Serializable
data class BarPinDto(
    val id: Long,
    val name: String,
    val lat: Double,
    val lng: Double,
    /** null = el bar no tiene ningún precio no-stale. */
    val fromPrice: Double?,
    val freshestAgeDays: Int?,
    val distanceMeters: Double?,
    /** Moneda del bar (ISO-4217). Sin esto, `fromPrice` es un número sin unidad. */
    val currency: String = com.birrapp.core.Currency.DEFAULT,
    /**
     * Promedio real de las birras del bar, ponderado por votos. El que se
     * muestra. Null = nadie votó nada ahí todavía.
     *
     * Viaja siempre y no sólo con `sort=rated`: ordenar por algo que no se ve
     * es pedirle a la gente que confíe en un ranking sin mostrarle el número
     * que lo arma. Son dos campos más por pin — con el tope de 200 de BIR-13,
     * unos pocos KB.
     */
    val rating: Double? = null,
    val ratingCount: Int = 0,
)

@Serializable
data class BarDetailDto(
    val id: Long,
    val name: String,
    val address: String?,
    val neighbourhood: String?,
    val lat: Double,
    val lng: Double,
    val status: String,
    val googlePlaceId: String? = null,
    val distanceMeters: Double?,
    val currency: String = com.birrapp.core.Currency.DEFAULT,
    val countryCode: String? = null,
    val prices: List<StylePriceDto>,
    val avgRating: Double?,
    val reviewCount: Int,
)

@Serializable
data class NewBarRequest(
    val name: String,
    val lat: Double,
    val lng: Double,
    val address: String? = null,
    val neighbourhood: String? = null,
    /**
     * Place ID de Google Maps, si el usuario eligió el bar del buscador.
     * Es lo único de Places que se puede guardar de forma permanente.
     */
    val googlePlaceId: String? = null,
    /**
     * País del lugar, ISO-3166-1 alfa-2. Lo devuelve Google al elegirlo del
     * buscador y es de dónde sale la moneda.
     */
    val countryCode: String? = null,
    /**
     * Moneda, si quien carga el bar la eligió a mano. Gana sobre la del país:
     * hay bares que cobran en dólares en países que no los usan.
     */
    val currency: String? = null,
)

enum class BarSort {
    distance,
    cheapest,
    /** Mejor puntuada. Ordena por la nota con shrinkage, no por la que se ve. */
    rated,
}
