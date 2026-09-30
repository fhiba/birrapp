package com.birrapp.demo

import com.birrapp.core.Db
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.sql.Connection
import kotlin.random.Random
import kotlinx.serialization.Serializable

/**
 * Datos inventados para poder mirar la interfaz.
 *
 * ## Por qué existe esto y no un script
 *
 * `scripts/seed_osm.mjs` necesita la cadena de conexión de la base, y el
 * entorno de pruebas corre en Neon: quien quiera sembrarlo tiene que tener esa
 * credencial a mano. Esto hace lo mismo desde adentro del backend, que ya está
 * conectado, así que sembrar es tocar un botón y no repartir accesos a una
 * base.
 *
 * ## Los dos candados
 *
 * **1. Sólo existe si `SEED_DEMO` está en el entorno.** Sin la variable la ruta
 * no se registra: en producción no está caída ni protegida, directamente no
 * existe. Es la única defensa que no depende de que nadie se equivoque.
 *
 * **2. Sólo admin.** Por si la variable aparece donde no debe.
 *
 * ## Qué siembra, y por qué eso
 *
 * Bares con precios de **edades repartidas**, que es lo único que hace que la
 * interfaz se vea como se va a ver de verdad: con todo fresco, la mitad de la
 * app —los colores de frescura, el aviso de precios viejos, el orden "más
 * barata" que ignora los vencidos— no se puede mirar. Un seed que sólo siembra
 * datos lindos esconde justo lo que hay que revisar.
 *
 * Es aditivo y no borra nada: correrlo dos veces deja el doble de bares. Para
 * empezar de cero está `?limpiar=1`.
 */
@Serializable
data class SemillaDto(
    val bares: Int,
    val precios: Int,
    val notas: Int,
    val birras: Int,
    val socio: String?,
    val claveDelDueño: String?,
)

/** El centro de CABA. Los bares salen alrededor. */
private const val LAT = -34.6037
private const val LNG = -58.3816

private val NOMBRES = listOf(
    "Antares", "Rabieta", "Patagonia", "Temple", "Growlers", "Bierlife", "Strange",
    "Baum", "Astor", "Peñón", "Berlina", "Juguetes Perdidos", "On Tap", "Deldique",
    "Bunker", "Cervelar", "Malteada", "Barbarás", "Kiltro", "Nómade",
)
private val SUFIJOS = listOf(
    "Palermo", "Villa Crespo", "Chacarita", "Colegiales", "Almagro", "Caballito",
    "San Telmo", "Recoleta", "Belgrano", "Núñez", "Boedo", "Barracas",
)

class SemillaRepo(private val db: Db) {

    fun limpiar(): Unit = db.tx { c ->
        // Sólo lo sembrado. `osm_id` nulo y el prefijo del nombre es lo que
        // distingue un bar de demo de uno real: si alguna vez esto corre sobre
        // una base con datos de verdad, no se los lleva puestos.
        c.update(
            "DELETE FROM bars WHERE osm_id IS NULL AND name LIKE '[demo] %'",
        )
    }

