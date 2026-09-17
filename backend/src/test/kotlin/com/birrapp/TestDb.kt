package com.birrapp

import com.birrapp.core.Db
import com.birrapp.core.update
import java.sql.Connection

/**
 * Tests contra un PostGIS real (contenedor `db_test`, puerto 5434), no H2.
 *
 * H2 no tiene PostGIS, ni `DISTINCT ON`, ni tipos ENUM, ni
 * `percentile_cont`. O sea: justo todo lo que hay que testear. Un test que
 * pasa en H2 y falla en producción es peor que no tener test.
 */
object TestDb {
    val db: Db by lazy {
        val d = Db.connect(
            System.getenv("TEST_DATABASE_URL") ?: "jdbc:postgresql://localhost:5434/birrapp_test",
            System.getenv("TEST_DATABASE_USER") ?: "birrapp",
            System.getenv("TEST_DATABASE_PASSWORD") ?: "birrapp_test",
        )
        d.migrate()
        d
    }

    /**
     * Limpia todo menos los vocabularios (estilos y marcas).
     *
     * `brands` referencia a `users`, así que el TRUNCATE CASCADE de usuarios
     * se la lleva puesta aunque no esté en la lista. Por eso se vuelve a
     * sembrar acá: si no, los tests que usan marcas fallan con "marca
     * desconocida" y el motivo no es evidente.
     *
     * Desde V14 `beer_styles` también tiene `created_by`, así que cae por lo
     * mismo y se resiembra igual. Si una migración agrega un estilo nuevo hay
     * que agregarlo acá: es el precio de resembrar a mano, el mismo que ya se
     * paga con las marcas.
     */
    fun reset() {
        db.conn { c ->
            c.createStatement().use {
                it.execute(
                    "TRUNCATE flags, reviews, price_reports, refresh_tokens, bars, users " +
                        "RESTART IDENTITY CASCADE"
                )
            }
            c.createStatement().use {
                it.execute(
                    """
                    INSERT INTO beer_styles (slug, name_es, sort_order) VALUES
                        ('rubia','Rubia / Golden',10), ('ipa','IPA',20),
                        ('apa','APA',30), ('roja','Roja / Irish Red',40),
                        ('negra','Negra',50), ('stout','Stout',60),
                        ('porter','Porter',70), ('honey','Honey',80),
                        ('scottish','Scottish',90), ('kolsch','Kölsch',100),
                        ('trigo','Trigo / Weisse',110), ('lager','Lager',120),
                        ('ipa-negra','IPA Negra',130), ('sin-alcohol','Sin alcohol',200)
                    ON CONFLICT (slug) DO UPDATE SET status = 'approved', active = true
                    """.trimIndent()
                )
            }
            c.createStatement().use {
                it.execute(
                    """
                    INSERT INTO brands (slug, name, craft) VALUES
                        ('antares','Antares',true),
                        ('berlina','Berlina',true),
                        ('juguetes-perdidos','Juguetes Perdidos',true),
                        ('quilmes','Quilmes',false)
                    ON CONFLICT (slug) DO NOTHING
                    """.trimIndent()
                )
            }
        }
    }

    /**
     * Limpia sólo el tráfico.
     *
     * Va aparte de `reset()` porque `traffic_sessions` no referencia a nadie:
     * no la arrastra el TRUNCATE CASCADE de usuarios, y los tests de tráfico
     * no necesitan resembrar vocabularios.
     */
    fun resetTraffic() {
        db.conn { c -> c.createStatement().use { it.execute("TRUNCATE traffic_sessions") } }
    }

    fun styleId(c: Connection, slug: String): Long =
        c.prepareStatement("SELECT id FROM beer_styles WHERE slug = ?").use { st ->
            st.setString(1, slug)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }

    fun insertUser(name: String = "test", role: String = "user"): Long = db.conn { c ->
        c.prepareStatement(
            "INSERT INTO users (google_sub, email, display_name, role) " +
                "VALUES (?, ?, ?, ?::user_role) RETURNING id"
        ).use { st ->
            st.setString(1, "sub-$name-${System.nanoTime()}")
            st.setString(2, "$name@test.local")
            st.setString(3, name)
            st.setString(4, role)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    fun insertBar(
        name: String, lat: Double, lng: Double, status: String = "approved", createdBy: Long? = null
    ): Long =
        db.conn { c ->
            c.prepareStatement(
                "INSERT INTO bars (name, location, status, created_by) " +
                    "VALUES (?, ST_MakePoint(?, ?)::geography, ?::moderation_status, ?) RETURNING id"
            ).use { st ->
                st.setString(1, name); st.setDouble(2, lng); st.setDouble(3, lat)
                st.setString(4, status)
                if (createdBy != null) st.setLong(5, createdBy) else st.setNull(5, java.sql.Types.BIGINT)
                st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
            }
        }

    /**
     * Fuerza la moneda de un bar ya insertado.
     *
     * `insertBar` escribe la fila a mano y no pasa por `BarRepo.create`, así
     * que se queda con el default 'ARS'. Para los tests de moneda hace falta
     * poder decir "este bar cobra en euros" sin simular el alta entera.
     */
    fun setCurrency(barId: Long, currency: String) = db.conn {
        it.update("UPDATE bars SET currency = ? WHERE id = ?", currency, barId)
    }

    /**
     * Inserta un precio con fecha retroactiva, para poder probar la frescura.
     *
     * La moneda se copia del bar, igual que hace `PriceRepo.report`. Si acá se
     * dejara el default de la columna, un bar en libras tendría precios
     * guardados en pesos: los tests estarían probando un estado que la app no
     * puede producir, y todo lo que filtra por moneda —outliers, stats— daría
     * resultados que no significan nada.
     */
    fun insertPrice(
        barId: Long, styleSlug: String, price: Double, daysAgo: Int,
        userId: Long, sizeMl: Int = 473, isConfirmation: Boolean = false,
    ): Long = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO price_reports " +
                "(bar_id, style_id, price, size_ml, currency, reported_by, created_at, " +
                " is_confirmation) " +
                "VALUES (?, ?, ?, ?, (SELECT currency FROM bars WHERE id = ?), ?, " +
                "        now() - make_interval(days => ?), ?) RETURNING id"
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setDouble(3, price)
            st.setInt(4, sizeMl); st.setLong(5, barId); st.setLong(6, userId)
            st.setInt(7, daysAgo); st.setBoolean(8, isConfirmation)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    /** Puntúa una birra de un bar, para los tests que filtran u ordenan por nota. */
    fun rate(barId: Long, styleSlug: String, rating: Double, userId: Long) = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO beer_ratings (bar_id, style_id, user_id, rating) VALUES (?, ?, ?, ?)",
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setLong(3, userId)
            st.setBigDecimal(4, java.math.BigDecimal.valueOf(rating))
            st.executeUpdate()
        }
    }

    /** Inserta una foto de bar. */
    fun insertPhoto(barId: Long, styleSlug: String, userId: Long): Long = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO bar_photos (bar_id, style_id, user_id, object_key) " +
                "VALUES (?, ?, ?, ?) RETURNING id"
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setLong(3, userId)
            st.setString(4, "test-photo-${System.nanoTime()}.jpg")
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }
}
