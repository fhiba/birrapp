package com.birrapp.core

/**
 * País → moneda, y qué es una moneda válida.
 *
 * La lista es corta a propósito: son los países donde puede aparecer alguien
 * usando esto en el próximo año, no los 195 del mundo. Un país que no está
 * cae en el default de quien carga el bar, que puede corregirlo en el
 * formulario — y ahí nos enteramos de que hay que agregarlo.
 *
 * Vive en el servidor y no en el front por lo de siempre: dos copias de una
 * tabla se desincronizan, y el front igual necesita que el servidor valide.
 */
object Currency {

    /** ISO-3166-1 alfa-2 → ISO-4217. */
    private val BY_COUNTRY = mapOf(
        // Latinoamérica
        "AR" to "ARS", "UY" to "UYU", "CL" to "CLP", "BR" to "BRL", "PY" to "PYG",
        "BO" to "BOB", "PE" to "PEN", "CO" to "COP", "MX" to "MXN", "EC" to "USD",
        "VE" to "USD", "CR" to "CRC", "PA" to "USD", "GT" to "GTQ", "CU" to "CUP",
        "DO" to "DOP",
        // Europa: la zona euro entera cae en EUR
        "ES" to "EUR", "PT" to "EUR", "FR" to "EUR", "IT" to "EUR", "DE" to "EUR",
        "AT" to "EUR", "NL" to "EUR", "BE" to "EUR", "IE" to "EUR", "GR" to "EUR",
        "FI" to "EUR", "EE" to "EUR", "LV" to "EUR", "LT" to "EUR", "SK" to "EUR",
        "SI" to "EUR", "HR" to "EUR", "LU" to "EUR", "MT" to "EUR", "CY" to "EUR",
        "GB" to "GBP", "CH" to "CHF", "NO" to "NOK", "SE" to "SEK", "DK" to "DKK",
        "PL" to "PLN", "CZ" to "CZK", "HU" to "HUF", "RO" to "RON", "BG" to "BGN",
        "IS" to "ISK",
        // El resto que aparece seguido
        "US" to "USD", "CA" to "CAD", "AU" to "AUD", "NZ" to "NZD", "JP" to "JPY",
        "KR" to "KRW", "CN" to "CNY", "IN" to "INR", "TH" to "THB", "VN" to "VND",
        "ZA" to "ZAR", "IL" to "ILS", "TR" to "TRY", "MA" to "MAD", "EG" to "EGP",
    )

    /** Toda moneda que alguien puede elegir a mano. Es el set de valores de arriba. */
    val KNOWN: Set<String> = BY_COUNTRY.values.toSet()

    const val DEFAULT = "ARS"

    /** Moneda de un país, o null si no está en la lista. */
    fun ofCountry(code: String?): String? =
        code?.trim()?.uppercase()?.let { BY_COUNTRY[it] }

    /**
     * Normaliza lo que llega del cliente. Devuelve null si no es una moneda
     * que conozcamos: quien llama decide si eso es un error o un default.
     */
    fun normalize(raw: String?): String? =
        raw?.trim()?.uppercase()?.takeIf { it in KNOWN }
}