    fun sembrar(adminId: Long, cuantos: Int = 60): SemillaDto = db.tx { c ->
        val r = Random(System.nanoTime())
        val estilos = c.query("SELECT id, slug FROM beer_styles WHERE active") { it.getLong("id") to it.getString("slug") }
        val marcas = c.query("SELECT id FROM brands WHERE status = 'approved' LIMIT 40") { it.getLong("id") }
        if (estilos.isEmpty()) return@tx SemillaDto(0, 0, 0, 0, null, null)

        var precios = 0
        var notas = 0
        val bares = mutableListOf<Long>()

        repeat(cuantos.coerceIn(1, 300)) { i ->
            // Repartidos en un disco de ~6 km. `sqrt` para que no se amontonen
            // en el centro: sin eso, la mitad de los bares cae en el 25% del
            // área y el mapa se ve como un borrón con las afueras vacías.
            val ang = r.nextDouble() * 2 * Math.PI
            val rad = Math.sqrt(r.nextDouble()) * 0.055
            val lat = LAT + rad * Math.cos(ang)
            val lng = LNG + rad * Math.sin(ang) / Math.cos(Math.toRadians(LAT))

            val nombre = "[demo] ${NOMBRES[i % NOMBRES.size]} ${SUFIJOS[r.nextInt(SUFIJOS.size)]}"
            val bar = c.queryOne(
                "INSERT INTO bars (name, location, status, address) " +
                    "VALUES (?, ST_MakePoint(?, ?)::geography, 'approved', ?) RETURNING id",
                nombre, lng, lat, "Calle Falsa ${100 + r.nextInt(2900)}",
            ) { it.getLong("id") }!!
            bares += bar

            // Uno de cada seis queda sin precio: en el mapa real los hay, y son
            // los que prueban el pin apagado y el "todavía nadie cargó acá".
            if (r.nextInt(6) == 0) return@repeat

            repeat(1 + r.nextInt(3)) {
                val (estiloId, _) = estilos[r.nextInt(estilos.size)]
                // Edades repartidas hasta 60 días: cubre fresco (<14), a medio
                // vencer (14-45) y vencido (>45), que son los tres estados que
                // la interfaz pinta distinto.
                val dias = r.nextInt(61)
                val precio = (6000 + r.nextInt(7000)).toDouble()
                c.update(
                    """
                    INSERT INTO price_reports
                        (bar_id, style_id, brand_id, price, size_ml, currency, reported_by, created_at)
                    VALUES (?, ?, ?, ?, ?, 'ARS', ?, now() - make_interval(days => ?))
                    """.trimIndent(),
                    bar, estiloId,
                    if (marcas.isEmpty() || r.nextInt(3) == 0) null else marcas[r.nextInt(marcas.size)],
                    precio, if (r.nextInt(5) == 0) 500 else 473, adminId, dias,
                )
                precios++
            }

            // Notas en la mitad: con todos puntuados, el orden "mejor puntuada"
            // no se distingue de cualquier otro.
            if (r.nextInt(2) == 0) {
                val (estiloId, _) = estilos[r.nextInt(estilos.size)]
                c.update(
                    "INSERT INTO beer_ratings (user_id, bar_id, style_id, rating, status, updated_at) " +
                        "VALUES (?, ?, ?, ?, 'active', now()) " +
                        "ON CONFLICT DO NOTHING",
                    adminId, bar, estiloId, 3.0 + r.nextInt(5) * 0.5,
                )
                notas++
            }
        }

        // Birras anotadas, para que la tabla de "quién tomó más por acá" tenga
        // algo. Días distintos a propósito: el tope diario es por día, así que
        // veinte en una noche se recortarían a quince.
        var birras = 0
        repeat(12) { i ->
            c.update(
                "INSERT INTO beer_logs (user_id, bar_id, qty, drank_at) " +
                    "VALUES (?, ?, ?, now() - make_interval(days => ?))",
                adminId, bares[r.nextInt(bares.size)], 1 + r.nextInt(3), i,
            )
            birras++
        }

        val socio = afiliar(c, bares.first(), r)
        SemillaDto(bares.size, precios, notas, birras, socio.first, socio.second)
    }

    /**
     * El primer bar entra al programa de puntos, con dueño y beneficios.
     *
     * Sin esto el portal no se puede abrir —no hay con qué entrar— y el
     * catálogo queda vacío, así que media PoC no se puede mirar.
     *
     * La clave se devuelve **una vez, en la respuesta**, y no se guarda en
     * ningún lado en claro. Es de demo y el entorno es de pruebas, pero la
     * costumbre de que una clave viaje una sola vez conviene no perderla.
     */
    private fun afiliar(c: Connection, barId: Long, r: Random): Pair<String, String> {
        val cuit = "30" + (100000000 + r.nextInt(800000000))
        val partner = c.queryOne(
            "INSERT INTO partner_bars (bar_id, cuit, legal_name, status) " +
                "VALUES (?, ?, 'Demo SRL', 'active') RETURNING id",
            barId, cuit.take(11),
        ) { it.getLong("id") }!!

        val clave = "demo" + (1000 + r.nextInt(9000))
        val mail = "duenio@demo.test"
        c.update(
            "INSERT INTO partner_staff (partner_id, email, password_hash, display_name, role) " +
                "VALUES (?, ?, ?, 'Dueño demo', 'owner')",
            partner, mail, com.birrapp.loyalty.hash(clave),
        )

        for ((titulo, costo) in listOf(
            "Una pinta de cortesía" to 300,
            "2x1 en la primera" to 500,
            "Picada para dos" to 900,
        )) {
            c.update(
                "INSERT INTO benefits (partner_id, title, cost_points, status) " +
                    "VALUES (?, ?, ?, 'active')",
                partner, titulo, costo,
            )
        }
        return mail to clave
    }
}
